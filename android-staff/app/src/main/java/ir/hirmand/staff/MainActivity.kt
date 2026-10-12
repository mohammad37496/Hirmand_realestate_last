package ir.hirmand.staff

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Typeface
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.widget.CheckBox
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import com.google.android.material.button.MaterialButton
import com.google.android.material.card.MaterialCardView

private data class StaffMember(
    val id: String,
    val name: String,
    val role: String,
)

private data class DeviceRegistrationResult(
    val status: String,
    val authToken: String?,
)

private val fallbackStaffMembers = listOf(
    StaffMember("sheikh", "آقای شیخ", "مدیر"),
    StaffMember("moradi", "آقای مرادی", "مشاور ارشد"),
)

private const val AGREEMENT_VERSION = "1.1"
private const val AGREEMENT_URL = "https://www.hirmandrealestate.ir/staff-agreement"
private const val PREFS_NAME = "hirmand_staff"
private const val PREF_AGREEMENT_VERSION = "accepted_agreement_version"
private const val PREF_AGREEMENT_ACCEPTED_AT = "agreement_accepted_at"
private const val PREF_STAFF_ID = "registered_staff_id"
private const val PREF_STAFF_REGISTERED_AT = "staff_registered_at"
private const val PREF_STAFF_DIRECTORY_JSON = "staff_directory_json"
private const val PREF_STAFF_DIRECTORY_SYNCED_AT = "staff_directory_synced_at"
private const val PREF_DEVICE_ID = "device_id"
private const val PREF_DEVICE_STATUS = "device_registration_status"
private const val SCREEN_CAPTURE_REQUEST_CODE = 9102
private const val WORK_PROFILE_PROVISIONING_REQUEST_CODE = 9201

class MainActivity : AppCompatActivity() {

    private val preferences by lazy {
        getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    private var availableStaffMembers: List<StaffMember> = emptyList()
    private var isRefreshingStaffDirectory = false
    private var permissionCenterVisible = false
    private var screenCaptureApprovedThisSession = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // On fully-managed company devices, reconcile the explicit sensor
        // permission grants each time the app starts. This is a Device Owner
        // operation; unmanaged/profile-owned devices remain untouched.
        runCatching {
            DeviceOwnerManager.applyManagedSensorPermissionGrants(this)
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (!permissionCenterVisible) {
                    isEnabled = false
                    finish()
                    return
                }

                permissionCenterVisible = false
                isEnabled = false
                setContentView(buildHome())
            }
        })

        availableStaffMembers = readCachedStaffMembers().ifEmpty { fallbackStaffMembers }
        renderCurrentStep()
    }

    override fun onResume() {
        super.onResume()
        if (permissionCenterVisible) {
            renderPermissionCenter()
        }
    }

    private fun renderPermissionCenter() {
        permissionCenterVisible = true
        setContentView(
            PermissionCenter(
                activity = this,
                screenCaptureApproved = { screenCaptureApprovedThisSession },
                onStartWorkProfileProvisioning = { startWorkProfileProvisioning() },
                onRequestScreenCapture = {
                    val projectionManager = getSystemService(android.media.projection.MediaProjectionManager::class.java)
                    try {
                        startActivityForResult(
                            projectionManager.createScreenCaptureIntent(),
                            SCREEN_CAPTURE_REQUEST_CODE
                        )
                    } catch {
                        Toast.makeText(
                            this,
                            "امکان درخواست ضبط صفحه در این دستگاه وجود ندارد.",
                            Toast.LENGTH_LONG
                        ).show()
                    }
                },
                onClose = {
                    permissionCenterVisible = false
                    setContentView(buildHome())
                },
            ).buildView()
        )
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == SCREEN_CAPTURE_REQUEST_CODE) {
            screenCaptureApprovedThisSession = resultCode == RESULT_OK && data != null
            if (permissionCenterVisible) {
                renderPermissionCenter()
            }
        }
    }

    private fun startWorkProfileProvisioning() {
        val manager = getSystemService(android.app.admin.DevicePolicyManager::class.java)
        if (manager == null) {
            Toast.makeText(
                this,
                "Android Enterprise روی این دستگاه در دسترس نیست.",
                Toast.LENGTH_LONG
            ).show()
            return
        }

        val action = android.app.admin.DevicePolicyManager.ACTION_PROVISION_MANAGED_PROFILE
        val allowed = runCatching {
            manager.isProvisioningAllowed(action)
        }.getOrDefault(false)

        if (!allowed) {
            Toast.makeText(
                this,
                "Android در وضعیت فعلی اجازه ساخت Work Profile را نمی‌دهد. ممکن است Work Profile دیگری وجود داشته باشد یا دستگاه تحت مدیریت دیگری باشد.",
                Toast.LENGTH_LONG
            ).show()
            return
        }

        val admin = ComponentName(this, HirmandDeviceAdminReceiver::class.java)
        val extras = Bundle().apply {
            putString(
                HirmandProvisioningActivity.EXTRA_HIRMAND_REQUESTED_MODE,
                HirmandProvisioningActivity.MODE_WORK_PROFILE
            )
        }

        val intent = Intent(action).apply {
            putExtra(
                android.app.admin.DevicePolicyManager.EXTRA_PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME,
                admin
            )
            putExtra(
                android.app.admin.DevicePolicyManager.EXTRA_PROVISIONING_ADMIN_EXTRAS_BUNDLE,
                extras
            )
        }

        try {
            startActivityForResult(intent, WORK_PROFILE_PROVISIONING_REQUEST_CODE)
        } catch {
            Toast.makeText(
                this,
                "شروع راه‌اندازی Work Profile روی این دستگاه ممکن نیست.",
                Toast.LENGTH_LONG
            ).show()
        }
    }

    private fun renderCurrentStep() {
        permissionCenterVisible = false
        when {
            !isAgreementAccepted() -> setContentView(buildAgreementScreen())
            registeredStaff() == null -> {
                setContentView(buildStaffRegistrationScreen())
                refreshStaffDirectory()
            }
            else -> {
                setContentView(buildHome())
                syncRegisteredDevice()
            }
        }
    }

    private fun isAgreementAccepted(): Boolean =
        preferences.getString(PREF_AGREEMENT_VERSION, null) == AGREEMENT_VERSION

    private fun deviceId(): String {
        val existing = preferences.getString(PREF_DEVICE_ID, null)?.trim()
        if (!existing.isNullOrEmpty()) return existing

        val generated = UUID.randomUUID().toString()
        preferences.edit().putString(PREF_DEVICE_ID, generated).apply()
        return generated
    }

    private fun registeredStaff(): StaffMember? {
        val registeredId = preferences.getString(PREF_STAFF_ID, null) ?: return null
        val registeredAt = preferences.getLong(PREF_STAFF_REGISTERED_AT, 0L)
        return (availableStaffMembers + fallbackStaffMembers)
            .distinctBy { it.id }
            .firstOrNull { it.id == registeredId && registeredAt > 0L }
    }

    private fun buildAgreementScreen(): ScrollView {
        val scrollView = ScrollView(this).apply {
            setBackgroundColor(getColor(R.color.hirmand_bg))
        }

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(24), dp(20), dp(32))
        }
        scrollView.addView(root)

        val mark = TextView(this).apply {
            text = "◆"
            textSize = 28f
            setTextColor(getColor(R.color.hirmand_gold))
            gravity = Gravity.CENTER
        }
        root.addView(mark, lp(-1, dp(52)))

        val title = TextView(this).apply {
            text = "توافق‌نامه استفاده از تلفن همراه\nEmployee Mobile Device Agreement"
            textSize = 23f
            setTextColor(getColor(R.color.hirmand_text))
            gravity = Gravity.CENTER
            setTypeface(typeface, Typeface.BOLD)
        }
        root.addView(title, lp(-1, -2).apply { topMargin = dp(10) })

        val intro = TextView(this).apply {
            text = "املاک هیرمند · گوشی شرکتی یا Work Profile روی گوشی شخصی"
            textSize = 13f
            setTextColor(getColor(R.color.hirmand_muted))
            gravity = Gravity.CENTER
        }
        root.addView(intro, lp(-1, -2).apply {
            topMargin = dp(7)
            bottomMargin = dp(20)
        })

        root.addView(buildNoticeCard(), lp(-1, -2).apply { bottomMargin = dp(14) })

        root.addView(buildContractSection(
            "1",
            "Purpose of This Agreement",
            listOf(
                "This Agreement establishes the rules, responsibilities, permissions, security requirements, data-access practices, and monitoring conditions applicable to employees and authorized personnel who use a mobile device owned, provided, controlled, or designated by Hirmand Real Estate.",
                "The purpose of this Agreement is to ensure that every employee understands clearly and in advance whether the phone is company-owned and fully managed, or personally owned and used through an Android Work Profile; which categories of device information and functions the Hirmand Real Estate application may access; why such access may be required; which information may be processed, stored, transmitted, synchronized, or made available to authorized company personnel; what the employee is agreeing to when accepting this Agreement; and how permissions may be granted, denied, revoked, or changed under Android and within the application.",
                "This Agreement is intended to provide clear notice and informed consent. It does not authorize the application to bypass Android security mechanisms, obtain permissions without system approval, or access information that Android or the application's technical controls prohibit."
            )
        ), lp(-1, -2).apply { bottomMargin = dp(14) })

        root.addView(buildContractSection(
            "2",
            "Device Ownership and Management Mode",
            listOf(
                "The Hirmand employee application supports two Android Enterprise deployment modes. On a company-owned phone, Hirmand may enroll the device as Fully Managed / Device Owner. On a personally owned phone, Hirmand may use an Android Work Profile / Profile Owner so that the managed workspace remains separated from the personal profile.",
                "The selected deployment mode determines the technical scope of device management and which Android policies are available."
            ),
            listOf(
                "Company-owned phone: the device may be Fully Managed and subject to organization-wide device policies appropriate for company operations.",
                "Personally owned phone: the company-managed workspace is the Work Profile; personal-profile data remains outside that managed workspace.",
                "The employee must not intentionally disable or circumvent the applicable Android Enterprise management controls.",
                "The employee must immediately report loss, theft, unauthorized access, suspicious activity, or suspected compromise.",
                "The employee understands that the technical scope of monitoring and management depends on the deployment mode and the Android policies actually enabled."
            )
        ), lp(-1, -2).apply { bottomMargin = dp(14) })

        root.addView(buildFullAgreementLinkCard(), lp(-1, -2).apply { bottomMargin = dp(16) })

        val signedCheck = CheckBox(this).apply {
            text = "I have read, understood, and voluntarily acknowledge and accept the Hirmand Real Estate Employee Mobile Device Use, Monitoring & Consent Agreement, including the disclosed deployment modes, sensitive permissions, device-access categories, monitoring conditions, data-processing purposes, and responsibilities."
            textSize = 13f
            setTextColor(getColor(R.color.hirmand_text))
            gravity = Gravity.TOP
        }
        root.addView(signedCheck, lp(-1, -2).apply {
            bottomMargin = dp(14)
        })

        val acceptButton = MaterialButton(this).apply {
            text = "Accept & Electronically Sign"
            textSize = 14f
            isAllCaps = false
            isEnabled = false
            setOnClickListener {
                preferences.edit()
                    .putString(PREF_AGREEMENT_VERSION, AGREEMENT_VERSION)
                    .putLong(PREF_AGREEMENT_ACCEPTED_AT, System.currentTimeMillis())
                    .apply()
                renderCurrentStep()
            }
        }
        root.addView(acceptButton, lp(-1, dp(54)))

        signedCheck.setOnCheckedChangeListener { _, checked ->
            acceptButton.isEnabled = checked
        }

        val version = TextView(this).apply {
            text = "Agreement version $AGREEMENT_VERSION · App version ${BuildConfig.VERSION_NAME}"
            textSize = 11f
            setTextColor(getColor(R.color.hirmand_muted))
            gravity = Gravity.CENTER
        }
        root.addView(version, lp(-1, -2).apply { topMargin = dp(13) })

        return scrollView
    }

    private fun buildNoticeCard(): MaterialCardView {
        val card = MaterialCardView(this).apply {
            radius = dp(17).toFloat()
            setCardBackgroundColor(getColor(R.color.hirmand_surface))
            strokeWidth = dp(1)
            strokeColor = getColor(R.color.hirmand_gold_dark)
        }

        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(15), dp(16), dp(15))
        }

        val title = TextView(this).apply {
            text = "Please read before continuing"
            textSize = 15f
            setTextColor(getColor(R.color.hirmand_gold))
            setTypeface(typeface, Typeface.BOLD)
        }

        val body = TextView(this).apply {
            text = "این برنامه هم روی گوشی متعلق به شرکت (Fully Managed) و هم روی گوشی شخصی کارمند با Work Profile قابل استفاده است. در حالت شخصی، مدیریت سازمانی به فضای کاری محدود می‌شود و داده‌های شخصی خارج از Work Profile برای اپ سازمانی در نظر گرفته نمی‌شوند."
            textSize = 12.5f
            setTextColor(getColor(R.color.hirmand_muted))
            setLineSpacing(dp(2).toFloat(), 1.0f)
        }

        content.addView(title, lp(-1, -2))
        content.addView(body, lp(-1, -2).apply { topMargin = dp(7) })
        card.addView(content)
        return card
    }

    private fun buildContractSection(
        number: String,
        titleText: String,
        paragraphs: List<String>,
        bullets: List<String> = emptyList(),
    ): MaterialCardView {
        val card = MaterialCardView(this).apply {
            radius = dp(17).toFloat()
            setCardBackgroundColor(getColor(R.color.hirmand_surface))
            strokeWidth = dp(1)
            strokeColor = getColor(R.color.hirmand_surface_2)
        }

        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(17), dp(17), dp(17), dp(17))
        }

        val badge = TextView(this).apply {
            text = "SECTION $number"
            textSize = 11f
            setTextColor(getColor(R.color.hirmand_gold))
            setTypeface(typeface, Typeface.BOLD)
        }

        val heading = TextView(this).apply {
            text = titleText
            textSize = 18f
            setTextColor(getColor(R.color.hirmand_text))
            setTypeface(typeface, Typeface.BOLD)
        }

        content.addView(badge, lp(-1, -2))
        content.addView(heading, lp(-1, -2).apply {
            topMargin = dp(4)
            bottomMargin = dp(10)
        })

        paragraphs.forEach { paragraph ->
            content.addView(TextView(this).apply {
                text = paragraph
                textSize = 13f
                setTextColor(getColor(R.color.hirmand_muted))
                setLineSpacing(dp(2).toFloat(), 1.0f)
            }, lp(-1, -2).apply { bottomMargin = dp(9) })
        }

        bullets.forEach { bullet ->
            content.addView(TextView(this).apply {
                text = "•  $bullet"
                textSize = 12.5f
                setTextColor(getColor(R.color.hirmand_muted))
                setLineSpacing(dp(1).toFloat(), 1.0f)
            }, lp(-1, -2).apply { bottomMargin = dp(7) })
        }

        card.addView(content)
        return card
    }

    private fun buildFullAgreementLinkCard(): MaterialCardView {
        val card = MaterialCardView(this).apply {
            radius = dp(17).toFloat()
            setCardBackgroundColor(getColor(R.color.hirmand_surface_2))
            strokeWidth = dp(1)
            strokeColor = getColor(R.color.hirmand_gold_dark)
        }

        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(15), dp(16), dp(15))
        }

        val title = TextView(this).apply {
            text = "Read the complete agreement"
            textSize = 15f
            setTextColor(getColor(R.color.hirmand_text))
            setTypeface(typeface, Typeface.BOLD)
        }

        val body = TextView(this).apply {
            text = "Sections 3–17 contain the remaining permissions, sensitive access categories, monitoring, data handling, employee responsibilities, and electronic-signature terms."
            textSize = 12.5f
            setTextColor(getColor(R.color.hirmand_muted))
            setLineSpacing(dp(2).toFloat(), 1.0f)
        }

        val linkButton = MaterialButton(this).apply {
            text = "Open: hirmandrealestate.ir/staff-agreement"
            textSize = 12f
            isAllCaps = false
            setOnClickListener { openFullAgreement() }
        }

        content.addView(title, lp(-1, -2))
        content.addView(body, lp(-1, -2).apply { topMargin = dp(6) })
        content.addView(linkButton, lp(-1, dp(50)).apply { topMargin = dp(11) })
        card.addView(content)
        return card
    }

    private fun openFullAgreement() {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(AGREEMENT_URL)))
        } catch {
            Toast.makeText(
                this,
                "مرورگر یا برنامه‌ای برای باز کردن قرارداد پیدا نشد.",
                Toast.LENGTH_LONG
            ).show()
        }
    }

    private fun refreshStaffDirectory() {
        if (isRefreshingStaffDirectory) return
        isRefreshingStaffDirectory = true

        Thread {
            val result = runCatching { fetchStaffDirectory() }.getOrNull()

            runOnUiThread {
                isRefreshingStaffDirectory = false

                if (!result.isNullOrEmpty()) {
                    availableStaffMembers = result
                    saveCachedStaffMembers(result)
                    setContentView(buildStaffRegistrationScreen())
                } else if (availableStaffMembers.isEmpty()) {
                    availableStaffMembers = fallbackStaffMembers
                    setContentView(buildStaffRegistrationScreen())
                }
            }
        }.start()
    }

    private fun fetchStaffDirectory(): List<StaffMember> {
        val connection = (URL(BuildConfig.STAFF_DIRECTORY_URL).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 8_000
            readTimeout = 12_000
            useCaches = true
            setRequestProperty("Accept", "application/json")
        }

        return try {
            val statusCode = connection.responseCode
            if (statusCode !in 200..299) return emptyList()

            val body = connection.inputStream.bufferedReader().use { it.readText() }
            val root = JSONObject(body)
            if (!root.optBoolean("success", false)) return emptyList()

            val staff = root.optJSONArray("staff") ?: JSONArray()
            buildList {
                for (index in 0 until staff.length()) {
                    val item = staff.optJSONObject(index) ?: continue
                    val id = item.optString("id").trim()
                    val name = item.optString("name").trim()
                    val role = item.optString("role").trim()
                    if (id.length >= 2 && name.length >= 2 && role.length >= 2) {
                        add(StaffMember(id, name, role))
                    }
                }
            }.distinctBy { it.id }
        } finally {
            connection.disconnect()
        }
    }

    private fun readCachedStaffMembers(): List<StaffMember> {
        val raw = preferences.getString(PREF_STAFF_DIRECTORY_JSON, null) ?: return emptyList()

        return runCatching {
            val items = JSONArray(raw)
            buildList {
                for (index in 0 until items.length()) {
                    val item = items.optJSONObject(index) ?: continue
                    val id = item.optString("id").trim()
                    val name = item.optString("name").trim()
                    val role = item.optString("role").trim()
                    if (id.length >= 2 && name.length >= 2 && role.length >= 2) {
                        add(StaffMember(id, name, role))
                    }
                }
            }.distinctBy { it.id }
        }.getOrDefault(emptyList())
    }

    private fun saveCachedStaffMembers(staff: List<StaffMember>) {
        val items = JSONArray()
        staff.forEach { member ->
            items.put(
                JSONObject()
                    .put("id", member.id)
                    .put("name", member.name)
                    .put("role", member.role)
            )
        }

        preferences.edit()
            .putString(PREF_STAFF_DIRECTORY_JSON, items.toString())
            .putLong(PREF_STAFF_DIRECTORY_SYNCED_AT, System.currentTimeMillis())
            .apply()
    }

    private fun cachedDirectoryTimeLabel(): String {
        val syncedAt = preferences.getLong(PREF_STAFF_DIRECTORY_SYNCED_AT, 0L)
        if (syncedAt <= 0L) return "هنوز با سامانه همگام نشده است."

        val elapsed = System.currentTimeMillis() - syncedAt
        return when {
            elapsed < 60_000L -> "آخرین همگام‌سازی: همین حالا"
            elapsed < 3_600_000L -> "آخرین همگام‌سازی: " + (elapsed / 60_000L) + " دقیقه پیش"
            elapsed < 86_400_000L -> "آخرین همگام‌سازی: " + (elapsed / 3_600_000L) + " ساعت پیش"
            else -> "آخرین همگام‌سازی: " + (elapsed / 86_400_000L) + " روز پیش"
        }
    }

    private fun syncRegisteredDevice(
        staffOverride: StaffMember? = registeredStaff(),
        onComplete: (() -> Unit)? = null,
    ) {
        val staff = staffOverride
        if (staff == null) {
            onComplete?.invoke()
            return
        }

        Thread {
            val result = runCatching {
                registerDeviceOnServer(staff)
            }.getOrNull()

            if (result != null) {
                val editor = preferences.edit().putString(PREF_DEVICE_STATUS, result.status)
                if (!result.authToken.isNullOrBlank()) {
                    StaffTelemetryStore.saveToken(this, result.authToken)
                }
                editor.apply()
                StaffTelemetry.schedulePeriodicSync(this)
                StaffTelemetry.enqueueHeartbeat(this)
            }

            runOnUiThread {
                if (result != null && staff.id == registeredStaff()?.id) {
                    setContentView(buildHome())
                }
                onComplete?.invoke()
            }
        }.start()
    }

    private fun registerDeviceOnServer(staff: StaffMember): DeviceRegistrationResult {
        val connection = (URL(BuildConfig.STAFF_DEVICE_REGISTER_URL).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 8_000
            readTimeout = 12_000
            doOutput = true
            useCaches = false
            setRequestProperty("Accept", "application/json")
            setRequestProperty("Content-Type", "application/json; charset=utf-8")
        }

        val payload = JSONObject()
            .put("deviceId", deviceId())
            .put("staffId", staff.id)
            .put("appVersionName", BuildConfig.VERSION_NAME)
            .put("appVersionCode", BuildConfig.VERSION_CODE)
            .put("managementMode", DeviceOwnerManager.state(this).mode.name.lowercase())
            .put("manufacturer", android.os.Build.MANUFACTURER.take(80))
            .put("model", android.os.Build.MODEL.take(120))
            .put("androidVersion", android.os.Build.VERSION.RELEASE.orEmpty().take(40))
            .put("sdkInt", android.os.Build.VERSION.SDK_INT)
            .put("authTokenPresent", StaffTelemetryStore.token(this).isNotBlank())

        return try {
            connection.outputStream.bufferedWriter(Charsets.UTF_8).use { writer ->
                writer.write(payload.toString())
            }

            val statusCode = connection.responseCode
            if (statusCode !in 200..299) return DeviceRegistrationResult("error", null)

            val body = connection.inputStream.bufferedReader().use { it.readText() }
            val root = JSONObject(body)
            if (!root.optBoolean("success", false)) return DeviceRegistrationResult("error", null)

            DeviceRegistrationResult(
                status = root.optString("status", "pending").ifBlank { "pending" },
                authToken = root.optString("authToken", "").ifBlank { null },
            )
        } finally {
            connection.disconnect()
        }
    }

    private fun deviceStatusLabel(): String {
        return when (preferences.getString(PREF_DEVICE_STATUS, null)) {
            "active" -> "دستگاه توسط مدیریت تأیید شده است."
            "pending" -> "ثبت دستگاه انجام شده و در انتظار تأیید مدیریت است."
            "revoked" -> "دسترسی این دستگاه لغو شده است؛ برای فعال‌سازی دوباره با مدیریت هماهنگ کنید."
            "error" -> "آخرین تلاش برای ثبت دستگاه ناموفق بود؛ اینترنت و سامانه را بررسی کنید."
            else -> "ثبت دستگاه هنوز با سامانه انجام نشده است."
        }
    }

    private fun buildStaffRegistrationScreen(): ScrollView {
        val scrollView = ScrollView(this).apply {
            setBackgroundColor(getColor(R.color.hirmand_bg))
        }

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(22), dp(28), dp(22), dp(30))
        }
        scrollView.addView(root)

        val mark = TextView(this).apply {
            text = "◆"
            textSize = 28f
            setTextColor(getColor(R.color.hirmand_gold))
            gravity = Gravity.CENTER
        }
        root.addView(mark, lp(-1, dp(52)))

        val title = TextView(this).apply {
            text = "ثبت کارمند"
            textSize = 27f
            setTextColor(getColor(R.color.hirmand_text))
            gravity = Gravity.CENTER
            setTypeface(typeface, Typeface.BOLD)
        }
        root.addView(title, lp(-1, -2).apply { topMargin = dp(12) })

        val subtitle = TextView(this).apply {
            text = "این گوشی برای استفادهٔ کدام کارمند هیرمند ثبت می‌شود؟"
            textSize = 15f
            setTextColor(getColor(R.color.hirmand_muted))
            gravity = Gravity.CENTER
        }
        root.addView(subtitle, lp(-1, -2).apply {
            topMargin = dp(6)
            bottomMargin = dp(20)
        })

        root.addView(buildRegistrationNoticeCard(), lp(-1, -2).apply {
            bottomMargin = dp(18)
        })

        val section = TextView(this).apply {
            text = "انتخاب کارمند"
            textSize = 18f
            setTextColor(getColor(R.color.hirmand_text))
            setTypeface(typeface, Typeface.BOLD)
            gravity = Gravity.RIGHT
        }
        root.addView(section, lp(-1, -2).apply { bottomMargin = dp(9) })

        var selectedId: String? = null
        val cards = mutableMapOf<String, MaterialCardView>()
        val badges = mutableMapOf<String, TextView>()

        val registerButton = MaterialButton(this).apply {
            text = "ثبت این کارمند روی گوشی"
            textSize = 14f
            isAllCaps = false
            isEnabled = false
        }

        availableStaffMembers.forEach { member ->
            val card = createRegistrationCard(
                member = member,
                onSelected = {
                    selectedId = member.id

                    cards.forEach { (id, item) ->
                        val selected = id == member.id
                        item.strokeWidth = dp(if (selected) 2 else 1)
                        item.strokeColor = getColor(
                            if (selected) R.color.hirmand_gold else R.color.hirmand_surface_2
                        )
                    }

                    badges.forEach { (id, badge) ->
                        badge.text = if (id == member.id) "انتخاب‌شده" else "انتخاب"
                    }

                    registerButton.isEnabled = true
                },
            )

            cards[member.id] = card
            badges[member.id] = card.findViewWithTag("staff-selection-badge") as TextView
            root.addView(card, lp(-1, dp(90)).apply {
                bottomMargin = dp(12)
            })
        }

        registerButton.setOnClickListener {
            val staffId = selectedId ?: return@setOnClickListener
            val person = (availableStaffMembers + fallbackStaffMembers)
                .distinctBy { it.id }
                .firstOrNull { it.id == staffId }
                ?: return@setOnClickListener

            preferences.edit()
                .putString(PREF_STAFF_ID, person.id)
                .putLong(PREF_STAFF_REGISTERED_AT, System.currentTimeMillis())
                .putString(PREF_DEVICE_STATUS, "pending")
                .apply()

            Toast.makeText(
                this,
                "کارمند «" + person.name + "» روی این گوشی ثبت شد.",
                Toast.LENGTH_LONG
            ).show()

            syncRegisteredDevice(person) {
                renderPermissionCenter()
            }
        }

        root.addView(registerButton, lp(-1, dp(54)).apply {
            topMargin = dp(10)
        })

        val note = TextView(this).apply {
            text = "فهرست کارکنان از سامانه هیرمند دریافت می‌شود و در صورت قطع موقت اینترنت، آخرین فهرست موفق روی همین گوشی استفاده می‌شود.\n" +
                cachedDirectoryTimeLabel()
            textSize = 12f
            setTextColor(getColor(R.color.hirmand_muted))
            gravity = Gravity.CENTER
            setLineSpacing(dp(1).toFloat(), 1.0f)
        }
        root.addView(note, lp(-1, -2).apply {
            topMargin = dp(13)
        })

        val refreshButton = MaterialButton(this).apply {
            text = if (isRefreshingStaffDirectory) "در حال به‌روزرسانی فهرست…" else "به‌روزرسانی فهرست کارکنان"
            textSize = 12.5f
            isAllCaps = false
            isEnabled = !isRefreshingStaffDirectory
            setOnClickListener { refreshStaffDirectory() }
        }
        root.addView(refreshButton, lp(-1, dp(48)).apply {
            topMargin = dp(10)
        })

        return scrollView
    }

    private fun buildRegistrationNoticeCard(): MaterialCardView {
        val card = MaterialCardView(this).apply {
            radius = dp(17).toFloat()
            setCardBackgroundColor(getColor(R.color.hirmand_surface))
            strokeWidth = dp(1)
            strokeColor = getColor(R.color.hirmand_gold_dark)
        }

        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(15), dp(16), dp(15))
        }

        val title = TextView(this).apply {
            text = "قبل از ثبت"
            textSize = 15f
            setTextColor(getColor(R.color.hirmand_gold))
            setTypeface(typeface, Typeface.BOLD)
        }

        val body = TextView(this).apply {
            text = "یک کارمند را انتخاب کنید. شناسهٔ انتخاب‌شده و زمان ثبت، فعلاً فقط در حافظهٔ داخلی همین اپ نگهداری می‌شود. دسترسی‌های گوشی و اتصال به سامانهٔ هیرمند در این مرحله فعال نمی‌شوند."
            textSize = 12.5f
            setTextColor(getColor(R.color.hirmand_muted))
            setLineSpacing(dp(2).toFloat(), 1.0f)
        }

        content.addView(title, lp(-1, -2))
        content.addView(body, lp(-1, -2).apply { topMargin = dp(7) })
        card.addView(content)
        return card
    }

    private fun createRegistrationCard(
        member: StaffMember,
        onSelected: () -> Unit,
    ): MaterialCardView {
        val card = MaterialCardView(this).apply {
            radius = dp(18).toFloat()
            setCardBackgroundColor(getColor(R.color.hirmand_surface))
            strokeWidth = dp(1)
            strokeColor = getColor(R.color.hirmand_surface_2)
            isClickable = true
            isFocusable = true
            contentDescription = "ثبت " + member.name + "، " + member.role
        }

        val content = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            layoutDirection = android.view.View.LAYOUT_DIRECTION_RTL
            setPadding(dp(16), dp(10), dp(16), dp(10))
        }

        val copy = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_VERTICAL
        }

        val name = TextView(this).apply {
            text = member.name
            textSize = 17f
            setTextColor(getColor(R.color.hirmand_text))
            setTypeface(typeface, Typeface.BOLD)
        }

        val role = TextView(this).apply {
            text = member.role
            textSize = 12.5f
            setTextColor(getColor(R.color.hirmand_muted))
        }

        copy.addView(name, lp(-2, -2))
        copy.addView(role, lp(-2, -2).apply { topMargin = dp(3) })

        val badge = TextView(this).apply {
            tag = "staff-selection-badge"
            text = "انتخاب"
            textSize = 11f
            setTextColor(getColor(R.color.hirmand_gold))
            gravity = Gravity.CENTER
        }

        content.addView(copy, LinearLayout.LayoutParams(0, -1, 1f))
        content.addView(badge, lp(dp(92), -1))

        card.addView(content)
        card.setOnClickListener { onSelected() }
        return card
    }

    private fun buildHome(): ScrollView {
        val staff = registeredStaff() ?: return buildStaffRegistrationScreen()

        val scrollView = ScrollView(this).apply {
            setBackgroundColor(getColor(R.color.hirmand_bg))
        }

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(22), dp(30), dp(22), dp(28))
        }
        scrollView.addView(root)

        val mark = TextView(this).apply {
            text = "◆"
            textSize = 28f
            setTextColor(getColor(R.color.hirmand_gold))
            gravity = Gravity.CENTER
        }
        root.addView(mark, lp(58, 58))

        val title = TextView(this).apply {
            text = getString(R.string.app_name)
            textSize = 28f
            setTextColor(getColor(R.color.hirmand_text))
            gravity = Gravity.CENTER
            setTypeface(typeface, Typeface.BOLD)
        }
        root.addView(title, lp(-1, -2).apply { topMargin = dp(12) })

        val subtitle = TextView(this).apply {
            text = getString(R.string.app_subtitle)
            textSize = 15f
            setTextColor(getColor(R.color.hirmand_muted))
            gravity = Gravity.CENTER
        }
        root.addView(subtitle, lp(-1, -2).apply { topMargin = dp(5) })

        root.addView(buildRegisteredStaffCard(staff), lp(-1, -2).apply {
            topMargin = dp(24)
            bottomMargin = dp(12)
        })

        root.addView(
            buildDeviceStatusCard(staff),
            lp(-1, -2).apply { bottomMargin = dp(16) },
        )

        val status = TextView(this).apply {
            text = when (DeviceOwnerManager.state(this).mode) {
                DeviceManagementMode.DEVICE_OWNER ->
                    "گوشی در حالت Fully Managed / Device Owner مدیریت می‌شود."
                DeviceManagementMode.PROFILE_OWNER ->
                    "گوشی از طریق Work Profile / Profile Owner برای محیط کاری مدیریت می‌شود."
                DeviceManagementMode.LEGACY_DEVICE_ADMIN ->
                    "Device Admin قدیمی فعال است؛ برای مدیریت مدرن Android Enterprise را استفاده کنید."
                DeviceManagementMode.UNMANAGED ->
                    "دستگاه هنوز در هیچ حالت مدیریت سازمانی ثبت نشده است."
            }
            textSize = 12.5f
            setTextColor(getColor(R.color.hirmand_muted))
            gravity = Gravity.CENTER
        }
        root.addView(status, lp(-1, -2).apply { topMargin = dp(4) })

        val permissionButton = MaterialButton(this).apply {
            text = "مرکز دسترسی‌ها و آماده‌سازی تلفن"
            textSize = 13f
            isAllCaps = false
            setOnClickListener { renderPermissionCenter() }
        }
        root.addView(permissionButton, lp(-1, dp(52)).apply {
            topMargin = dp(16)
            bottomMargin = dp(8)
        })

        val changeButton = MaterialButton(this).apply {
            text = "تغییر کارمند ثبت‌شده"
            textSize = 13f
            isAllCaps = false
            setOnClickListener {
                setContentView(buildStaffRegistrationScreen())
            }
        }
        root.addView(changeButton, lp(-1, dp(50)).apply {
            topMargin = dp(15)
        })

        return scrollView
    }

    private fun buildDeviceStatusCard(staff: StaffMember): MaterialCardView {
        val card = MaterialCardView(this).apply {
            radius = dp(18).toFloat()
            setCardBackgroundColor(getColor(R.color.hirmand_surface))
            strokeWidth = dp(1)
            strokeColor = getColor(R.color.hirmand_gold_dark)
        }

        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(15), dp(16), dp(15))
            layoutDirection = android.view.View.LAYOUT_DIRECTION_RTL
        }

        val title = TextView(this).apply {
            text = "وضعیت ثبت دستگاه"
            textSize = 15f
            setTextColor(getColor(R.color.hirmand_gold))
            setTypeface(typeface, Typeface.BOLD)
        }

        val idText = TextView(this).apply {
            text = "شناسه دستگاه: " + deviceId().take(18) + "…"
            textSize = 11.5f
            setTextColor(getColor(R.color.hirmand_muted))
        }

        val status = TextView(this).apply {
            text = deviceStatusLabel()
            textSize = 12.5f
            setTextColor(getColor(R.color.hirmand_text))
            setLineSpacing(dp(1).toFloat(), 1.0f)
        }

        val refresh = MaterialButton(this).apply {
            text = "بررسی دوباره وضعیت دستگاه"
            textSize = 12f
            isAllCaps = false
            setOnClickListener {
                isEnabled = false
                text = "در حال بررسی…"
                syncRegisteredDevice(staff) {
                    isEnabled = true
                    text = "بررسی دوباره وضعیت دستگاه"
                }
            }
        }

        content.addView(title, lp(-1, -2))
        content.addView(idText, lp(-1, -2).apply { topMargin = dp(5) })
        content.addView(status, lp(-1, -2).apply { topMargin = dp(7) })
        content.addView(refresh, lp(-1, dp(47)).apply { topMargin = dp(10) })
        card.addView(content)
        return card
    }

    private fun buildRegisteredStaffCard(staff: StaffMember): MaterialCardView {
        val card = MaterialCardView(this).apply {
            radius = dp(19).toFloat()
            setCardBackgroundColor(getColor(R.color.hirmand_surface))
            strokeWidth = dp(2)
            strokeColor = getColor(R.color.hirmand_gold)
        }

        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(17), dp(17), dp(17), dp(17))
            layoutDirection = android.view.View.LAYOUT_DIRECTION_RTL
        }

        val label = TextView(this).apply {
            text = "کارمند ثبت‌شده روی این گوشی"
            textSize = 12f
            setTextColor(getColor(R.color.hirmand_gold))
        }

        val name = TextView(this).apply {
            text = staff.name
            textSize = 21f
            setTextColor(getColor(R.color.hirmand_text))
            setTypeface(typeface, Typeface.BOLD)
        }

        val role = TextView(this).apply {
            text = staff.role
            textSize = 13f
            setTextColor(getColor(R.color.hirmand_muted))
        }

        content.addView(label, lp(-1, -2))
        content.addView(name, lp(-1, -2).apply { topMargin = dp(5) })
        content.addView(role, lp(-1, -2).apply { topMargin = dp(3) })

        card.addView(content)
        return card
    }

    private fun lp(width: Int, height: Int): LinearLayout.LayoutParams =
        LinearLayout.LayoutParams(width, height)

    private fun dp(value: Int): Int =
        (value * resources.displayMetrics.density).toInt()
}
