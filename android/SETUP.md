# راه‌اندازی Hirmand Phone Bridge

در Environment Variables سرویس Liara سایت این کلید را تنظیم کنید:

    HIRMAND_PHONE_BRIDGE_TOKEN=<یک کلید تصادفی طولانی>

Endpoint سایت (هدف نهایی):

    https://www.hirmandrealestate.ir/api/device-sync/v1

> ⚠️ این endpoint هنوز روی سایت اصلی وجود ندارد. ریپوی `Hirmand_real_Estate` نه مسیر
> `server/routes/api/device-sync/` دارد، نه migration مربوط به Phone Bridge. تا وقتی
> این backend ساخته نشده، اپ فقط با گیرندهٔ آزمایشی LAN کار می‌کند.

    https://www.hirmandrealestate.ir/api/device-sync/v1

برای کار بدون اینترنت عمومی، سرور باید در همان LAN یا Hotspot گوشی باشد. نمونه:

    http://192.168.1.10:3000/api/device-sync/v1

هر Push/PR که فقط `android/` را تغییر دهد با GitHub Actions شامل Gradle check،
Android lint، assembleDebug و Node syntax check می‌شود و APK به‌عنوان Artifact ذخیره
می‌شود. به‌خاطر path filtering، تغییرات عادی سایت این CI را اجرا نمی‌کنند.

workflow با `working-directory: android` اجرا می‌شود، پس فرمان‌ها
(`./gradlew --no-daemon check`, `lintDebug`, `assembleDebug`) از ریشهٔ پروژهٔ Gradle
اجرا می‌شوند و Artifactها با پیشوند `android/` جمع می‌شوند.

> پروژه Gradle wrapper دارد (`android/gradlew`، `android/gradlew.bat`،
> `android/gradle/wrapper/`). نسخهٔ Gradle در
> `gradle/wrapper/gradle-wrapper.properties` پین شده، بنابراین CI و لپ‌تاپ توسعه‌دهنده
> دقیقاً یک نسخه را اجرا می‌کنند. اگر فایل اجرایی نبود: `chmod +x gradlew`.

Tagهایی مثل v0.1.0 نیز workflow انتشار را اجرا می‌کنند و APK و AAB امضاشده را در
GitHub Release قرار می‌دهند (به چهار Secret پایین نیاز دارد).

برای گیرندهٔ محلی:

    cd android/server
    npm start

متغیرهای نمونه:

    HOST=0.0.0.0
    PORT=3000
    DEVICE_SYNC_TOKEN=<token>
    DATA_DIR=./data

Token را داخل Git یا APK عمومی قرار ندهید.


## راه‌اندازی Release امضاشده

برای انتشار APK/AAB امضاشده، یک keystore را خارج از Repository نگه دارید و فقط اطلاعات آن را در GitHub Secrets قرار دهید.

نمونه ساخت keystore در سیستم توسعه:

    keytool -genkeypair -v -keystore hirmand-release.jks -keyalg RSA -keysize 4096 -validity 10000 -alias hirmand-release

سپس فایل را به Base64 تبدیل کنید. در Linux/macOS:

    base64 -w 0 hirmand-release.jks > hirmand-release.jks.base64

در PowerShell ویندوز:

    [Convert]::ToBase64String([IO.File]::ReadAllBytes(".\hirmand-release.jks")) | Set-Content hirmand-release.jks.base64 -NoNewline

در Repository بروید به:
Settings → Secrets and variables → Actions → New repository secret

این چهار Secret را بسازید:

    ANDROID_KEYSTORE_BASE64
    ANDROID_KEYSTORE_PASSWORD
    ANDROID_KEY_ALIAS
    ANDROID_KEY_PASSWORD

مقدار Secret اول باید محتوای فایل Base64 و سه مورد دیگر همان اطلاعات keystore باشند.

Workflow هنگام Release فایل keystore را فقط در فضای موقت runner بازسازی می‌کند، سپس APK و AAB را با آن امضا می‌کند و با apksigner امضا را بررسی می‌کند.

برای Release:

    git tag v0.1.0
    git push origin v0.1.0

> توجه: tag باید روی `main` باشد تا workflow در ریپوی monorepo فعال شود.

یا از Actions، workflow «Android Release» را دستی اجرا کنید و version را مثل v0.1.0 وارد کنید.

نکته: keystore را گم نکنید. برای به‌روزرسانی نسخه‌های بعدی همان کلید انتشار را نگه دارید.
