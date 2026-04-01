package expo.modules.feedparser

import android.util.Xml
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.xmlpull.v1.XmlPullParser
import org.xmlpull.v1.XmlPullParserException
import java.io.StringReader
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.concurrent.TimeUnit

class FeedParserModule : Module() {
  private val client = OkHttpClient.Builder()
    .connectTimeout(30, TimeUnit.SECONDS)
    .readTimeout(30, TimeUnit.SECONDS)
    .followRedirects(true)
    .followSslRedirects(true)
    .build()

  private val dateFormats = listOf(
    SimpleDateFormat("EEE, dd MMM yyyy HH:mm:ss Z", Locale.US),
    SimpleDateFormat("EEE, dd MMM yyyy HH:mm:ss zzz", Locale.US),
    SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssZ", Locale.US),
    SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSZ", Locale.US),
    SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX", Locale.US),
  )

  override fun definition() = ModuleDefinition {
    Name("FeedParser")

    AsyncFunction("parseFeed") Coroutine { feedUrl: String ->
      withContext(Dispatchers.IO) {
        val xml = fetchFeed(feedUrl)
        parseFeedXml(xml)
      }
    }
  }

  private fun fetchFeed(url: String): String {
    val request = Request.Builder()
      .url(url)
      .header("User-Agent", "Pegycast/1.0")
      .header("Accept", "application/rss+xml, application/xml, text/xml, */*")
      .build()
    val response = client.newCall(request).execute()
    return response.body?.string() ?: throw Exception("Empty response from $url")
  }

  private fun parseFeedXml(xml: String): Map<String, Any?> {
    val parser = Xml.newPullParser()
    parser.setFeature(XmlPullParser.FEATURE_PROCESS_NAMESPACES, false)
    parser.setInput(StringReader(xml))

    var channelTitle = ""
    var channelDescription = ""
    var channelAuthor = ""
    var channelImageUrl = ""
    val episodes = mutableListOf<Map<String, Any?>>()

    var inChannel = false
    var inItem = false
    var inImage = false
    var currentTag = ""
    var textBuffer = StringBuilder()

    // Current item fields
    var itemTitle = ""
    var itemDescription = ""
    var itemPubDate = ""
    var itemDuration = ""
    var itemAudioUrl = ""
    var itemFileSize = 0L
    var itemImageUrl = ""

    var itemCount = 0

    while (parser.eventType != XmlPullParser.END_DOCUMENT) {
      when (parser.eventType) {
        XmlPullParser.START_TAG -> {
          val tag = parser.name
          textBuffer = StringBuilder()

          when {
            tag == "channel" -> inChannel = true
            tag == "item" && inChannel -> {
              inItem = true
              itemTitle = ""
              itemDescription = ""
              itemPubDate = ""
              itemDuration = ""
              itemAudioUrl = ""
              itemFileSize = 0L
              itemImageUrl = ""
            }
            tag == "image" && inChannel && !inItem -> inImage = true
            tag == "enclosure" && inItem -> {
              itemAudioUrl = parser.getAttributeValue(null, "url") ?: ""
              val length = parser.getAttributeValue(null, "length")
              itemFileSize = length?.toLongOrNull() ?: 0L
            }
            tag == "itunes:image" -> {
              val href = parser.getAttributeValue(null, "href") ?: ""
              if (inItem) {
                itemImageUrl = href
              } else if (inChannel && !inItem) {
                if (channelImageUrl.isEmpty()) channelImageUrl = href
              }
            }
          }
          currentTag = tag
        }

        XmlPullParser.TEXT -> {
          textBuffer.append(parser.text)
        }

        XmlPullParser.END_TAG -> {
          val tag = parser.name
          val text = textBuffer.toString().trim()

          when {
            tag == "item" && inItem -> {
              if (itemAudioUrl.isNotEmpty() && itemCount < 50) {
                episodes.add(mapOf(
                  "title" to (itemTitle.ifEmpty { "Untitled" }),
                  "description" to stripHtml(itemDescription),
                  "audioUrl" to itemAudioUrl,
                  "imageUrl" to itemImageUrl.ifEmpty { channelImageUrl },
                  "publishedAt" to parseDate(itemPubDate),
                  "duration" to parseDuration(itemDuration),
                  "fileSize" to itemFileSize,
                ))
                itemCount++
              }
              inItem = false
            }
            tag == "image" -> inImage = false
            tag == "channel" -> inChannel = false
          }

          if (inItem) {
            when (currentTag) {
              "title" -> if (tag == "title") itemTitle = text
              "description" -> if (tag == "description") itemDescription = text
              "itunes:summary" -> if (tag == "itunes:summary" && itemDescription.isEmpty()) itemDescription = text
              "pubDate" -> if (tag == "pubDate") itemPubDate = text
              "itunes:duration" -> if (tag == "itunes:duration") itemDuration = text
            }
          } else if (inChannel) {
            when {
              tag == "title" && channelTitle.isEmpty() -> channelTitle = text
              tag == "description" && channelDescription.isEmpty() -> channelDescription = stripHtml(text)
              tag == "itunes:author" && channelAuthor.isEmpty() -> channelAuthor = text
              tag == "managingEditor" && channelAuthor.isEmpty() -> channelAuthor = text
              tag == "url" && inImage && channelImageUrl.isEmpty() -> channelImageUrl = text
            }
          }
        }
      }
      parser.next()
    }

    return mapOf(
      "title" to channelTitle,
      "description" to channelDescription,
      "author" to channelAuthor,
      "imageUrl" to channelImageUrl,
      "episodes" to episodes,
    )
  }

  private fun parseDate(dateStr: String): Double {
    if (dateStr.isEmpty()) return System.currentTimeMillis().toDouble()
    for (format in dateFormats) {
      try {
        return format.parse(dateStr)?.time?.toDouble() ?: continue
      } catch (_: Exception) {
        continue
      }
    }
    return System.currentTimeMillis().toDouble()
  }

  private fun parseDuration(duration: String): Double {
    if (duration.isEmpty()) return 0.0
    duration.toDoubleOrNull()?.let { return it }
    val parts = duration.split(":").mapNotNull { it.toIntOrNull() }
    return when (parts.size) {
      3 -> (parts[0] * 3600 + parts[1] * 60 + parts[2]).toDouble()
      2 -> (parts[0] * 60 + parts[1]).toDouble()
      1 -> parts[0].toDouble()
      else -> 0.0
    }
  }

  private fun stripHtml(html: String): String {
    return html
      .replace(Regex("<br\\s*/?>"), "\n")
      .replace(Regex("<p\\s*>"), "\n")
      .replace(Regex("</p>"), "\n")
      .replace(Regex("<[^>]+>"), "")
      .replace("&amp;", "&")
      .replace("&lt;", "<")
      .replace("&gt;", ">")
      .replace("&quot;", "\"")
      .replace("&#39;", "'")
      .replace("&apos;", "'")
      .replace("&#x27;", "'")
      .replace("&nbsp;", " ")
      .replace(Regex("\n{3,}"), "\n\n")
      .trim()
  }
}