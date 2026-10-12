package ir.hirmand.staff

import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.content.Intent
import android.os.Bundle
import android.view.Gravity
import android.widget.LinearLayout
import android.widget.TextView
import com.google.android.material.button.MaterialButton

/**
 * Android Enterprise DPC provisioning entry point.
 *
 * Android 12+ calls ACTION_GET_PROVISIONING_MODE before establishing the
 * DPC as a Device Owner or Profile Owner. The requested mode is carried in
 * admin extras when our app starts provisioning from the personal-device flow.
 */
class HirmandProvisioningActivity : Activity() {

    companion object {
        const val EXTRA_HIRMAND_REQUESTED_MODE = "hirmand.requestedProvisioningMode"
        const val MODE_FULLY_MANAGED = "fully_managed"
        const val MODE_WORK_PROFILE = "managed_profile"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        when (intent?.action) {
            DevicePolicyManager.ACTION_GET_PROVISIONING_MODE -> returnProvisioningMode()
            DevicePolicyManager.ACTION_ADMIN_POLICY_COMPLIANCE -> showCompliance()
            else -> {
                setResult(RESULT_CANCELED)
                finish()
            }
        }
    }

    private fun returnProvisioningMode() {
        val requestedMode = intent
            ?.getBundleExtra(DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE)
            ?.getString(EXTRA_HIRMAND_REQUESTED_MODE)

        val allowedModes = intent?.let {
            @Suppress("DEPRECATION")
            it.getIntegerArrayListExtra(
                DevicePolicyManager.EXTRA_PROVISIONING_ALLOWED_PROVISIONING_MODES
            )
        }.orEmpty()

        val fullyManagedAllowed =
            allowedModes.contains(DevicePolicyManager.PROVISIONING_MODE_FULLY_MANAGED_DEVICE)
        val workProfileAllowed =
            allowedModes.contains(DevicePolicyManager.PROVISIONING_MODE_MANAGED_PROFILE)

        val selectedMode = when (requestedMode) {
            MODE_WORK_PROFILE -> {
                if (workProfileAllowed) {
                    DevicePolicyManager.PROVISIONING_MODE_MANAGED_PROFILE
                } else {
                    DevicePolicyManager.PROVISIONING_MODE_FULLY_MANAGED_DEVICE
                }
            }
            MODE_FULLY_MANAGED -> {
                if (fullyManagedAllowed) {
                    DevicePolicyManager.PROVISIONING_MODE_FULLY_MANAGED_DEVICE
                } else {
                    DevicePolicyManager.PROVISIONING_MODE_MANAGED_PROFILE
                }
            }
            else -> when {
                fullyManagedAllowed -> DevicePolicyManager.PROVISIONING_MODE_FULLY_MANAGED_DEVICE
                workProfileAllowed -> DevicePolicyManager.PROVISIONING_MODE_MANAGED_PROFILE
                else -> DevicePolicyManager.PROVISIONING_MODE_FULLY_MANAGED_DEVICE
            }
        }

        val result = Intent().apply {
            putExtra(DevicePolicyManager.EXTRA_PROVISIONING_MODE, selectedMode)
            // Default remains false: on a fully-managed device the DPC may
            // control sensor-related permission grants where Android permits it.
        }

        setResult(RESULT_OK, result)
        finish()
    }

    private fun showCompliance() {
        val state = DeviceOwnerManager.state(this)
        val managedText = when (state.mode) {
            DeviceManagementMode.DEVICE_OWNER ->
                "این گوشی به‌عنوان Fully Managed / Device Owner ثبت شده است."
            DeviceManagementMode.PROFILE_OWNER ->
                "این گوشی یک Work Profile / Profile Owner دارد و داده‌های کاری در فضای مدیریت‌شده از بخش شخصی جدا می‌شوند."
            DeviceManagementMode.LEGACY_DEVICE_ADMIN ->
                "Device Admin قدیمی فعال است؛ برای مدیریت مدرن از Android Enterprise استفاده کنید."
            DeviceManagementMode.UNMANAGED ->
                "فرایند مدیریت سازمانی در حال تکمیل است."
        }

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(24), dp(32), dp(24), dp(32))
            setBackgroundColor(getColor(R.color.hirmand_bg))
        }

        root.addView(TextView(this).apply {
            text = "مدیریت سازمانی هیرمند"
            textSize = 24f
            gravity = Gravity.CENTER
            setTextColor(getColor(R.color.hirmand_text))
        }, lp(-1, -2))

        root.addView(TextView(this).apply {
            text = managedText + "\n\nسیاست‌های مدیریتی فقط از طریق Android Enterprise اعمال می‌شوند. دسترسی‌های حساس در گوشی شخصی همچنان در محدوده Work Profile و مجوزهای رسمی Android باقی می‌مانند."
            textSize = 14f
            gravity = Gravity.CENTER
            setTextColor(getColor(R.color.hirmand_muted))
            setLineSpacing(dp(2).toFloat(), 1.0f)
        }, lp(-1, -2).apply { topMargin = dp(16) })

        root.addView(MaterialButton(this).apply {
            text = "تأیید و ادامه"
            isAllCaps = false
            textSize = 14f
            setOnClickListener {
                setResult(RESULT_OK)
                finish()
            }
        }, lp(-1, dp(52)).apply { topMargin = dp(24) })

        setContentView(root)
    }

    private fun lp(width: Int, height: Int): LinearLayout.LayoutParams =
        LinearLayout.LayoutParams(width, height)

    private fun dp(value: Int): Int =
        (value * resources.displayMetrics.density).toInt()
}
