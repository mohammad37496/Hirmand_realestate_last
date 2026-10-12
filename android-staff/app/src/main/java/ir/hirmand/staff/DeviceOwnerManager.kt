package ir.hirmand.staff

import android.Manifest
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager

enum class DeviceManagementMode {
    DEVICE_OWNER,
    PROFILE_OWNER,
    LEGACY_DEVICE_ADMIN,
    UNMANAGED,
}

data class DeviceManagementState(
    val mode: DeviceManagementMode,
    val label: String,
    val isManaged: Boolean,
    val provisioningAllowed: Boolean,
)

data class ManagedPermissionGrantResult(
    val granted: List<String>,
    val failed: List<String>,
)

object DeviceOwnerManager {
    fun adminComponent(context: Context): ComponentName =
        ComponentName(context, HirmandDeviceAdminReceiver::class.java)

    fun state(context: Context): DeviceManagementState {
        val manager = context.getSystemService(DevicePolicyManager::class.java)
        val packageName = context.packageName
        val admin = adminComponent(context)

        val deviceOwner = manager?.isDeviceOwnerApp(packageName) == true
        val profileOwner = manager?.isProfileOwnerApp(packageName) == true
        val legacyAdmin = manager?.isAdminActive(admin) == true

        val mode = when {
            deviceOwner -> DeviceManagementMode.DEVICE_OWNER
            profileOwner -> DeviceManagementMode.PROFILE_OWNER
            legacyAdmin -> DeviceManagementMode.LEGACY_DEVICE_ADMIN
            else -> DeviceManagementMode.UNMANAGED
        }

        val label = when (mode) {
            DeviceManagementMode.DEVICE_OWNER -> "Fully Managed / Device Owner فعال"
            DeviceManagementMode.PROFILE_OWNER -> "Work Profile / Profile Owner فعال"
            DeviceManagementMode.LEGACY_DEVICE_ADMIN -> "Device Admin قدیمی فعال"
            DeviceManagementMode.UNMANAGED -> "مدیریت سازمانی فعال نیست"
        }

        val provisioningAllowed = runCatching {
            manager?.isProvisioningAllowed(DevicePolicyManager.ACTION_PROVISION_MANAGED_DEVICE) == true ||
                manager?.isProvisioningAllowed(DevicePolicyManager.ACTION_PROVISION_MANAGED_PROFILE) == true
        }.getOrDefault(false)

        return DeviceManagementState(
            mode = mode,
            label = label,
            isManaged = deviceOwner || profileOwner,
            provisioningAllowed = provisioningAllowed,
        )
    }

    fun isDeviceOwner(context: Context): Boolean =
        context.getSystemService(DevicePolicyManager::class.java)
            ?.isDeviceOwnerApp(context.packageName) == true

    /**
     * Android allows a Device Owner on a fully-managed device to control
     * selected sensor-related runtime grants. This is deliberately limited
     * to the permissions the Hirmand staff app declares for its managed
     * device workflow.
     *
     * Profile Owners must not be used for these grants on Android 12+.
     */
    fun applyManagedSensorPermissionGrants(context: Context): ManagedPermissionGrantResult {
        if (!isDeviceOwner(context)) {
            return ManagedPermissionGrantResult(emptyList(), emptyList())
        }

        val manager = context.getSystemService(DevicePolicyManager::class.java)
            ?: return ManagedPermissionGrantResult(emptyList(), emptyList())
        val admin = adminComponent(context)
        val packageName = context.packageName

        val requested = buildList {
            add(Manifest.permission.ACCESS_COARSE_LOCATION)
            add(Manifest.permission.ACCESS_FINE_LOCATION)
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
                add(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
            }
            add(Manifest.permission.CAMERA)
            add(Manifest.permission.RECORD_AUDIO)
        }

        val granted = mutableListOf<String>()
        val failed = mutableListOf<String>()

        for (permission in requested.distinct()) {
            if (
                android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M &&
                context.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED
            ) {
                granted += permission
                continue
            }

            val ok = runCatching {
                manager.setPermissionGrantState(
                    admin,
                    packageName,
                    permission,
                    DevicePolicyManager.PERMISSION_GRANT_STATE_GRANTED,
                )
            }.getOrDefault(false)

            if (ok && context.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED) {
                granted += permission
            } else {
                failed += permission
            }
        }

        return ManagedPermissionGrantResult(granted, failed)
    }

    /**
     * Keep future runtime requests automatic for the same managed package
     * only when this application is already the Device Owner. This policy
     * applies to runtime permission requests generally, so sensor grants are
     * still explicitly controlled above and future non-sensor requests should
     * remain under normal product policy. We therefore intentionally do not
     * use PERMISSION_POLICY_AUTO_GRANT here.
     */
    fun applyCompanyIdentity(context: Context) {
        val manager = context.getSystemService(DevicePolicyManager::class.java) ?: return
        if (!manager.isDeviceOwnerApp(context.packageName)) return

        runCatching {
            manager.setOrganizationName(adminComponent(context), "املاک هیرمند")
        }

        // Sensor grants are explicit and scoped in applyManagedSensorPermissionGrants().
        applyManagedSensorPermissionGrants(context)
    }
}
