package expo.modules.mediasession

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import android.support.v4.media.MediaMetadataCompat
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.net.URL
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class MediaSessionModule : Module() {
  private var mediaSession: MediaSessionCompat? = null
  private var notificationManager: NotificationManager? = null
  private var cachedArtwork: Bitmap? = null
  private var cachedArtworkUrl: String? = null
  private var serviceRunning = false

  companion object {
    const val CHANNEL_ID = "podcast_playback"
    const val NOTIFICATION_ID = 1
  }

  override fun definition() = ModuleDefinition {
    Name("MediaSession")

    Events("onMediaCommand")

    OnCreate {
      val context = appContext.reactContext ?: return@OnCreate
      createNotificationChannel(context)
      setupMediaSession(context)
    }

    OnDestroy {
      appContext.reactContext?.let { stopPlaybackService(it) }
      mediaSession?.release()
      mediaSession = null
    }

    Function("updateNowPlaying") { info: Map<String, Any?> ->
      val context = appContext.reactContext ?: return@Function
      val title = info["title"] as? String ?: ""
      val artist = info["artist"] as? String ?: ""
      val artworkUrl = info["artwork"] as? String ?: ""
      val duration = ((info["duration"] as? Number)?.toDouble() ?: 0.0)
      val position = ((info["position"] as? Number)?.toDouble() ?: 0.0)
      val isPlaying = info["isPlaying"] as? Boolean ?: false

      val metadata = MediaMetadataCompat.Builder()
        .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
        .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
        .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, (duration * 1000).toLong())
        .build()
      mediaSession?.setMetadata(metadata)

      updatePlaybackStateInternal(isPlaying, position)

      CoroutineScope(Dispatchers.IO).launch {
        val artwork = loadArtwork(artworkUrl)
        if (artwork != null) {
          val updatedMetadata = MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, title)
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, artist)
            .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, (duration * 1000).toLong())
            .putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, artwork)
            .build()
          mediaSession?.setMetadata(updatedMetadata)
        }
        showNotification(context, title, artist, isPlaying, artwork)
      }
    }

    Function("updatePlaybackState") { isPlaying: Boolean, position: Double ->
      updatePlaybackStateInternal(isPlaying, position)
      val context = appContext.reactContext ?: return@Function
      val metadata = mediaSession?.controller?.metadata
      val title = metadata?.getString(MediaMetadataCompat.METADATA_KEY_TITLE) ?: ""
      val artist = metadata?.getString(MediaMetadataCompat.METADATA_KEY_ARTIST) ?: ""
      CoroutineScope(Dispatchers.IO).launch {
        showNotification(context, title, artist, isPlaying, cachedArtwork)
      }
    }

    Function("clearNowPlaying") {
      mediaSession?.setMetadata(null)
      appContext.reactContext?.let { context ->
        stopPlaybackService(context)
      }
    }
  }

  private fun createNotificationChannel(context: Context) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        "Podcast Playback",
        NotificationManager.IMPORTANCE_LOW
      ).apply {
        description = "Podcast playback controls"
        setShowBadge(false)
      }
      notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      notificationManager?.createNotificationChannel(channel)
    }
  }

  private fun setupMediaSession(context: Context) {
    mediaSession = MediaSessionCompat(context, "PodcasterSession").apply {
      setCallback(object : MediaSessionCompat.Callback() {
        override fun onPlay() {
          sendEvent("onMediaCommand", mapOf("command" to "play"))
        }
        override fun onPause() {
          sendEvent("onMediaCommand", mapOf("command" to "pause"))
        }
        override fun onStop() {
          sendEvent("onMediaCommand", mapOf("command" to "stop"))
        }
        override fun onSkipToNext() {
          sendEvent("onMediaCommand", mapOf("command" to "skipForward"))
        }
        override fun onSkipToPrevious() {
          sendEvent("onMediaCommand", mapOf("command" to "skipBackward"))
        }
        override fun onSeekTo(pos: Long) {
          sendEvent("onMediaCommand", mapOf("command" to "seek", "seekTime" to (pos / 1000.0)))
        }
      })
      isActive = true
    }
  }

  private fun updatePlaybackStateInternal(isPlaying: Boolean, position: Double) {
    val state = if (isPlaying) PlaybackStateCompat.STATE_PLAYING else PlaybackStateCompat.STATE_PAUSED
    val playbackState = PlaybackStateCompat.Builder()
      .setActions(
        PlaybackStateCompat.ACTION_PLAY or
        PlaybackStateCompat.ACTION_PAUSE or
        PlaybackStateCompat.ACTION_STOP or
        PlaybackStateCompat.ACTION_SEEK_TO or
        PlaybackStateCompat.ACTION_SKIP_TO_NEXT or
        PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS or
        PlaybackStateCompat.ACTION_PLAY_PAUSE
      )
      .setState(state, (position * 1000).toLong(), if (isPlaying) 1.0f else 0.0f)
      .build()
    mediaSession?.setPlaybackState(playbackState)
  }

  private fun loadArtwork(url: String): Bitmap? {
    if (url == cachedArtworkUrl && cachedArtwork != null) return cachedArtwork
    return try {
      val bitmap = BitmapFactory.decodeStream(URL(url).openStream())
      cachedArtwork = bitmap
      cachedArtworkUrl = url
      bitmap
    } catch (e: Exception) {
      null
    }
  }

  private fun showNotification(context: Context, title: String, artist: String, isPlaying: Boolean, artwork: Bitmap?) {
    val sessionToken = mediaSession?.sessionToken ?: return

    val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
    val pendingIntent = PendingIntent.getActivity(
      context, 0, launchIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    val style = androidx.media.app.NotificationCompat.MediaStyle()
      .setMediaSession(sessionToken)
      .setShowActionsInCompactView(0, 1, 2)

    val builder = NotificationCompat.Builder(context, CHANNEL_ID)
      .setContentTitle(title)
      .setContentText(artist)
      .setSmallIcon(android.R.drawable.ic_media_play)
      .setLargeIcon(artwork)
      .setContentIntent(pendingIntent)
      .setStyle(style)
      .setOngoing(isPlaying)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)

    // Skip backward
    builder.addAction(
      android.R.drawable.ic_media_rew, "Rewind",
      buildMediaAction(context, PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS)
    )

    // Play/Pause
    if (isPlaying) {
      builder.addAction(
        android.R.drawable.ic_media_pause, "Pause",
        buildMediaAction(context, PlaybackStateCompat.ACTION_PAUSE)
      )
    } else {
      builder.addAction(
        android.R.drawable.ic_media_play, "Play",
        buildMediaAction(context, PlaybackStateCompat.ACTION_PLAY)
      )
    }

    // Skip forward
    builder.addAction(
      android.R.drawable.ic_media_ff, "Forward",
      buildMediaAction(context, PlaybackStateCompat.ACTION_SKIP_TO_NEXT)
    )

    val notification = builder.build()

    try {
      if (isPlaying && !serviceRunning) {
        val serviceIntent = Intent(context, MediaPlaybackService::class.java).apply {
          putExtra(MediaPlaybackService.EXTRA_NOTIFICATION, notification)
        }
        ContextCompat.startForegroundService(context, serviceIntent)
        serviceRunning = true
      } else if (isPlaying && serviceRunning) {
        // Update the existing foreground notification
        notificationManager?.notify(NOTIFICATION_ID, notification)
      } else if (!isPlaying && serviceRunning) {
        // Paused — keep service alive but update notification (not ongoing)
        notificationManager?.notify(NOTIFICATION_ID, notification)
      } else {
        notificationManager?.notify(NOTIFICATION_ID, notification)
      }
    } catch (e: SecurityException) {
      // Missing notification permission on Android 13+
    }
  }

  private fun stopPlaybackService(context: Context) {
    if (serviceRunning) {
      context.stopService(Intent(context, MediaPlaybackService::class.java))
      serviceRunning = false
    }
    notificationManager?.cancel(NOTIFICATION_ID)
  }

  private fun buildMediaAction(context: Context, action: Long): PendingIntent {
    val intent = Intent(Intent.ACTION_MEDIA_BUTTON).apply {
      setPackage(context.packageName)
    }
    return PendingIntent.getBroadcast(
      context, action.toInt(), intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }
}