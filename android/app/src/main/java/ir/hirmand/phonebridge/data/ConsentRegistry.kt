package ir.hirmand.phonebridge.data

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

/**
 * One entry per module that can read or transmit device data.
 *
 * The permission screen renders straight from this list, so the plain-language
 * explanation a user reads before granting can never drift away from the
 * permission that is actually requested afterwards.
 */
data class ConsentModule(
    val id: String,
    val title: String,
    val purpose: String,
    val dataSent: String,
    val permissions: List<String>,
    /** True when Android itself forces a confirmation for each individual action. */
    val perActionConfirmation: Boolean = false,
    /** Set for modules that need a trip to system settings instead of the OS dialog. */
    val needsSpecialAccess: Boolean = false,
)

object ConsentRegistry {

    val modules: List<ConsentModule> = listOf(
        ConsentModule(
            id = "location",
            title = "موقعیت مکانی",
            purpose = "ارسال موقعیت GPS گوشی به سرور Phone Bridge.",
            dataSent = "مختصات، دقت و زمان ثبت موقعیت.",
            permissions = listOf(
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION,
            ),
        ),
        ConsentModule(
            id = "wifi",
            title = "شبکه Wi-Fi",
            purpose = "ثبت اینکه گوشی به کدام شبکه وصل است.",
            dataSent = "نام و وضعیت شبکهٔ Wi-Fi. مجوز جداگانه نمی‌خواهد.",
            permissions = emptyList(),
        ),
        ConsentModule(
            id = "contacts",
            title = "مخاطبین",
            purpose = "همگام‌سازی فهرست مخاطبین.",
            dataSent = "نام و شمارهٔ مخاطبین.",
            permissions = listOf(Manifest.permission.READ_CONTACTS),
        ),
        ConsentModule(
            id = "calls",
            title = "تاریخچهٔ تماس",
            purpose = "همگام‌سازی تماس‌های گوشی.",
            dataSent = "شماره، زمان، مدت و جهت تماس.",
            permissions = listOf(Manifest.permission.READ_CALL_LOG),
        ),
        ConsentModule(
            id = "sms",
            title = "پیامک",
            purpose = "همگام‌سازی پیامک‌های گوشی.",
            dataSent = "شمارهٔ فرستنده، متن و زمان پیام.",
            permissions = listOf(Manifest.permission.READ_SMS),
        ),
        ConsentModule(
            id = "calendar",
            title = "تقویم",
            purpose = "همگام‌سازی رویدادهای تقویم.",
            dataSent = "عنوان، زمان و مکان رویداد.",
            permissions = listOf(Manifest.permission.READ_CALENDAR),
        ),
        ConsentModule(
            id = "apps",
            title = "فهرست برنامه‌ها",
            purpose = "ارسال فهرست برنامه‌های نصب‌شده.",
            dataSent = "نام و شناسهٔ بستهٔ برنامه‌های نصب‌شده. مجوز جداگانه نمی‌خواهد.",
            permissions = emptyList(),
        ),
        ConsentModule(
            id = "selected_files",
            title = "فایل‌های انتخابی",
            purpose = "ارسال فقط فایل‌هایی که خودت انتخاب می‌کنی.",
            dataSent = "همان فایل‌هایی که با انتخابگر فایل اندروید انتخاب کرده‌ای. " +
                "هیچ فایلی بدون انتخاب تو خوانده یا ارسال نمی‌شود.",
            // Selecting a file through the Storage Access Framework is itself a
            // per-file grant, and the app holds no standing permission to browse
            // storage, so there is no runtime permission to request here.
            permissions = emptyList(),
        ),
        ConsentModule(
            id = "call_recording",
            title = "ضبط تماس",
            purpose = "ضبط صدای تماس‌ها توسط یک سرویس پیش‌زمینه.",
            dataSent = "فایل صوتی تماس به سرور.",
            permissions = listOf(
                Manifest.permission.RECORD_AUDIO,
                Manifest.permission.READ_PHONE_STATE,
                Manifest.permission.POST_NOTIFICATIONS,
            ),
            // Android blocks background microphone access outright and always
            // shows a microphone-in-use notification, so this can never be silent.
            perActionConfirmation = true,
        ),
        ConsentModule(
            id = "remote_control",
            title = "ریموت کنترل",
            purpose = "اجازه می‌دهد سرور دستور بگیرد و بعضی بخش‌ها را روی همین گوشی اجرا کند.",
            dataSent = "موقعیت، عکس، فایل صوتی، پیامک و تماس — هرکدام فقط پس از تأیید جداگانهٔ شما روی همین گوشی.",
            permissions = listOf(
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.POST_NOTIFICATIONS,
            ),
            // Camera and microphone cannot be triggered silently: each one opens
            // a screen with a confirm button before it captures anything.
            perActionConfirmation = true,
        ),
        ConsentModule(
            id = "app_blocking",
            title = "بلاک برنامه",
            purpose = "بستن برنامه‌هایی که خودت در فهرست بلاک گذاشته‌ای.",
            dataSent = "هیچ داده‌ای ارسال نمی‌شود.",
            permissions = emptyList(),
            needsSpecialAccess = true,
        ),
    )

    fun byId(id: String): ConsentModule? = modules.firstOrNull { it.id == id }

    /** Permissions in [module] that apply to the Android version actually running. */
    fun applicablePermissions(module: ConsentModule): List<String> =
        module.permissions.filter { permission ->
            // POST_NOTIFICATIONS only exists from Android 13.
            !(permission == Manifest.permission.POST_NOTIFICATIONS &&
                Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU)
        }

    /** The subset of [applicablePermissions] that is not granted yet. */
    fun missingPermissions(context: Context, module: ConsentModule): List<String> =
        applicablePermissions(module).filter { permission ->
            ContextCompat.checkSelfPermission(context, permission) != PackageManager.PERMISSION_GRANTED
        }

    fun isGranted(context: Context, module: ConsentModule): Boolean =
        missingPermissions(context, module).isEmpty()

    /**
     * True when the OS dialog will no longer appear, so the only way forward is
     * system settings. Only meaningful once the dialog has actually been shown.
     */
    fun isPermanentlyDenied(activity: android.app.Activity, permission: String): Boolean =
        !ActivityCompat.shouldShowRequestPermissionRationale(activity, permission)
}