package expo.modules.mediasession

import android.app.Notification
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder

class MediaPlaybackService : Service() {

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val notification = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent?.getParcelableExtra(EXTRA_NOTIFICATION, Notification::class.java)
    } else {
      @Suppress("DEPRECATION")
      intent?.getParcelableExtra(EXTRA_NOTIFICATION)
    }
    if (notification != null) {
      startForeground(MediaSessionModule.NOTIFICATION_ID, notification)
    } else {
      stopSelf()
    }
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    stopForeground(STOP_FOREGROUND_REMOVE)
    super.onDestroy()
  }

  companion object {
    const val EXTRA_NOTIFICATION = "notification"
  }
}
