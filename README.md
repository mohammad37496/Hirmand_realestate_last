# املاک هیرمند | Hirmand Real Estate

وب‌سایت رسمی **گروه مشاورین املاک هیرمند** در اصفهان؛ برای خرید، فروش، رهن و اجاره ملک.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-38BDF8?logo=tailwindcss)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

درخواست‌های دستگاه‌های ثبت‌شدهٔ Phone Bridge در مسیرهای Sync، Heartbeat و File Upload با HMAC-SHA256 امضا می‌شوند و هر درخواست دارای timestamp و nonce یک‌بارمصرف است. سرور درخواست‌های خارج از پنجرهٔ زمانی مجاز، دارای امضای نادرست یا nonce تکراری را رد می‌کند.

Phone Bridge از نسخهٔ `versionCode`/`versionName` دستگاه نیز نگهداری می‌کند. در پنل مدیریت می‌توان برای هر دستگاه حداقل `versionCode` تعیین کرد؛ دستگاه قدیمی هشدار می‌گیرد و Sync آن با کد HTTP 426 متوقف می‌شود تا برنامه به نسخهٔ مجاز ارتقا پیدا کند. نسخهٔ پایهٔ فعلی Android روی `0.2.0 (20)` تنظیم شده است.

## امکانات کلیدی

| بخش | توضیح |
|-----|--------|
| **Theme برند** | طراحی RTL با هویت Navy + Brass روی زمینه کاغذی، مقیاس تایپوگرافی و شعاع یکدست |
| **خدمات** | خرید · فروش · رهن · اجاره |
| **فرم درخواست** | ثبت Lead واقعی در PostgreSQL + ارسال واتساپ |
| **CRM** | وضعیت Lead، منبع جذب، پیگیری سررسیدشده و پیگیری‌های آینده |
| **فایل‌های ملکی** | `/properties` + جستجو، فیلتر، مرتب‌سازی، صفحه جزئیات، مقایسه و علاقه‌مندی |
| **قیمت** | تشخیص کاهش قیمت و نمایش Badge کاهش قیمت روی فایل |
| **پیشنهاد هوشمند** | نمایش فایل‌های اخیراً دیده‌شده + دستیار تولید متن آگهی در پنل |
| **آنالیتیکس داخلی** | بازدید روزانه، بازدید یکتا، صفحات پربازدید، فایل‌های پربازدید، رویدادها و منابع جذب |
| **محله‌ها** | صفحات اختصاصی `/areas/:slug` برای محله‌های اصفهان با محتوای قابل ایندکس |
| **نقشه** | Google Maps، بلد، نشان و OpenStreetMap |
| **ابزارهای مالی** | تبدیل رهن/اجاره، محاسبه کمیسیون، وام و سود سپرده |
| **SEO** | Canonical، Open Graph، Structured Data، صفحات محله، Sitemap داینامیک و robots.txt |
| **دسترسی‌پذیری** | RTL کامل، Vazirmatn، skip link و پشتیبانی `prefers-reduced-motion` |
| **PWA** | Manifest، نصب‌پذیری و تجربه موبایل |
| **چاپ فایل** | نسخه چاپی تمیز برای ذخیره/پرینت مشخصات ملک |
| **Admin Pro** | فیلتر چندگانه فایل‌ها، مرتب‌سازی و امتیاز کیفیت آگهی |

---

## Stack

- **Frontend:** React 19 · TanStack Router / Start · Vite 8 · TypeScript
- **UI:** Tailwind CSS 4 · Lucide · Vazirmatn · Sonner
- **Data:** PostgreSQL / Neon (اختیاری) · PGlite (لوکال)
- **Deploy:** Nitro · Liara (Node.js) / Vercel-compatible Nitro runtime

---

## طراحی و تم

تمام لایه بصری در `src/theme-pro.css` متمرکز است و `src/styles.css` فقط نقش پایه (reset و کامپوننت‌های قدیمی) را دارد.

- **رنگ:** Navy + Brass روی کاغذ گرم. Brass رنگ اصلی اکشن‌ها است (دکمه اصلی، دکمه هدر) و Navy رنگ ساختاری (تیتر، سطوح تیره).
- **تایپوگرافی:** همه اندازه‌های رابط روی یک مقیاس ۹پله‌ای (`--fs-2xs` … `--fs-2xl`) و سه اندازه تیتر (`--fs-h1` … `--fs-h3`) می‌نشینند؛ دیگر اندازه پرت و نیم‌پیکسلی در کامپوننت‌ها وجود ندارد.
- **شعاع و عمق:** فقط `--r-xs` … `--r-2xl` و سه سطح سایه `--el-1` … `--el-3`. هیچ شعاع hard-code شده‌ای باقی نمانده است.
- **کنتراست:** همه جفت‌های متن/پس‌زمینه حداقل WCAG AA (نسبت ۴٫۵:۱) را پاس می‌کنند.
- **دسترس‌پذیری لمسی:** کنترل‌های چیپ‌مانند (مقادیر سریع، دکمه تماس، دکمه کپی) حداقل ۴۴ پیکسل ارتفاع دارند.

---

## شروع سریع

```bash
git clone https://github.com/mohammad37496/Hirmand_real_Estate.git
cd Hirmand_real_Estate
npm install
npm run dev
```

سایت روی `http://localhost:8080` اجرا می‌شود.

## متغیرهای محیطی

| متغیر | توضیح | اجباری |
|-------|--------|--------|
| `DATABASE_URL` | اتصال PostgreSQL / Neon برای فایل‌ها، Leadها و Analytics | برای امکانات دیتابیسی |
| `HIRMAND_ADMIN_KEY` | کلید دسترسی به `/admin` | برای پنل ادمین |
| `VITE_SITE_URL` | آدرس نهایی و canonical سایت، ترجیحاً `https://www.hirmandrealestate.ir` | بسیار مهم |
| `VITE_GOOGLE_SITE_VERIFICATION` | توکن تأیید Google Search Console | اختیاری |
| `VITE_AUTH_ENABLED` | فعال‌سازی Better Auth | خیر |
| `BLOB_READ_WRITE_TOKEN` | فضای ذخیره‌سازی Vercel Blob برای رسانه‌های حجیم | اختیاری |
| `HIRMAND_PHONE_BRIDGE_TOKEN` | کلید خصوصی اپ Phone Bridge برای ارسال دادهٔ گوشی به `/api/device-sync/v1` | برای اتصال اپ الزامی |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | شمارنده مشترک محدودسازی تلاش ورود و آپلود | اختیاری ولی روی Vercel لازم |

> بدون `UPSTASH_*` محدودسازی نرخ در حافظه همان پروسه نگه‌داری می‌شود؛ برای `npm run dev`
> و سرور تک‌پروسه‌ای کافی است، ولی روی Vercel که هر درخواست ممکن است به نمونه دیگری
> برسد، شمارنده با هر cold start صفر می‌شود. پس از تنظیم این دو متغیر روی محیط
> تولید، محدودسازی بین همه نمونه‌ها مشترک می‌شود.

> آپلود آهنگ و رسانه بدون `BLOB_READ_WRITE_TOKEN` هم کار می‌کند: فایل‌ها در پایگاه داده
> ذخیره و از مسیر `/api/media/<id>` با پشتیبانی از Range (برای جابه‌جایی داخل آهنگ) سرو
> می‌شوند. با تنظیم این متغیر، فایل‌ها روی CDN قرار می‌گیرند و سقف حجم آپلود بالاتر می‌رود.

## SEO و Google

زیرساخت SEO پروژه برای برند **«املاک هیرمند»** روی نام برند + موقعیت جغرافیایی + صفحات خدمات و محله‌ها متمرکز شده است.

- عنوان و H1 صفحه اصلی شامل «املاک هیرمند» است.
- Structured Data شامل `RealEstateAgent` / `LocalBusiness`، `WebSite` و `SearchAction` است.
- هر محله صفحه مستقل با عنوان، توضیحات، Canonical و Structured Data دارد.
- Sitemap در `/sitemap.xml` به‌صورت داینامیک ساخته می‌شود و فایل‌های منتشرشده ملک را هم اضافه می‌کند.
- `robots.txt` پنل مدیریت را از ایندکس‌شدن خارج می‌کند.
- صفحات عمومی با لینک‌های قابل crawl در دسترس هستند.
- توکن Search Console از طریق `VITE_GOOGLE_SITE_VERIFICATION` قابل تزریق به `<head>` صفحه اصلی است.

### کارهای لازم برای Google

1. دامنه `www.hirmandrealestate.ir` را به Vercel وصل کنید و `VITE_SITE_URL=https://www.hirmandrealestate.ir` تنظیم باشد.
2. سایت را در Google Search Console تأیید کنید و `https://www.hirmandrealestate.ir/sitemap.xml` را Submit کنید.
3. برای صفحه اصلی و صفحات کلیدی Request Indexing بزنید.
4. Google Business Profile / Google Maps را با نام، تلفن و آدرس واقعی کسب‌وکار تکمیل و تأیید کنید.
5. محتوای واقعی و مفید برای محله‌ها و خدمات اضافه کنید و لینک‌های طبیعی و معتبر بسازید.

> **نکته:** هیچ کدی رتبه ۱ گوگل را تضمین نمی‌کند. هدف این تغییرات، تقویت سیگنال‌های فنی، محتوایی و محلی برای جست‌وجوی «املاک هیرمند» است.

## اتصال Phone Bridge

اپ **Hirmand Phone Bridge** می‌تواند داده‌های ماژول‌های انتخاب‌شدهٔ گوشی را به‌صورت کنترل‌شده به مسیر `/api/device-sync/v1` بفرستد. بسته‌ها ابتدا روی خود گوشی صف می‌شوند و بعد از برقراری شبکه دوباره ارسال می‌شوند. دادهٔ خام عمومی نیست و مشاهدهٔ آن فقط از بخش مدیریتی `/admin-phone-bridge` با مجوز امنیت مدیران انجام می‌شود.
در پنل /admin-phone-bridge برای هر دستگاه «سیاست دسترسی ماژول» نیز وجود دارد. مدیر دارای مجوز امنیت می‌تواند دریافت موقعیت، Wi‑Fi، مخاطبین، تماس‌ها، پیامک، تقویم، فهرست برنامه‌ها و فایل‌های انتخابی را مستقل از تنظیمات خود اپ محدود کند؛ این محدودیت در سمت سرور enforce می‌شود و بخش مسدودشده در دیتابیس ذخیره نمی‌شود.


امنیت API Phone Bridge علاوه بر توکن اختصاصی دستگاه، محدودسازی نرخ مشترک در PostgreSQL هم دارد: ثبت اولیهٔ دستگاه حداکثر ۵ تلاش در ۱۵ دقیقه، Sync حداکثر ۱۲۰ درخواست در ۱۰ دقیقه، Heartbeat حداکثر ۳۰ درخواست در ۱۰ دقیقه، آپلود فایل حداکثر ۴۰ درخواست در ۱۰ دقیقه و تست اتصال حداکثر ۶۰ درخواست در ۱۰ دقیقه. عبور از سقف باعث پاسخ HTTP 429 و محدودیت موقت همان درخواست‌کننده می‌شود.

برای استقرار سمت سایت، متغیر `HIRMAND_PHONE_BRIDGE_TOKEN` را در Environment پروژه تنظیم کنید و همان مقدار را در اپ وارد کنید. برای شبکهٔ داخلی می‌توانید Endpoint اپ را به IP خصوصی سرور داخل LAN تغییر دهید؛ برای HTTPS عمومی Endpoint پیش‌فرض `https://www.hirmandrealestate.ir/api/device-sync/v1` است.

## مسیرهای اصلی

```text
/                       صفحه اصلی
/properties             فهرست فایل‌ها
/properties/:slug       جزئیات هر ملک
/areas/:slug            صفحه اختصاصی محله
/compare                مقایسه فایل‌ها
/favorites              علاقه‌مندی‌ها
/admin                  پنل مدیریت
/tracking               باشگاه همکاران، ثبت قرارداد و کد رهگیری (noindex)
```

## پنل مدیریت

- افزودن، ویرایش، انتشار، پیش‌نویس، ویژه‌کردن و حذف فایل
- آپلود رسانه و آهنگ با آپلود قطعه‌قطعه (نوار پیشرفت واقعی) و ذخیره‌سازی پایدار روی سرور
- فهرست فایل‌ها با فیلتر و مرتب‌سازی سمت سرور، صفحه‌بندی و انتخاب گروهی
- ذخیره خودکار پیش‌نویس فرم و بازگردانی آن بعد از بسته شدن مرورگر
- مدیریت Leadها و وضعیت پیگیری، یادداشت و جستجوی سمت سرور
- مشاهده آمار بازدید روزانه و بازدید یکتا
- صفحات پربازدید و فایل‌های پربازدید
- منابع جذب، رویدادها و عملکرد Lead
- موسیقی و رسانه‌های سایت
- محافظت از ورود با محدودسازی تلاش ناموفق و بررسی مبدأ درخواست‌ها
- بررسی محتوای واقعی فایل‌های آپلودی بر اساس magic bytes پیش از ذخیره

## اسکریپت‌ها

| دستور | کار |
|-------|-----|
| `npm run dev` | سرور توسعه |
| `npm run build` | بیلد production |
| `npm run build:deploy` | بیلد production + حذف وابستگی‌های توسعه (فقط برای استقرار) |
| `npm run typecheck` | بررسی TypeScript |
| `npm run lint` | ESLint |
| `npm test` | اجرای تست‌ها |
| `npm run qa:admin` | پیمایش خودکار پنل مدیریت (همه بخش‌ها، دسکتاپ و موبایل) |
| `npm run qa:admin-a11y` | سنجش کنتراست، نام دسترس‌پذیر کنترل‌ها و همپوشانی چیدمان در پنل |

> `qa:admin-a11y` به‌صورت پیش‌فرض کل ماتریس را می‌پیماید: ۱۴ عرض از ۳۲۰ تا ۱۹۲۰
> پیکسل × ۹ بخش پنل، به‌علاوهٔ Drawer و تقویم شمسی در حالت باز (شامل بررسی بسته
> شدن با Escape). برای اجرای بخشی:
>
> ```bash
> QA_VIEWPORTS=360x800,1440x900 npm run qa:admin-a11y   # فقط این عرض‌ها
> QA_VIEWPORTS=none QA_ZOOM=125%,150% npm run qa:admin-a11y  # فقط زوم Chrome
> QA_VIEWS=list,form npm run qa:admin-a11y              # فقط این بخش‌ها
> QA_FULL=1 npm run qa:admin-a11y                       # گزارش کامل JSON
> ```
| `npm run format` | Prettier |

> دو دستور `qa:*` به `playwright` و `HIRMAND_ADMIN_KEY` نیاز دارند و باید روی سرور
> در حال اجرا (پورت `8080`) اجرا شوند.

> **نکته:** `npm run build` دیگر `node_modules` را دست‌کاری نمی‌کند، پس بعد از آن
> می‌توانید بی‌خطر `npm run dev`، `npm test` و `npm run lint` را اجرا کنید. فقط
> `npm run build:deploy` وابستگی‌های توسعه را حذف می‌کند (که برای استقرار لازم
> است)؛ اگر آن را محلی اجرا کردید، ابتدا دوباره `bun install` بزنید.

## ساختار پروژه (monorepo)

```text
src/
├── components/hirmand/   # برند و UI
├── lib/
│   ├── site.ts            # برند، تماس، محله‌ها، JSON-LD
│   ├── seo.ts             # meta/canonical/Open Graph/Structured Data
│   ├── properties.ts      # دیتای فایل‌های ملکی
│   └── analytics.ts       # رویدادهای آنالیتیکس
├── routes/                # مسیرهای TanStack
server/
├── routes/api/            # APIهای Lead، Analytics، Upload و Admin
└── routes/sitemap.xml.ts  # sitemap داینامیک
public/
├── images/                # تصاویر برند
├── manifest.webmanifest
├── robots.txt
└── og.jpg
migrations/                # migrationهای PostgreSQL
android/                   # پروژه مستقل Gradle (Phone Bridge)
├── app/                   # ماژول :app
├── .github/workflows/     # CI و Release اندروید (مستقل از CI سایت)
├── server/                # گیرنده آزمایشی Node برای تست LAN
├── build.gradle.kts
└── settings.gradle.kts
```

## Monorepo — اجزای پروژه

این مخزن یک monorepo است: سایت و اپلیکیشن Android در یک ریپو زندگی می‌کنند،
اما **هیچ‌کدام دیگری را نمی‌شکند**.

| بخش | مسیر | CI | استقرار |
|------|------|----|---------|
| **Website** | `src/routes/` | `ci.yml` | Liara |
| **Admin** | `src/routes/admin.tsx` + `src/components/hirmand/admin-*.tsx` | `ci.yml` | Liara |
| **Backend / API** | `server/routes/` | `ci.yml` | Liara |
| **Database** | `migrations/` (تا `0067`) | `ci.yml` | با `npm run db:migrate` |
| **Android** | `android/` | `.github/workflows/android-ci.yml` | GitHub Release |
| **Phone Bridge** | `android/app/` | همان CI اندروید | — |

### جداسازی سایت و اندروید

- `android/` در `tsconfig.json` (که فقط `src` و `server` را شامل می‌شود) نیست، پس typecheck سایت آن را نمی‌بیند.
- `android/**` در `ignores` اسکیمای ESLint هست، پس lint سایت روی سورس Kotlin/Gradle اجرا نمی‌شود.
- `android/` در `.liaraignore` هست، پس یک تغییر اندروید هرگز payload و build لیارا را تحت تأثیر قرار نمی‌دهد.
- workflow اندروید `paths: android/**` دارد، پس commitهای عادی سایت CI اندروید را اجرا نمی‌کنند.
- workflowهای اندروید در ریشهٔ `.github/workflows/` هستند، چون GitHub Actions فقط همین مسیر را اسکن می‌کند. خود پروژه در `android/` است و workflowها با `working-directory: android` اجرا می‌شوند.

### Android

پروژه Gradle مستقل است و از داخل پوشهٔ `android/` ساخته می‌شود
(`working-directory: android`). namespace و applicationId هر دو
`ir.hirmand.phonebridge` باقی مانده‌اند. جزئیات: [`android/README.md`](android/README.md)
و [`android/SETUP.md`](android/SETUP.md).

> این مخزن **Gradle wrapper ندارد** (`gradlew` وجود ندارد)، چون ریپوی مبدأ آن را
> commit نکرده بود. در حال حاضر CI از Gradle سیستمی (`gradle/actions/setup-gradle`)
> استفاده می‌کند. اگر `./gradlew` لازم شد، یک‌بار روی سیستمی که Gradle و Android SDK
> دارد اجرا کنید تا wrapper تولید و commit شود.

## Phone Bridge (اندروید ↔ بک‌اند)

سامانهٔ Phone Bridge یک پروژهٔ مستقل Gradle درون همین monorepo است، در `android/`،
که با API همین سایت (`/api/device-sync/v1`) حرف می‌زند.

```
Android app ──HTTPS + HMAC──▶ /api/device-sync/v1/*  ──▶ PostgreSQL
                                    ▲
                                    └── admin panel (policy, consent, audit, commands)
```

مسیرهای API:

| Method | Path | کار |
| --- | --- | --- |
| `POST` | `/api/device-sync/v1/register` | تبدیل کلید ثبت تک‌بارمصرف به توکن اختصاصی دستگاه |
| `GET` | `/api/device-sync/v1` | بررسی اتصال و ماژول‌های مجاز (بدون HMAC) |
| `POST` | `/api/device-sync/v1` | بستهٔ همگام‌سازی کامل |
| `POST` | `/api/device-sync/v1/heartbeat` | ضربان سبک + آمار سلامت دستگاه |
| `POST` | `/api/device-sync/v1/location` | ثبت نقطهٔ موقعیت (dedupe با `clientPointId`) |
| `POST` | `/api/device-sync/v1/files` | ارسال فایل انتخاب‌شده |
| `POST` | `/api/device-sync/v1/call-recordings` | ارسال ضبط تماس |
| `GET` | `/api/device-sync/v1/remote-control/command` | تحویل فرمان (با claim اتمیک) |
| `POST` | `/api/device-sync/v1/remote-control/result` | گزارش نتیجهٔ فرمان |
| `GET` | `/api/device-sync/v1/update` | بررسی نسخهٔ جدید (عمومی) |
| `POST` | `/api/admin-phone-bridge` | پنل مدیریت: دستگاه، سیاست، رضایت، فرمان، audit |

قاعدهٔ بنیادی — **دسترسی مؤثر**:

```
Effective Access = رضایت کاربر AND مجوز Android AND سیاست سرور AND دستگاه فعال
```

هیچ‌یک از این چهار لایه قابل دور زدن نیست. سمت سرور فقط می‌تواند سه لایه را
ببیند، پس **سیاست سرور هرگز جای رضایت کاربر را نمی‌گیرد**: `set_modules` در پنل
فقط «مجاز بودن» را باز می‌کند و تا وقتی رضایت ثبت نشده باشد ماژول مؤثر نمی‌شود.

### امضای درخواست

هر درخواست با HMAC-SHA256 امضا می‌شود:

```
signingInput = "v1." + deviceId + "." + timestamp + "." + nonce + "." + sha256hex(body)
signature    = HMAC-SHA256(secret = deviceToken, signingInput)
```

این رشته بخشی از قرارداد پروتکل است. `src/lib/phone-bridge-signature.test.ts`
هر دو طرف را مقابل هم قفل می‌کند، بنابراین تغییر در Kotlin یا TypeScript در CI
لو می‌رود.

### تست

```bash
npm test                                   # شامل تست‌های قرارداد و رگرسیون Phone Bridge
sh ./scripts/verify-phone-bridge.sh <url>  # بررسی قرارداد HTTP روی سرور در حال اجرا
```

> سرور توسعه عمداً `/api/*` را سرو نمی‌کند (به `vite.config.ts` نگاه کنید)،
> پس برای تست API باید خروجی build‌شده یا یک استقرار واقعی را هدف بگیرید.

## توسعه

قبل از push پیشنهاد می‌شود:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

برای اندروید (جدا از خط لولهٔ وب):

```bash
cd android
./gradlew check
./gradlew lintDebug
./gradlew assembleDebug
```

## لایسنس

MIT © گروه مشاورین املاک هیرمند

**دفتر:** اصفهان، سه راه سیمین، خیابان جانبازان، بلوار شهید بخشی  
**موبایل:** ۰۹۱۳ ۱۰۵ ۶۰۲۹ · **دفتر:** ۰۳۱ ۳۷۸۵ ۰۶۱۵


## باشگاه همکاران و کد رهگیری

سامانه `/tracking` اکنون یک پورتال واقعی برای دفاتر همکار دارد:
- حساب اختصاصی برای هر املاک با کد همکاری و PIN امن
- ثبت قرارداد و تولید کد رهگیری یکتا
- تأیید/رد قرارداد توسط مدیریت
- کارت دیجیتال ۱۲ مهر و محاسبه خودکار پاداش
- QR اختصاصی برای ورود سریع هر املاک
- چاپ کارت ۱۲ مهر از پنل مدیریت
- تاریخچه قراردادها، پاداش‌ها و لاگ عملیات مدیریتی
- قفل موقت حساب پس از چند ورود ناموفق

نکتهٔ سازگاری: دستگاه‌های ثبت‌شده‌ای که نسخهٔ قدیمی Hirmand Phone Bridge را اجرا می‌کنند، برای Sync/Heartbeat/Upload باید به نسخه‌ای که امضای درخواست را پشتیبانی می‌کند به‌روزرسانی شوند؛ ثبت اولیه همچنان با کلید ثبت دستگاه انجام می‌شود.

