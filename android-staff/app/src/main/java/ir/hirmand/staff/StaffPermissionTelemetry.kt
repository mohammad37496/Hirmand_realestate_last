package ir.hirmand.staff

import android.Manifest
import android.app.AppOpsManager
import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import android.os.Build
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject

object StaffPermissionTelemetry {
    fun snapshot(context: Context): JSONObject {
        val management = DeviceOwnerManager.state(context)
        return JSONObject()
            .put("managementMode", management.mode.name.lowercase())
            .put("location", locationGrantedAndEnabled(context))
            .put("camera", runtimeGranted(context, Manifest.permission.CAMERA))
            .put("microphone", runtimeGranted(context, Manifest.permission.RECORD_AUDIO))
            .put("notifications", notificationsEnabled(context))
            .put("accessibility", accessibilityEnabled(context))
            .put("usageAccess", usageAccessEnabled(context))
    }

    private fun runtimeGranted(context: Context, permission: String): Boolean =
        ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

    private fun notificationsEnabled(context: Context): Boolean =
        NotificationManagerCompat.from(context).areNotificationsEnabled() &&
            (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
                runtimeGranted(context, Manifest.permission.POST_NOTIFICATIONS))

    private fun accessibilityEnabled(context: Context): Boolean {
        val enabled = Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ).orEmpty()
        val expected = ComponentName(
            context,
            HirmandAccessibilityService::class.java
        ).flattenToString()
        return enabled.split(':').any { it == expected }
    }

    private fun usageAccessEnabled(context: Context): Boolean {
        val appOps = context.getSystemService(AppOpsManager::class.java) ?: return false
        val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            appOps.unsafeCheckOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                context.applicationInfo.uid,
                context.packageName,
            )
        } else {
            @Suppress("DEPRECATION")
            appOps.checkOpNoThrow(
                AppOpsManager.OPSTR_GET_USAGE_STATS,
                context.applicationInfo.uid,
                context.packageName,
            )
        }
        return mode == AppOpsManager.MODE_ALLOWED
    }

    private fun locationGrantedAndEnabled(context: Context): Boolean {
        val permission =
            runtimeGranted(context, Manifest.permission.ACCESS_COARSE_LOCATION) ||
                runtimeGranted(context, Manifest.permission.ACCESS_FINE_LOCATION)
        val enabled = context.getSystemService(LocationManager::class.java)?.let {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) it.isLocationEnabled else true
        } ?: false
        return permission && enabled
    }
}
