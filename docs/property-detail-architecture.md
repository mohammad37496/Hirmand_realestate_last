# معماری صفحه جزئیات فایل (Property Detail) — مرجع بازطراحی

> سند توصیفی. هیچ فایلی از لایه‌های موجود را تغییر نمی‌دهد و تم سایت را دست نمی‌زند.
> هدف: نقشه‌ی دقیق مسیر داده تا رندر، لایه‌های CSS و نقاط حساس، پیش از هر بازطراحی.

---

## ۱. خلاصه‌ی یک‌خطی

`PropertyCard` → `/properties/$slug` → loader (`getPublishedProperty` + `listRelatedProperties`)
→ `PropertyDetailView` (یک فایل ۱۵۲۶ خطی، شامل Gallery / Lightbox / Video / ConsultantCard به‌صورت توابع داخلی)
→ رندر با `SiteChrome` + استایل از **آخرین لایه‌ی CSS**: `src/property-detail-light-theme.css`.

---

## ۲. فایل‌های درگیر

### ۲.۱ مسیر (Routes)

| فایل | نقش |
|---|---|
| `src/routes/properties.$slug.tsx` | مسیر اصلی جزئیات. loader + canonical-redirect + `pendingComponent` اسکلتی |
| `src/routes/file.$id.tsx` | لینک قدیمی نسل اول → redirect به slug کانونیکال، `noindex` |
| `src/routes/v.$slug.$id.tsx` | لینک قدیمی نسل دوم → اول با slug و سپس با id، redirect |
| `src/routes/areas.$slug.tsx` | مقصد لینک محله در breadcrumb |
| `src/routes/consultants.$id.tsx` | مقصد «مشاهده پروفایل مشاور» |
| `src/routeTree.gen.ts` | تولیدی؛ ثبت `'/properties/$slug'`, `'/file/$id'`, `'/v/$slug/$id'` |
| `src/router.tsx` | `getRouter()` با `AppErrorComponent` |

### ۲.۲ کامپوننت‌ها

| فایل | نقش در صفحه جزئیات |
|---|---|
| `src/components/hirmand/property-detail-view.tsx` | **هسته‌ی صفحه.** `PropertyDetailView`, `Gallery`, `ResilientImage`, `VideoPlayer`, `ConsultantCard` و توابع کمکی (`priceRows`, `money`, `unitPrice`, `fileCode`, `mapsLink`, `osmEmbedUrl`, `whatsappLink`, `normalizePhoneDigits`, `propertyAmenityIcon`, `propertyAmenityLabel`) همگی در همین فایل |
| `src/components/hirmand/property-actions.tsx` | نوار ابزار فایل: ذخیره / اشتراک / چاپ / مقایسه (localStorage) |
| `src/components/hirmand/property-showcase.tsx` | `PropertyCard` — کارت فایل‌های مشابه (`<Link to="/properties/$slug">`) |
| `src/components/hirmand/property-convert-slider.tsx` | `PropertyConvertSlider` — تبدیل رهن ↔ اجاره (فقط وقتی `convertible` و نوع رهن/اجاره باشد) |
| `src/components/hirmand/site-chrome.tsx` | `SiteChrome`: skip-link، Header، VisitorTracker، Footer، `.quick-actions`، `CallMenu`، Toaster |
| `src/components/hirmand/call-menu.tsx` | `CallMenu` (منوی تماس شناور) و `MapMenu` |
| `src/components/hirmand/social-icons.tsx` | `WhatsAppIcon` |
| `src/components/hirmand/music-player.tsx` | نوار موسیقی fixed (سراسر سایت، نه مختص این صفحه) |
| `src/components/hirmand/footer.tsx`, `header.tsx`, `site-utilities.tsx`, `visitor-tracker.tsx` | پوسته‌ی صفحه |

### ۲.۳ لایه‌ی داده

| فایل | نقش |
|---|---|
| `src/lib/properties.ts` | مدل `Property` + همه‌ی server-fn ها. `getPublishedProperty` (خط ۶۶۴)، `getPublishedPropertyById` (۶۲۰)، `listRelatedProperties` (۷۶۳)، `isFeaturedActive` (۳۲۲)، `mapProperty`، ستون‌های `LIST_COLUMNS` / `CARD_COLUMNS` / `DETAIL_COLUMNS` |
| `src/lib/property-slug.ts` | `decodeSlugCandidates`، `legacyIdFragments`، `isCanonicalSlug` |
| `src/lib/property-path.ts` | `propertyPath()` — ساخت `/properties/<encodeURIComponent(slug)>` با fallback به `/file/<id>` |
| `src/lib/seo.ts` | `propertyHead`، `propertyPageTitle/Description`، `propertySocialImage`، `socialMeta`، `propertyJsonLd`، `breadcrumbJsonLd`، `TX_LABEL`، `TYPE_LABEL` |
| `src/lib/media.ts` | `isVideoUrl`، `mediaSourceCandidates` (پراکسی دیوار به `/api/media-proxy`)، `MAX_PROPERTY_MEDIA = 20` |
| `src/lib/property-fallback-images.ts` | `PROPERTY_FALLBACK_IMAGES` (۶ نوع × N عکس jpg)، نسخه‌ی legacy svg، `stableIndex`، `isPropertyFallbackImage` |
| `src/lib/money.ts` | `parseAmount`، `formatToman` (اعداد فارسی)، `tomanToWords` |
| `src/lib/areas.ts` | `areaSlug`، `allAreas`، `areaHead`، `areaJsonLd` |
| `src/lib/property-options.ts` | گزینه‌های کابینت/کف/سرمایش/گرمایش/کمد + `labelForOption` |
| `src/lib/site.ts` | `SITE`، `TEAM` (۲ مشاور: `sheikh`, `moradi`) |
| `src/lib/analytics.ts` | `trackAnalyticsEvent` → `POST /api/analytics/track` با `keepalive` |
| `src/lib/property-read-cache.server.ts` | کش ۶۰ ثانیه‌ای خواندن فایل |
| `src/lib/neighborhoods.ts` | فهرست محله‌های اصفهان |

### ۲.۴ APIهای سمت سرور

`server/routes/api/media/` (`/api/media/:id`)، `media-proxy.get.ts` (`/api/media-proxy?url=`)،
`analytics/` (`/api/analytics/track`)، `admin/`, `upload.post.ts`, `music.get.ts`, و `server/routes/sitemap.xml.ts`.

---

## ۳. زنجیره‌ی روتینگ (کامل)

```text
PropertyCard (property-showcase.tsx)
  └─ <Link to="/properties/$slug" params={{ slug: slug || id }} data-property-link="true">
       ↓
/properties/$slug  →  createServerFn getPublishedProperty({ slug })
       ├─ decodeSlugCandidates(slug)        // raw → decode → decode (حداکثر ۲ پاس)
       ├─ SQL 1: slug = any(candidates)     // ایندکس یکتا
       ├─ SQL 2: id::text = any(candidates) // لینک قدیمی «عنوان + uuid»
       └─ SQL 3: fragment ۸ هگزی ابتدا/انتهای id (فقط لینک‌های legacy)
       ↓
اگر !isCanonicalSlug(params.slug, property.slug)
       └─ redirect(replace) → /properties/<property.slug>      // ضد تکرار URL
       ↓
listRelatedProperties({ slug, neighborhood, propertyType, limit: 6 })
       └─ خطای این query صفحه را نمی‌شکند (try/catch + console.error)
       ↓
head: propertyHead(property, slug)
       ↓
<PropertyDetailView property={...} related={...} />
```

مسیرهای قدیمی: `/file/$id` و `/v/$slug/$id` هر دو با `redirect(replace)` به slug کانونیکال می‌روند و
head آن‌ها `robots: noindex, follow` است.

**نکته‌ی داده:** `mapProperty(row)` برای کاربر عمومی `address` را **همیشه `null`** می‌کند و مختصات را
به ۳ رقم اعشار گرد می‌کند. بنابراین خط «محله · آدرس» در صفحه‌ی عمومی عملاً فقط محله را نشان می‌دهد،
و دقت نقشه ≈ ۱۱۱ متر است.

---

## ۴. آناتومی `PropertyDetailView`

```
<SiteChrome>                                  ← skip-link, header, footer, quick-actions, CallMenu, Toaster
 ├─ <script ld+json> propertyJsonLd
 ├─ <script ld+json> breadcrumbJsonLd
 └─ <main class="property-detail-page">
     ├─ nav.property-breadcrumb                 خانه › محله › عنوان
     ├─ section.property-detail-top
     │   ├─ .property-detail-top-gallery  → <Gallery/>
     │   └─ .property-detail-summary
     │        ├─ .property-status-group     نوع معامله · نوع ملک · «فایل ویژه»
     │        ├─ .property-file-code        کد فایل (۶ کاراکتر انتهای id، <bdi dir=ltr>)
     │        ├─ h1.property-detail-title-block
     │        ├─ .property-price-block      priceRows() → ردیف‌های قیمت کل / رهن / اجاره + قیمت هر متر
     │        ├─ .property-primary-contact  تماس سریع + واتساپ
     │        ├─ .property-tools-heading + <PropertyActions/>
     │        └─ .property-summary-facts     متراژ · خواب · سال ساخت · پارکینگ
     ├─ section.property-detail-content
     │   ├─ article.property-detail-main
     │   │   ├─ section.property-divar-specs
     │   │   │   └─ details.property-specs-accordion[open]      ← «مشخصات ملک»
     │   │   │       └─ .property-spec-grid  + details.property-spec-amenities  ← «امکانات دیگر»
     │   │   ├─ section.property-detail-body   توضیحات + متادیتای تاریخ + ویژگی‌ها
     │   │   ├─ section.property-location-section  iframe OSM یا fallback محله
     │   │   ├─ section.property-final-cta      تماس تلفنی + واتساپ
     │   │   ├─ <PropertyConvertSlider/>       (در صورت convertible)
     │   │   └─ Link «بازگشت به فهرست فایل‌ها»
     │   └─ aside.property-detail-aside
     │        ├─ <ConsultantCard/>            ← کارت مشاور
     │        └─ section.property-quick-overview
     ├─ .property-mobile-actions               نوار fixed موبایل: تماس · واتساپ · اشتراک
     └─ section.property-related              PropertyCard × related
```

### ۴.۱ قیمت

`priceRows(property)` بر اساس `transactionType`:

| نوع معامله | ردیف‌ها |
|---|---|
| `rent` | رهن (اگر باشد) + اجاره (اگر باشد)، در غیر این‌صورت «قیمت: تماس بگیرید» |
| `mortgage` | رهن، یا «تماس بگیرید» |
| `buy` / `sell` | قیمت کل، یا «تماس بگیرید» |

`perMeterLabel` فقط برای `buy`/`sell` و وقتی `price > 0` و `areaM2 > 0` قیمت هر متر را نشان می‌دهد.
`money()` رشته‌های `"null"` / `"undefined"` را پاک می‌کند و `NaN` را نمی‌پذیرد.

### ۴.۲ داده‌ی nullable در UI

- فیلدهای عددی با `!= null` رندر می‌شوند (متراژ، خواب، سرویس، طبقه، تعداد طبقات، سال ساخت، جهت).
- `floorLabel === "suite"` اولویت دارد و «سوئیت» می‌شود، وگرنه `floor`.
- boolean ها (`parking`, `elevator`, `storage`, `painted`, `wallpaper`) همیشه «دارد/ندارد» می‌دهند —
  این رفتار **عمدی و تعریف‌شده‌ی پروژه** است، نه حدس.
- امکانات: `property.otherAmenities` + `coolingSystem` + `heatingSystem`؛ اگر هر سه خالی باشند
  accordion داخلی اصلاً رندر نمی‌شود.

### ۴.۳ اعداد فارسی

`toLocaleString("fa-IR")` برای متراژ/خواب/طبقه/سال؛ سال ساخت با `{ useGrouping: false }`
(یعنی `۱۴۰۰` نه `۱٬۴۰۰`). قیمت‌ها با `formatToman` از `money.ts`.

---

## ۵. پیاده‌سازی قابلیت‌ها

### ۵.۱ Gallery

- لیست تصاویر در `useMemo`: trim → حذف تکراری → حذف fallbackهای داخلی (`isPropertyFallbackImage`) →
  اگر خالی شد، `getPropertyFallbackImages(propertyType)`.
- `ResilientImage`: `<picture>` با AVIF/WebP برای fallback محلی، `mediaSourceCandidates` (پراکسی دیوار)،
  `onError` زنجیره‌ای (legacy svg → candidate بعدی → `span.property-image-fallback`).
- تصویر hero: `loading="eager"`, `fetchPriority="high"`, `itemProp="image"`، `decoding="async"`,
  `referrerPolicy="no-referrer"`؛ بقیه lazy.
- پیش‌بارگذاری تصویر بعدی/قبلی با `new Image()` در `useEffect`.
- ریل عمودی thumb + شمارنده `تصویر X از Y` + badge ویژه + دکمه تمام‌صفحه.
- **touch**: swipe افقی با آستانه ۵۵px، pinch-zoom تا ۳×.
- **دیوار/ویدیو**: `isVideoUrl` → `VideoPlayer` با کنترل‌های اختصاصی (پخش، ±۱۰ ثانیه، seek، mute).

### ۵.۲ Lightbox

- با `createPortal(…, document.body)` و فقط وقتی باز است رندر می‌شود (lazy).
- `role="dialog"`, `aria-modal="true"`, قفل اسکرول body، focus-trap با Tab/Shift+Tab،
  Escape، ArrowLeft/Right، کلید `0` برای reset زوم، برگرداندن focus به مورد قبلی.
- تنها سطح تیره‌ی عمدی صفحه (تم کاغذی استثناست — قاعده‌ی خود فایل CSS).

### ۵.۳ نقشه

- اگر `latitude != null && longitude != null` → `<iframe>` از OSM (`osmEmbedUrl`، bbox ±0.012°)
  با `loading="lazy"` و `referrerPolicy="no-referrer-when-downgrade"`، به‌علاوه دکمه «باز کردن در نقشه».
- در غیر این‌صورت → `.property-location-fallback` با نام محله و جستجوی متنی در Google Maps.
- CTA نقشه هیچ‌گاه روی نقشه قرار نمی‌گیرد: در `.property-map-actions` زیر iframe است.

### ۵.۴ مشاور

`ConsultantCard` مشاور را با `TEAM.find(phone یا name)` تطبیق می‌دهد؛ اگر پیدا نشد، نقش «مشاور املاک»
و نام از خود فایل. واتساپ داخل این کارت **حذف شده** (تکراری بود) — واتساپ در دو جای دیگر صفحه
(`.property-primary-contact-whatsapp` و `.property-final-cta`) باقی است.

### ۵.۵ ابزارهای فایل (`property-actions.tsx`)

| ابزار | مکان ذخیره‌سازی | رفتار |
|---|---|---|
| ذخیره | `localStorage["hirmand-favorite-properties"]` (تا ۱۰۰) | `aria-pressed` + toast |
| اشتراک | — | `navigator.share` → fallback `clipboard` → fallback `toast.info(url)` |
| چاپ | — | `window.print()` با تأخیر ۵۰ms |
| مقایسه | `localStorage["hirmand-compare-properties"]` (حداکثر ۳) | سقف ۳ فایل، پیام فارسی |

همه با `event.preventDefault/stopPropagation` تا کلیک روی کارت لینک را فعال نکند.

### ۵.۶ ابزارهای جانبی صفحه

- **تبدیل رهن/اجاره**: `PropertyConvertSlider` فقط اگر `convertible === true` و نوع `rent|mortgage`
  و حداقل یکی از مبلغ‌ها > 0 باشد؛ در غیر این‌صورت `null`.
- **فایل‌های مشابه**: `listRelatedProperties` با اولویت «هم‌محله، بعد هم‌نوع»؛ خطای query صفحه را نمی‌شکند.
- **بازدید/تاریخچه**: `localStorage["hirmand-recent-properties"]` (۸ مورد) + یک‌بار در هر سشن
  `trackAnalyticsEvent("property_view")` با کلید `hirmand-viewed:<slug>`.

---

## ۶. سیستم تم (Single Source of Truth)

### ۶.۱ توکن‌ها — `src/theme-pro.css` (بلوک `:root` تنها منبع)

```text
navy:   950 #081320 · 900 #0b1a2b · 800 #12293f · 700 #1a3a55 · 600 #26506f · 200 #c6d5e2 · 100 #e2eaf2
brass:  800 #6f4a0f · 700 #8a5e14 · 600 #a8761f · 500 #c08a2a · 300 #e2c48c · 100 #f7edda
neutral:paper #f7f4ee · paper-2 #f1eae0 · card #fff · card-2 #fbf8f2
text:   fg #152430 · muted #57646e · subtle #64707b · faint #8a939c
line:   #e4dccc · line-2 #d3c8b4
semantic: ok/warn/danger/info + -bg
radius: --r-xs 8 · sm 12 · md 16 · lg 20 · xl 24 · 2xl 30 · pill 999
type:   --fs-2xs..--fs-2xl (۹ پله) + --fs-h1/h2/h3 (clamp)
space:  --sp-1 4px … --sp-18 72px (پایه ۴px)
shadow: --el-1 / --el-2 / --el-3 / --el-brass  (همه navy-tinted)
motion: --ease · --fast 140 · --med 240 · --slow 420
layout: --wrap 1200px · --band clamp(64px,7vw,104px)
font:   "Vazirmatn", Tahoma, Arial
```

نام‌های legacy (`--bg`, `--surface`, `--gold`, `--ink`, `--shadow`, …) در همان فایل به توکن‌های بالا
نگاشت شده‌اند؛ بازتم‌کردن کل سایت با تغییر همین یک بلوک انجام می‌شود.

### ۶.۲ ترتیب لود CSS — `src/routes/__root.tsx`

```text
1  styles.css                      9487 خط · 500 !important  ← reset + کامپوننت‌های قدیمی
2  properties-pro.css              2128 · 108
3  theme-pro.css                   5093 ·  15   ← تعریف توکن‌ها و پایه
4  theme-pro-pages.css             2113 ·   6
5  mobile.css                       851 · 106
6  refinements.css                 1259 ·   0
7  ui-clarity.css                  4221 · 2355
8  property-detail-pro.css         4821 · 1386
9  mobile-device-fixes.css          396 ·  98
10 theme-harmony.css               2639 · 1218
11 property-card.css                645 ·   2
12 home-property-layout.css         367 ·   0
13 property-detail-redesign.css    3874 · 1743
14 budget-matcher-redesign.css      706 · 311
15 property-detail-light-theme.css 2379 · 1219  ← لایه‌ی نهایی صفحه‌ی جزئیات
```

**قانون:** تساوی specificity با ترتیب منبع برنده است. هرچه شماره بزرگ‌تر، هرچه دیرتر و غالب‌تر.

### ۶.۳ لایه‌ی نهایی — `property-detail-light-theme.css`

بلوک `:root` این فایل فقط **آلیاس** می‌سازد (`--hr-*` → توکن‌های `theme-pro`) و یک متغیر اختصاصی اضافه می‌کند:

```css
--hr-mobile-bar: 78px;   /* ارتفاع نوار fixed موبایل؛ padding-bottom صفحه باید از آن بزرگ‌تر باشد */
```

ساختار لایه (به ترتیب فایل):

| خط | بخش |
|---|---|
| ۴۵ | Route canvas (`body:has(.property-detail-page)`) |
| ۷۷ | Breadcrumb |
| ۱۲۲ | HERO: gallery + summary — `grid-template-columns: minmax(0,1.34fr) minmax(390px,.66fr)` |
| ۳۳۹ | Summary card |
| ۷۴۷ | CONTENT + SIDEBAR |
| ۷۷۷ | Section heading |
| ۸۳۴ | Specifications — accordion در موبایل، grid باز در دسکتاپ |
| ۱۰۳۸ | Description / features |
| ۱۱۷۲ | Location |
| ۱۲۵۴ | Sidebar — `position: sticky; top: 94px` |
| ۱۵۰۷ | Final CTA |
| ۱۵۸۵ | Conversion tool |
| ۱۶۶۳ | Related listings |
| ۱۷۲۴ | Mobile fixed actions — تنها نوار fixed این مسیر |
| ۱۷۳۹ | Lightbox (تنها سطح تیره‌ی عمدی) |
| ۱۸۲۴ | Footer روی این مسیر |
| ۱۸۴۳ | Tablet ≤1180 |
| ۱۸۸۵ | Stacked ≤900 (sidebar وارد جریان محتوا) |
| ۱۹۱۹ | Phone ≤720 (accordion، ریل افقی، نوار تماس fixed) |
| ۲۲۷۸ | Small phones ≤390 |
| ۲۳۲۷ | Reduced motion / print |

### ۶.۴ z-index — معماری فعلی

| مقدار | مالک |
|---|---|
| 9999 / 10001 / 10002 | لایه‌های قدیمی detail (`property-detail-pro.css`, `property-detail-redesign.css`, `property-detail-light-theme.css`) |
| 1000 / 1001 / 1190 / 1200–1202 | `mobile.css` (منوهای موبایل) |
| 110 / 120 | `properties-pro.css` |
| 90 / 80 / 70 / 60 / 55 / 46 / 45 / 44 | `theme-pro.css`: skip-link / music-player / scroll-progress / site-nav / action-menu / back-to-top / quick-actions / floating-call |
| 3 / 2 / 1 / 0 | لایه‌های داخلی و stacking context های محلی |

نکته: `.property-detail-page { isolation: isolate }` یک stacking context محلی می‌سازد تا z-index های
داخلی صفحه با chrome سراسری قاطی نشوند.

---

## ۷. نقاط حساس برای بازطراحی (چیزهایی که نباید بشکنند)

1. **تم:** فقط از توکن‌های `theme-pro.css` استفاده کنید؛ رنگ، شعاع، سایه یا فونت جدید نسازید.
2. **یک نوار fixed:** `body:has(.property-detail-page) .quick-actions` و `.floating-call-menu` در لایه‌ی نهایی
   `display:none` شده‌اند تا فقط `.property-mobile-actions` باقی بماند. حذف این قاعده سه نوار پایین صفحه
   برمی‌گرداند.
3. **فضای محتوا:** `padding-bottom` صفحه همیشه از `--hr-mobile-bar` بزرگ‌تر است و نباید کم شود:
   دسکتاپ `92px` · موبایل ≤720px `calc(var(--hr-mobile-bar) + 54px)` = ۱۳۲px · ≤390px
   `calc(var(--hr-mobile-bar) + 40px)` = ۱۱۸px. اگر ارتفاع نوار fixed تغییر کرد، این‌ها هم باید به‌روز شوند.
4. **تقارن cascade:** اگر لایه‌ای قبلی (`!important` دارد) تعارض ایجاد کرد، در **همان لایه‌ی نهایی**
   اصلاح کنید، نه با اضافه‌کردن یک فایل شانزدهم.
5. **breakpoint ها متناقض‌اند:** لایه‌های قدیمی از `1080 / 1024 / 900 / 760 / 720 / 420 / 390` استفاده
   می‌کنند و لایه‌ی نهایی `1180 / 900 / 720 / 390 / 340`. هر media query جدید باید با لایه‌ی نهایی هم‌راستا باشد.
6. **semantics:** یک `h1`، سلسله‌مراتب `h2` در بخش‌ها، `<details>/<summary>` بومی برای accordion
   (بدون state موازی)، `aria-hidden` روی آیکن‌های تزئینی، `bdi dir="ltr"` برای کد فایل و شماره تماس.
7. **داده:** هیچ مقدار nullable را حدس نزنید؛ `mapProperty` برای عمومی `address` را null می‌کند.

---

## ۸. ابزار QA موجود (در ریپو)

| اسکریپت | کار |
|---|---|
| `scripts/qa-property-detail.mjs` | تست تعاملی صفحه جزئیات (accordion، گالری، CTAها) |
| `scripts/qa-geometry-audit.mjs` | ممیزی هندسی در ۸ viewport (۳۲۰→۱۹۲۰): overflow، overlap، کنتراست، tap target |
| `scripts/qa-seed-amenities.mjs` | دیتای نمونه با PGlite برای تست صفحه جزئیات (`--restore` برای برگرداندن) |
| `scripts/browser-smoke.mjs` | smoke دسکتاپ + موبایل با خروجی در `screenshots/` |

بعد از هر تغییر در صفحه جزئیات، این سه اسکریپت QA را اجرا کنید.
