# املاک هیرمند — اپ کارکنان

این پوشه یک پروژه Android مستقل برای کارکنان بنگاه است.

## استقلال

این اپ عمداً هیچ کدی از پروژهٔ قدیمی Phone Bridge را import یا reuse نمی‌کند و به زیرساخت Phone Bridge، APIهای `device-sync`، دیتابیس سایت، توکن دستگاه یا سرویس‌های قبلی متصل نیست.

- namespace: `ir.hirmand.staff`
- applicationId: `ir.hirmand.staff`
- نسخه فعلی: `0.5.0`
- حداقل Android: API 26
- target/compile: API 35
- Java/Kotlin target: 17

## وضعیت فعلی

صفحهٔ پایهٔ اپ با نام **املاک هیرمند** ساخته شده است. پس از پذیرش توافق‌نامه، کاربر باید یکی از کارکنان را از فهرست زندهٔ سامانهٔ هیرمند انتخاب و ثبت کند؛ شناسهٔ کارمند و زمان ثبت فقط به‌صورت محلی روی همان گوشی ذخیره می‌شوند. تا پیش از این ثبت، ورود به صفحهٔ اصلی اپ ممکن نیست.

### فهرست زندهٔ کارکنان

اپ برای انتخاب کارمند، فقط این سه فیلد را از API اختصاصی زیر می‌گیرد:

- `id`
- `name`
- `role`

نشانی API:

`https://www.hirmandrealestate.ir/api/mobile/staff-directory`

این endpoint به فهرست فعال مشاوران سایت متصل است. بنابراین وقتی کارمند جدید در پنل مدیریت، بخش مشاوران/کارکنان، با وضعیت فعال ثبت شود، پس از به‌روزرسانی فهرست در اپ نمایش داده می‌شود و نیاز به ساخت APK جدید نیست.

اپ آخرین فهرست موفق را در حافظهٔ داخلی نگه می‌دارد و در اجرای بعد ابتدا همان cache را نمایش می‌دهد؛ سپس در پس‌زمینه برای فهرست جدید تلاش می‌کند. اگر شبکه در دسترس نباشد، cache یا فهرست پایهٔ داخلی استفاده می‌شود.

این API فقط اطلاعات لازم برای «انتخاب کارمند» را برمی‌گرداند و به Phone Bridge قدیمی، APIهای `device-sync`، دسترسی‌های حساس گوشی یا همگام‌سازی داده‌های دستگاه متصل نیست.


## مرکز دسترسی‌ها

پس از ثبت نخستین کارمند روی گوشی، اپ مستقیماً Permission Center را باز می‌کند. این صفحه وضعیت واقعی Android را برای این موارد نشان می‌دهد:

1. Enable accessibility
2. Activate all permissions (۹ دسته Runtime)
3. Company / personal device management
4. Enable access to notifications
5. Screen capture permission
6. Usage data
7. Overlay on other apps
8. Disable app notifications
9. Activate location
10. Do not optimize battery usage

هر مورد با Switch وضعیت واقعی سیستم را نشان می‌دهد و GO کاربر را به صفحه یا فرایند رسمی Android می‌برد. مدیریت سازمانی نیز بر اساس نوع دستگاه به دو مسیر تقسیم می‌شود: Fully Managed / Device Owner برای گوشی شرکتی و Work Profile / Profile Owner برای گوشی شخصی. مجوزهای حساس همچنان تابع قوانین Android هستند.

نکته مهم: مجوزهای SMS و Call Log روی Android/توزیع‌کننده‌های مختلف محدودیت‌های ویژه دارند و ممکن است صرفاً با درخواست runtime قابل اعطا نباشند. همچنین Screen Capture در Android 14+ برای هر جلسه نیازمند تأیید دوباره کاربر است. قابلیت‌های حساس نیز تا زمانی که سرویس مربوطه واقعاً پیاده‌سازی نشده، داده‌ای را جمع‌آوری یا به سامانه ارسال نمی‌کنند.

## ساخت و بررسی CI

workflow مستقل .github/workflows/android-staff-ci.yml روی تغییرات android-staff/** این موارد را اجرا می‌کند:

- check
- lintDebug
- assembleDebug

در پایان، Debug APK به‌عنوان Artifact با نام hirmand-staff-debug-apk منتشر می‌شود.


## همگام‌سازی سلامت اپ

نسخهٔ 0.5.0 یک زیرساخت مستقل برای احراز هویت دستگاه، صف محلی رویدادها، همگام‌سازی دوره‌ای با WorkManager و ثبت وضعیت سلامت اپ اضافه می‌کند. این مسیر از زیرساخت Phone Bridge قدیمی جداست.

داده‌های این نسخه به رویدادهای سلامت اپ و وضعیت مجوزها محدود شده‌اند؛ collector فعال برای محتوای اعلان‌ها، Accessibility events، فایل‌های شخصی یا موقعیت مکانی در این نسخه وجود ندارد.

## مدیریت سازمانی Android Enterprise

نسخهٔ فعلی DPC پایهٔ Android Enterprise را برای دو سناریو پیاده‌سازی می‌کند: **گوشی شرکتی → Fully Managed / Device Owner** و **گوشی شخصی → Work Profile / Profile Owner**. Permission Center وضعیت واقعی حالت مدیریت را نشان می‌دهد و مسیر شروع Work Profile را نیز در خود اپ دارد.

### چه چیزی اضافه شده است؟

- `HirmandDeviceAdminReceiver` به‌عنوان DPC receiver باقی می‌ماند.
- `HirmandProvisioningActivity` برای جریان‌های جدید Android 12+ یعنی `GET_PROVISIONING_MODE` و `ADMIN_POLICY_COMPLIANCE` ثبت شده است.
- Provisioning با توجه به حالت درخواست‌شده، **Fully Managed Device** یا **Managed Profile** را انتخاب می‌کند.
- پس از Provisioning موفق، نام سازمان «املاک هیرمند» به‌صورت غیرتهاجمی روی سیاست دستگاه ثبت می‌شود.
- Permission Center وضعیت `Device Owner / Profile Owner / Legacy Device Admin / Unmanaged` را نمایش می‌دهد.
- در حالت Device Owner، DPC می‌تواند Grantهای سنسوری مشخص را طبق سیاست صریح اپ مدیریت کند؛ در Work Profile این Auto-Grant سنسوری فعال نیست و Android کنترل بیشتری را برای کاربر نگه می‌دارد.
- هیچ collector جدیدی برای موقعیت مکانی، محتوای اعلان، Accessibility events یا فایل‌های شخصی با فعال شدن Device Owner اجرا نمی‌شود.

### گوشی شخصی: Work Profile / BYOD

روی گوشی شخصی، از Permission Center گزینهٔ «گوشی شخصی» را انتخاب کنید. اپ از `ACTION_PROVISION_MANAGED_PROFILE` استفاده می‌کند و Android مراحل ایجاد Work Profile را نمایش می‌دهد. بعد از پایان Provisioning، نسخهٔ Hirmand داخل Work Profile به‌عنوان Profile Owner اجرا می‌شود.

در حالت Work Profile، مدیریت سازمانی به فضای کاری محدود است و این اپ نباید آن را معادل Fully Managed کردن کل گوشی شخصی تلقی کند. مجوزهای حساس داخل Work Profile نیز تابع سیاست و کنترل‌های Android هستند و DPC پروفایل نمی‌تواند مجوزهای سنسوری محدودشده برای Profile Owner را مانند Device Owner به‌صورت خودکار Grant کند.

### گوشی شرکتی: Fully Managed / Device Owner

برای گوشی متعلق به شرکت، مسیر پیشنهادی همچنان Fully Managed / Device Owner است.

### راه‌اندازی آزمایشی با ADB

برای تست یک دستگاه شرکت، بعد از نصب APK روی دستگاه و آماده‌سازی آن مطابق الزامات Android Enterprise، می‌توان DPC را با ADB به Device Owner تبدیل کرد:

**Release**

`adb shell dpm set-device-owner ir.hirmand.staff/.HirmandDeviceAdminReceiver`

**Debug**

`adb shell dpm set-device-owner ir.hirmand.staff.debug/.HirmandDeviceAdminReceiver`

این روش مخصوص توسعه/راه‌اندازی کنترل‌شده است. روی دستگاهی که قبلاً حساب‌ها، Work Profile یا مدیریت سازمانی دیگری دارد ممکن است Provisioning مجاز نباشد. برای استقرار واقعی ناوگان، Android Enterprise روش‌هایی مثل QR enrollment را توصیه می‌کند.

### مسیر عملیاتی پیشنهادی

1. دستگاه شرکتی را آماده/Factory Reset کنید و حساب‌ها یا Work Profile قبلی را حذف کنید.
2. APK نسخهٔ موردنظر هیرمند را نصب کنید.
3. با ADB در محیط تست یا با روش enrollment سازمانی، `HirmandDeviceAdminReceiver` را به‌عنوان Device Owner Provision کنید.
4. دستگاه را وارد اپ کنید و کارمند مربوط را ثبت کنید.
5. در Permission Center وضعیت **Fully Managed / Device Owner فعال** را بررسی کنید.
6. سیاست‌های بعدی دستگاه را جداگانه و قابل ممیزی اضافه کنید؛ Device Owner یا Profile Owner به‌تنهایی جایگزین مجوزها و محدودیت‌های Android نیستند.

برای Android 12+، Provisioning جدید به activityهای مخصوص DPC نیاز دارد؛ برای دستگاه‌های واقعی شرکت، enrollment باید از فرایند مدیریت Android Enterprise پیروی کند.


### مدیریت خودکار مجوزهای سنسوری برای Device Owner

در حالت Fully Managed / Device Owner، DPC هیرمند به‌صورت صریح و محدود Grant این مجوزهای سنسوری را مدیریت می‌کند:

- Location: ACCESS_COARSE_LOCATION، ACCESS_FINE_LOCATION و در Android 10+، ACCESS_BACKGROUND_LOCATION
- Camera: CAMERA
- Microphone: RECORD_AUDIO

این سیاست فقط وقتی اجرا می‌شود که همین بسته واقعاً Device Owner باشد؛ در حالت Unmanaged یا Profile Owner هیچ Grant خودکاری انجام نمی‌شود. Provisioning نیز عمداً از گزینهٔ opt-out سنسورها استفاده نمی‌کند تا Device Owner بتواند این Grantها را مدیریت کند. فعال شدن این سیاست به‌تنهایی هیچ collector یا سرویس ردیابی جدیدی راه‌اندازی نمی‌کند.
