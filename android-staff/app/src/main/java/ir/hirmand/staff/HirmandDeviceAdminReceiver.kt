package ir.hirmand.staff

import android.app.admin.DeviceAdminReceiver
import android.content.Context
import android.content.Intent

class HirmandDeviceAdminReceiver : DeviceAdminReceiver() {

    override fun onProfileProvisioningComplete(context: Context, intent: Intent) {
        super.onProfileProvisioningComplete(context, intent)
        DeviceOwnerManager.applyCompanyIdentity(context)
    }
}
