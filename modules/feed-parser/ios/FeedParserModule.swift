import ExpoModulesCore
import Foundation

public class FeedParserModule: Module {
  public func definition() -> ModuleDefinition {
    Name("FeedParser")

    AsyncFunction("parseFeed") { (feedUrl: String) async throws -> [String: Any] in
      let xml = try await self.fetchFeed(url: feedUrl)
      return self.parseFeedXml(xml)
    }
  }

  private func fetchFeed(url: String) async throws -> String {
    guard let url = URL(string: url) else {
      throw NSError(domain: "FeedParser", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid URL"])
    }
    let (data, _) = try await URLSession.shared.data(from: url)
    guard let xml = String(data: data, encoding: .utf8) else {
      throw NSError(domain: "FeedParser", code: 2, userInfo: [NSLocalizedDescriptionKey: "Failed to decode response"])
    }
    return xml
  }

  private func parseFeedXml(_ xml: String) -> [String: Any] {
    guard let data = xml.data(using: .utf8) else {
      return ["title": "", "imageUrl": "", "episodes": []]
    }
    let delegate = FeedParserDelegate()
    let parser = XMLParser(data: data)
    parser.delegate = delegate
    parser.parse()
    return [
      "title": delegate.channelTitle,
      "description": delegate.channelDescription,
      "author": delegate.channelAuthor,
      "imageUrl": delegate.channelImageUrl,
      "episodes": delegate.episodes,
    ]
  }
}

private class FeedParserDelegate: NSObject, XMLParserDelegate {
  var channelTitle = ""
  var channelDescription = ""
  var channelAuthor = ""
  var channelImageUrl = ""
  var episodes: [[String: Any]] = []

  private var inChannel = false
  private var inItem = false
  private var inImage = false
  private var currentElement = ""
  private var textBuffer = ""

  private var itemTitle = ""
  private var itemDescription = ""
  private var itemPubDate = ""
  private var itemDuration = ""
  private var itemAudioUrl = ""
  private var itemFileSize: Int64 = 0
  private var itemImageUrl = ""
  private var itemCount = 0

  private static let dateFormatters: [DateFormatter] = {
    let formats = [
      "EEE, dd MMM yyyy HH:mm:ss Z",
      "EEE, dd MMM yyyy HH:mm:ss zzz",
      "yyyy-MM-dd'T'HH:mm:ssZ",
      "yyyy-MM-dd'T'HH:mm:ss.SSSZ",
      "yyyy-MM-dd'T'HH:mm:ssXXX",
    ]
    return formats.map { format in
      let formatter = DateFormatter()
      formatter.dateFormat = format
      formatter.locale = Locale(identifier: "en_US_POSIX")
      return formatter
    }
  }()

  func parser(_ parser: XMLParser, didStartElement elementName: String,
              namespaceURI: String?, qualifiedName qName: String?,
              attributes: [String: String] = [:]) {
    currentElement = elementName
    textBuffer = ""

    switch elementName {
    case "channel":
      inChannel = true
    case "item" where inChannel:
      inItem = true
      itemTitle = ""
      itemDescription = ""
      itemPubDate = ""
      itemDuration = ""
      itemAudioUrl = ""
      itemFileSize = 0
      itemImageUrl = ""
    case "image" where inChannel && !inItem:
      inImage = true
    case "enclosure" where inItem:
      itemAudioUrl = attributes["url"] ?? ""
      itemFileSize = Int64(attributes["length"] ?? "") ?? 0
    case "itunes:image":
      let href = attributes["href"] ?? ""
      if inItem {
        itemImageUrl = href
      } else if inChannel && !inItem && channelImageUrl.isEmpty {
        channelImageUrl = href
      }
    default:
      break
    }
  }

  func parser(_ parser: XMLParser, foundCharacters string: String) {
    textBuffer += string
  }

  func parser(_ parser: XMLParser, didEndElement elementName: String,
              namespaceURI: String?, qualifiedName qName: String?) {
    let text = textBuffer.trimmingCharacters(in: .whitespacesAndNewlines)

    if elementName == "item" && inItem {
      if !itemAudioUrl.isEmpty && itemCount < 50 {
        episodes.append([
          "title": itemTitle.isEmpty ? "Untitled" : itemTitle,
          "description": stripHtml(itemDescription),
          "audioUrl": itemAudioUrl,
          "imageUrl": itemImageUrl.isEmpty ? channelImageUrl : itemImageUrl,
          "publishedAt": parseDate(itemPubDate),
          "duration": parseDuration(itemDuration),
          "fileSize": itemFileSize,
        ])
        itemCount += 1
      }
      inItem = false
      return
    }

    if elementName == "image" { inImage = false; return }
    if elementName == "channel" { inChannel = false; return }

    if inItem {
      switch elementName {
      case "title": itemTitle = text
      case "description": itemDescription = text
      case "itunes:summary" where itemDescription.isEmpty: itemDescription = text
      case "pubDate": itemPubDate = text
      case "itunes:duration": itemDuration = text
      default: break
      }
    } else if inChannel {
      if elementName == "title" && channelTitle.isEmpty {
        channelTitle = text
      } else if elementName == "description" && channelDescription.isEmpty {
        channelDescription = stripHtml(text)
      } else if elementName == "itunes:author" && channelAuthor.isEmpty {
        channelAuthor = text
      } else if elementName == "managingEditor" && channelAuthor.isEmpty {
        channelAuthor = text
      } else if elementName == "url" && inImage && channelImageUrl.isEmpty {
        channelImageUrl = text
      }
    }
  }

  private func parseDate(_ dateStr: String) -> Double {
    if dateStr.isEmpty { return Date().timeIntervalSince1970 * 1000 }
    for formatter in Self.dateFormatters {
      if let date = formatter.date(from: dateStr) {
        return date.timeIntervalSince1970 * 1000
      }
    }
    return Date().timeIntervalSince1970 * 1000
  }

  private func parseDuration(_ duration: String) -> Double {
    if duration.isEmpty { return 0 }
    if let num = Double(duration) { return num }
    let parts = duration.split(separator: ":").compactMap { Int($0) }
    switch parts.count {
    case 3: return Double(parts[0] * 3600 + parts[1] * 60 + parts[2])
    case 2: return Double(parts[0] * 60 + parts[1])
    case 1: return Double(parts[0])
    default: return 0
    }
  }

  private func stripHtml(_ html: String) -> String {
    var result = html
    result = result.replacingOccurrences(of: "<br\\s*/?>", with: "\n", options: .regularExpression)
    result = result.replacingOccurrences(of: "<p\\s*>", with: "\n", options: .regularExpression)
    result = result.replacingOccurrences(of: "</p>", with: "\n")
    result = result.replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
    result = result.replacingOccurrences(of: "&amp;", with: "&")
    result = result.replacingOccurrences(of: "&lt;", with: "<")
    result = result.replacingOccurrences(of: "&gt;", with: ">")
    result = result.replacingOccurrences(of: "&quot;", with: "\"")
    result = result.replacingOccurrences(of: "&#39;", with: "'")
    result = result.replacingOccurrences(of: "&apos;", with: "'")
    result = result.replacingOccurrences(of: "&#x27;", with: "'")
    result = result.replacingOccurrences(of: "&nbsp;", with: " ")
    result = result.replacingOccurrences(of: "\n{3,}", with: "\n\n", options: .regularExpression)
    return result.trimmingCharacters(in: .whitespacesAndNewlines)
  }
}