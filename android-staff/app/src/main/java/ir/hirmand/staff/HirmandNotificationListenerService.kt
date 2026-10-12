package ir.hirmand.staff

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

class HirmandNotificationListenerService : NotificationListenerService() {
    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        // The current release only exposes the Android-controlled access switch.
        // No notification content is collected or transmitted yet.
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification?) {
        // Intentionally no data collection.
    }
}
