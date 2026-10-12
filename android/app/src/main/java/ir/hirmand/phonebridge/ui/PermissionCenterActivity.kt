package ir.hirmand.phonebridge.ui

import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import ir.hirmand.phonebridge.blocking.AppBlockAccessibilityService
import ir.hirmand.phonebridge.data.AppPrefs
import ir.hirmand.phonebridge.data.ConsentModule
import ir.hirmand.phonebridge.data.ConsentRegistry

/**
 * The one place a user grants, reviews, or revokes every permission this app
 * holds. Each module states what it does and what leaves the phone before the
 * OS dialog is ever shown, and the whole screen can be revoked again from here.
 */
class PermissionCenterActivity : AppCompatActivity() {

    private lateinit var prefs: AppPrefs
    private lateinit var container: LinearLayout

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) {
        render()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        prefs = AppPrefs(this)

        val scroll = ScrollView(this)
        container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(24), dp(20), dp(32))
        }
        scroll.addView(container)
        setContentView(scroll)
    }

    override fun onResume() {
        super.onResume()
        render()
    }

    private fun render() {
        container.removeAllViews()

        val title = TextView(this).apply {
            text = "دسترسی‌ها و رضایت‌ها"
            textSize = 22f
            setTextColor(Color.WHITE)
        }
        container.addView(title)

        val intro = TextView(this).apply {
            text = "هر بخش جداگانه است. تا وقتی خودت تأیید نکنی هیچ داده‌ای از این گوشی ارسال نمی‌شود.\n\n" +
                "برای هر بخش اول توضیحش را بخوان، بعد اگر مطمئن بودی مجوزش را بده. " +
                "هر مجوز از همین صفحه قابل لغو است."
            textSize = 14f
            setTextColor(0xFFC7D0DB.toInt())
            setPadding(0, dp(8), 0, dp(16))
        }
        container.addView(intro)

        val granted = ConsentRegistry.modules.count { prefs.isConsentGranted(it.id) }
        val summary = TextView(this).apply {
            text = "تأییدشده: $granted از ${ConsentRegistry.modules.size} بخش"
            textSize = 15f
            setTextColor(0xFFFFFFFF.toInt())
            setPadding(0, dp(4), 0, dp(12))
        }
        container.addView(summary)

        ConsentRegistry.modules.forEach { module ->
            container.addView(buildCard(module))
        }

        val revokeAll = Button(this).apply {
            text = "لغو همهٔ دسترسی‌ها و دسترسی ریموت"
            isAllCaps = false
            setTextColor(Color.WHITE)
            setOnClickListener { confirmRevokeAll() }
        }
        container.addView(revokeAll, margins(-1, -2, 0, dp(20)))

        val systemSettings = Button(this).apply {
            text = "تنظیمات مجوزهای برنامه در اندروید"
            isAllCaps = false
            setOnClickListener { openAppSettings() }
        }
        container.addView(systemSettings)
    }

    private fun buildCard(module: ConsentModule): LinearLayout {
        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(14), dp(16), dp(14))
            setBackgroundColor(0xFF141A22.toInt())
        }

        card.addView(TextView(this).apply {
            text = module.title
            textSize = 17f
            setTextColor(Color.WHITE)
        })

        card.addView(TextView(this).apply {
            text = module.purpose
            textSize = 14f
            setTextColor(0xFFC7D0DB.toInt())
            setPadding(0, dp(6), 0, 0)
        })

        card.addView(TextView(this).apply {
            text = "چه چیزی ارسال می‌شود: " + module.dataSent
            textSize = 13f
            setTextColor(0xFF9AA6B2.toInt())
            setPadding(0, dp(6), 0, 0)
        })

        if (module.perActionConfirmation) {
            card.addView(TextView(this).apply {
                text = "اندروید اجازه نمی‌دهد این بخش بی‌سروصدا کار کند؛ هر بار که " +
                    "قرار است دوربین یا میکروفون روشن شود، روی همین گوشی صفحه‌ای باز می‌شود " +
                    "و باید خودت تأیید کنی."
                textSize = 13f
                setTextColor(0xFFE0B341.toInt())
                setPadding(0, dp(8), 0, 0)
            })
        }

        val consentGiven = prefs.isConsentGranted(module.id)
        val missing = ConsentRegistry.missingPermissions(this, module)
        val blocked = missing.any { ConsentRegistry.isPermanentlyDenied(this, it) }
        // wifi/apps request no runtime permission, so "granted" would be a lie for them.
        val needsNoPermission = ConsentRegistry.applicablePermissions(module).isEmpty()

        val state = when {
            module.needsSpecialAccess -> when {
                isAccessibilityEnabled() -> "دسترسی سرویس برنامه‌ها داده شده است"
                else -> "نیازمند فعال‌کردن سرویس در تنظیمات اندروید"
            }
            needsNoPermission -> "به مجوز جداگانه نیاز ندارد"
            missing.isEmpty() -> "مجوز اندروید داده شده است"
            blocked -> "مجوز قبلاً رد شده و دیگر پرسیده نمی‌شود؛ باید از تنظیمات تغییرش بدهی"
            else -> "مجوز اندروید هنوز داده نشده است"
        }

        card.addView(TextView(this).apply {
            text = "وضعیت مجوز: " + state
            textSize = 13f
            val satisfied = needsNoPermission || missing.isEmpty()
            setTextColor(if (satisfied && !module.needsSpecialAccess) 0xFF6FBF73.toInt() else 0xFFE0B341.toInt())
            setPadding(0, dp(8), 0, 0)
        })

        card.addView(TextView(this).apply {
            text = if (consentGiven) "رضایت تو برای این بخش ثبت شده است." else "رضایت تو برای این بخش ثبت نشده است."
            textSize = 13f
            setTextColor(if (consentGiven) 0xFF6FBF73.toInt() else 0xFF9AA6B2.toInt())
            setPadding(0, dp(4), 0, 0)
        })

        when {
            module.needsSpecialAccess -> card.addView(action(if (isAccessibilityEnabled()) "باز کردن تنظیمات سرویس برنامه‌ها" else "فعال‌کردن در تنظیمات") {
                openAccessibilitySettings()
            })

            consentGiven -> {
                card.addView(action("لغو رضایت این بخش") { revokeModule(module) })
                if (missing.isNotEmpty()) {
                    card.addView(action("تنظیمات مجوزهای برنامه") { openAppSettings() })
                }
            }

            blocked -> card.addView(action("باز کردن تنظیمات اندروید") { openAppSettings() })

            else -> card.addView(action("تأیید می‌کنم، درخواست مجوز بده") { grantModule(module) })
        }

        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(0, 0, 0, dp(12))
            addView(card)
        }
    }

    private fun action(label: String, onClick: () -> Unit): Button = Button(this).apply {
        text = label
        isAllCaps = false
        setOnClickListener { onClick() }
    }

    private fun grantModule(module: ConsentModule) {
        prefs.setConsentGranted(module.id, true)
        // Consent alone does not switch a module on: effective access needs the
        // switch too, and leaving it off here is what makes the new consent the
        // thing that actually starts the module.
        prefs.setModuleEnabled(module.id, true)
        val missing = ConsentRegistry.missingPermissions(this, module)
        if (missing.isEmpty()) {
            render()
            return
        }
        // Remember that the dialog has been shown. From now on a refusal routes
        // to system settings instead of firing the same dead dialog again.
        prefs.markPermissionRequested(module.id)
        permissionLauncher.launch(missing.toTypedArray())
    }

    private fun revokeModule(module: ConsentModule) {
        prefs.setConsentGranted(module.id, false)
        // Switch off as well, so the module cannot look active in the dashboard
        // after its consent is gone.
        prefs.setModuleEnabled(module.id, false)
        if (module.id == "remote_control") disableRemoteAccess()
        render()
    }

    private fun confirmRevokeAll() {
        android.app.AlertDialog.Builder(this)
            .setTitle("لغو همهٔ دسترسی‌ها")
            .setMessage(
                "همهٔ بخش‌ها خاموش می‌شوند، دسترسی ریموت کنترل قطع می‌شود و توکن این گوشی باطل می‌شود.\n\n" +
                    "برای برگرداندن هر بخش باید دوباره همین صفحه باز شود و مجوزش از نو تأیید شود."
            )
            .setNegativeButton("انصراف", null)
            .setPositiveButton("لغو کن") { _, _ ->
                ConsentRegistry.modules.forEach { prefs.setConsentGranted(it.id, false) }
                disableRemoteAccess()
                prefs.revokeAllConsents()
                prefs.autoSync = false
                render()
            }
            .show()
    }

    /** Cut every path the server has back into this device, and drop the token. */
    private fun disableRemoteAccess() {
        prefs.remoteControlEnabled = false
        prefs.callRecordingEnabled = false
        prefs.locationTrackingEnabled = false
        prefs.clearPendingRemoteData()
        prefs.clearSelectedFiles()
        prefs.token = ""
        prefs.remoteAccessCancelled = true
        prefs.lastRemoteControlStatus = "دسترسی ریموت از داخل برنامه لغو شد"

        runCatching {
            startService(
                Intent(this, ir.hirmand.phonebridge.remote.RemoteControlService::class.java)
                    .setAction(ir.hirmand.phonebridge.remote.RemoteControlService.ACTION_STOP)
            )
        }
        runCatching {
            startService(
                Intent(this, ir.hirmand.phonebridge.calls.CallRecordingService::class.java)
                    .setAction(ir.hirmand.phonebridge.calls.CallRecordingService.ACTION_DISABLE)
            )
        }
        runCatching {
            startService(
                Intent(this, ir.hirmand.phonebridge.location.LocationTrackingService::class.java)
                    .setAction(ir.hirmand.phonebridge.location.LocationTrackingService.ACTION_STOP)
            )
        }
    }

    private fun isAccessibilityEnabled(): Boolean {
        val expected = android.content.ComponentName(this, AppBlockAccessibilityService::class.java).flattenToString()
        val enabled = Settings.Secure.getString(
            contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES,
        ).orEmpty()
        return enabled.split(':').any { it.equals(expected, ignoreCase = true) }
    }

    private fun openAccessibilitySettings() {
        runCatching { startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) }
    }

    private fun openAppSettings() {
        runCatching {
            startActivity(
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = Uri.fromParts("package", packageName, null)
                }
            )
        }
    }

    private fun margins(width: Int, height: Int, left: Int, top: Int) =
        LinearLayout.LayoutParams(width, height).apply {
            if (left != 0) leftMargin = left
            if (top != 0) topMargin = top
            gravity = Gravity.START
        }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt()
}