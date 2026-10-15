export const SITE = {
  nameFa: "گروه مشاورین املاک هیرمند",
  shortName: "هیرمند",
  nameEn: "HIRMAND REAL ESTATE CONSULTANTS",
  title: "املاک هیرمند | خرید، فروش، رهن و اجاره ملک در اصفهان",
  url: (typeof import.meta !== "undefined" && import.meta.env?.VITE_SITE_URL) || "https://www.hirmandrealestate.ir",
  description:
    "گروه مشاورین املاک هیرمند در اصفهان؛ خرید، فروش، رهن و اجاره آپارتمان، ویلا، زمین، اداری و تجاری با مشاوره تخصصی و همراهی از انتخاب تا قرارداد.",
  sloganStrong: "خانه، فقط یک مکان نیست",
  sloganRest: "آغاز یک زندگی بهتر است",
  tagline: "همراه شما برای انتخاب خانه‌ای بهتر",
  kicker: "دفتر تخصصی املاک در اصفهان",
  managedBy: "با مدیریت آقای شیخ",
  hours: "پاسخگویی با هماهنگی قبلی",
  phone: {
    mobile: "09131056029",
    mobileDisplay: "0913 105 6029",
    office: "03137850615",
    officeDisplay: "031 3785 0615",
  },
  address: "اصفهان، سه‌راه سیمین",
  locality: "اصفهان",
  mapUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent("گروه مشاورین املاک هیرمند، اصفهان")}`,
  instagram: "https://www.instagram.com/hirmand.realestate/",
  instagramDm: "https://ig.me/m/hirmand.realestate",
  telegram: "https://t.me/Hirmand_realestate",
  eitaa: "https://eitaa.com/Hirmand_realestate",
  whatsapp: "https://chat.whatsapp.com/KpwHPsdYBwU7fBMsPQGUpK",
  whatsappDirect: "https://wa.me/989131056029",
} as const;

export type TeamId = "sheikh" | "moradi";

export const TEAM = [
  {
    id: "sheikh" as const,
    name: "آقای شیخ",
    role: "مدیر",
    icon: "briefcase" as const,
    phone: "09131056029",
    phoneDisplay: "0913 105 6029",
    wa: "https://wa.me/989131056029",
  },
  {
    id: "moradi" as const,
    name: "آقای مرادی",
    role: "مشاور ارشد",
    icon: "handshake" as const,
    phone: "09183576883",
    phoneDisplay: "0918 357 6883",
    wa: "https://wa.me/989183576883",
  },
] as const;

export type TeamMember = (typeof TEAM)[number];

export function intlPhone(phone: string) {
  return phone.replace(/^0/, "98");
}

export function personChat(person: TeamMember, extra = "") {
  const intl = intlPhone(person.phone);
  const text = encodeURIComponent(
    [`سلام ${person.name}، از وب‌سایت ${SITE.nameFa} پیام می‌دهم.`, extra].filter(Boolean).join("\n"),
  );
  return {
    tel: `tel:${person.phone}`,
    whatsapp: `https://wa.me/${intl}?text=${text}`,
    telegram: `tg://resolve?phone=${intl}`,
    telegramWeb: SITE.telegram,
    eitaa: SITE.eitaa,
    instagram: SITE.instagramDm,
  };
}

export type MapTarget = {
  label?: string;
  address?: string;
  searchQuery?: string;
  lat?: number;
  lng?: number;
};

export function mapLinks(target: MapTarget = { label: SITE.shortName, address: SITE.address }) {
  const query = (target.searchQuery || target.address || target.label || SITE.shortName).trim();
  const scopedQuery = query.includes("ایران") ? query : `${query}، اصفهان، ایران`;
  const q = encodeURIComponent(scopedQuery);
  const googleSearch = `https://www.google.com/maps/search/?api=1&query=${q}`;
  const googleDirections = `https://www.google.com/maps/dir/?api=1&destination=${q}`;
  const neshan = `https://neshan.org/maps/search/${q}`;
  const balad = `https://balad.ir/search?query=${q}`;
  const googleEmbed = target.lat != null && target.lng != null
    ? `https://maps.google.com/maps?q=${target.lat},${target.lng}&z=16&hl=fa&output=embed`
    : null;
  return {
    google: googleSearch,
    googlePlace: googleSearch,
    googleDirections,
    googleEmbed,
    balad,
    neshan,
    embed: googleEmbed,
    osm: null,
    search: googleSearch,
  };
}

export const OFFICE_MAP = mapLinks({
  label: "گروه مشاورین املاک هیرمند",
  address: SITE.address,
  searchQuery: "گروه مشاورین املاک هیرمند، اصفهان",
});

// Primary navigation stays focused while keeping the partner club directly
// accessible from both desktop and mobile navigation.
export const NAV = [
  { id: "listings", label: "فایل‌ها", to: "/properties", hash: "" },
  { id: "services", label: "خدمات", to: "/", hash: "services" },
  { id: "properties", label: "انواع ملک", to: "/", hash: "properties" },
  { id: "budget-match", label: "بودجه‌یاب", to: "/budget-match", hash: "" },
  { id: "areas", label: "محله‌ها", to: "/", hash: "areas" },
  { id: "consultants", label: "مشاورین", to: "/consultants", hash: "" },
  { id: "tools", label: "ابزار مالی", to: "/", hash: "tools" },
  { id: "contact", label: "تماس", to: "/", hash: "contact" },
  { id: "partners", label: "باشگاه همکاران", to: "/tracking", hash: "" },
] as const;

export const SERVICES = [
  {
    id: "buy",
    title: "خرید",
    text: "از بازدید تا سند کنار شما هستیم تا خانه‌ای متناسب با زندگی‌تان پیدا کنید.",
  },
  {
    id: "sell",
    title: "فروش",
    text: "قیمت‌گذاری واقع‌بینانه و معرفی درست ملک، برای فروشی آرام و مطمئن.",
  },
  {
    id: "mortgage",
    title: "رهن",
    text: "گزینه‌هایی متناسب با بودجه، با شفافیت کامل در شرایط و قرارداد.",
  },
  {
    id: "rent",
    title: "اجاره",
    text: "انتخاب ملک مناسب و پیگیری قرارداد، بدون پیچیدگی و اتلاف وقت.",
  },
] as const;

export const PRINCIPLES = [
  {
    id: "honesty",
    title: "صداقت",
    text: "هر ملک را همان‌طور که هست معرفی می‌کنیم؛ شفاف، دقیق و قابل اعتماد.",
  },
  {
    id: "experience",
    title: "تجربه",
    text: "آشنایی با بازار اصفهان و محله‌ها، برای تصمیم‌هایی با اطمینان بیشتر.",
  },
  {
    id: "advice",
    title: "مشاوره تخصصی",
    text: "قبل از هر معامله، شرایط، قیمت و مدارک را با هم بررسی می‌کنیم.",
  },
] as const;

export const PROPERTY_TYPES = [
  {
    id: "apartment",
    title: "آپارتمان",
    text: "واحدهای مسکونی در محله‌های مختلف اصفهان، متناسب با بودجه و سبک زندگی.",
    image: "/images/type-apartment.jpg",
  },
  {
    id: "villa",
    title: "ویلا و باغ",
    text: "فضای باز، آرامش و خانه‌هایی برای زندگی خارج از هیاهوی شهر.",
    image: "/images/type-villa.jpg",
  },
  {
    id: "office",
    title: "اداری و تجاری",
    text: "دفتر، مغازه و موقعیت‌های کاری با نگاه واقع‌بینانه به بازده و دسترسی.",
    image: "/images/type-office.jpg",
  },
  {
    id: "heritage",
    title: "خانه اصیل",
    text: "خانه‌های حیاط‌دار و بافت بااصالت اصفهان، برای زندگی یا سرمایه‌گذاری.",
    image: "/images/type-heritage.jpg",
  },
] as const;

export type Neighborhood = {
  name: string;
  address?: string;
  searchQuery?: string;
  lat?: number;
  lng?: number;
  label?: string;
};

export const NEIGHBORHOOD_GROUPS: { title: string; items: Neighborhood[] }[] = [
  {
    title: "مرکز و بافت تاریخی",
    items: [
      "آمادگاه","ابن‌سینا","احمدآباد","باغ‌کاران","بیدآباد","پشت‌بارو","پاچنار","جلفا","جوزدان","جویباره",
      "چرخاب","دردشت","درب‌کوش","دروازه دولت","سنبلستان","سی‌وسه‌پل","شهشهان","شهزاده ابراهیم",
      "صائب","عباس‌آباد","علی‌قلی‌آقا","قلعه تبرک","گلزار","مهرآباد","نقش جهان","هاتف","خواجو","حسن‌آباد",
      "چهارباغ بالا","چهارباغ پایین","چهارباغ عباسی","طوقچی","شمس‌آباد","سرچشمه","سرتاوه","امام‌زاده اسماعیل","ملک",
    ].map((name) => ({ name, address: `${name}، اصفهان`, searchQuery: `${name}، اصفهان` })),
  },
  {
    title: "جنوب اصفهان",
    items: [
      "آتشگاه","آبشار","استادان","باغ دریاچه","باغ زرشک","باغ غدیر","بهارستان","تخت فولاد","دنارت","ردان",
      "رزمندگان","سپاهان‌شهر","سیچان","صفه","فیض","کوی امام","کوی امام جعفر صادق","کوی سپاهان","گل‌نرگس",
      "مرداویج","ملاصدرا","مصلی","هزارجریب","همت‌آباد","شهید کشوری","باغ نگار / آینه‌خانه","سعادت‌آباد",
      "فیزادان","کوهسار","مارنان","حسین‌آباد","فرح‌آباد",
    ].map((name) => ({ name, address: `${name}، اصفهان`, searchQuery: `${name}، اصفهان` })),
  },
  {
    title: "شمال و شرق",
    items: [
      "آزادان","ارزنان","ارغوانیه","باقوشخانه","باغ فدک","بختیار دشت","برازنده","برج کاوه","پروین","پنج‌آذر",
      "پوزوه","پنارت","خانه اصفهان","خواجه عمید","دولت‌آباد","راران","رحیم‌آباد","زینبیه","جی","جی‌شیر",
      "شیخ اشراق","شیخ طوسی","شاهد","عسکریه","فروردین","قهجاورستان","کوی نرگس","ملک‌شهر","محمودآباد","مولوی",
      "ناصرخسرو","نگارستان","یونارت","خوراسگان","هفتون","سروستان","دشتستان","گاوارت","خاتون‌آباد","آندوان",
      "کلمان","کنگاز","ارداجی","کردآباد","شهرک زاینده‌رود","شهرک سلامت","اشکاوند",
    ].map((name) => ({ name, address: `${name}، اصفهان`, searchQuery: `${name}، اصفهان` })),
  },
  {
    title: "غرب و شهرک‌ها",
    items: [
      "اشرفی اصفهانی","اسلامی","بهار آزادی","بهارانچی","بزرگمهر","بابوکان","جروکان","جوان","جامی","زاجان",
      "زهران","سجاد","سیمین","سه‌راه سیمین","صمدیه لباف","کاردالان","گلخانه","گلستان","گورتان","خرم","درچه",
      "لادان","لیمجیر","مشاهده","ناژوان","نصرآباد","وحید","والدان","شهرک قدس","شهرک نگین","شهرک ولی‌عصر",
      "فردوان","کوهانستان",
    ].map((name) => ({ name, address: `${name}، اصفهان`, searchQuery: `${name}، اصفهان` })),
  },
];
export const NEIGHBORHOODS = NEIGHBORHOOD_GROUPS.flatMap((group) => group.items);
export const NEIGHBORHOOD_NAMES = NEIGHBORHOODS.map((item) => item.name);

export const STEPS = [
  {
    id: "talk",
    title: "گفت‌وگوی اولیه",
    text: "نیاز، بودجه و محله را با هم مشخص می‌کنیم تا مسیر روشن شود.",
  },
  {
    id: "match",
    title: "معرفی فایل",
    text: "گزینه‌هایی متناسب با شرایط شما معرفی می‌شود؛ بدون اغراق و با جزئیات واقعی.",
  },
  {
    id: "visit",
    title: "بازدید هماهنگ",
    text: "زمان بازدید را تنظیم می‌کنیم و در محل همراه شما هستیم.",
  },
  {
    id: "deal",
    title: "قرارداد و پیگیری",
    text: "از توافق تا مدارک و انتقال، مسیر را قدم‌به‌قدم جلو می‌بریم.",
  },
] as const;

export const FAQS = [
  {
    q: "برای شروع مشاوره چه کار کنم؟",
    a: "از فرم درخواست ملک استفاده کنید یا با آقای شیخ (۰۹۱۳۱۰۵۶۰۲۹) و آقای مرادی (۰۹۱۸۳۵۷۶۸۸۳) تماس بگیرید تا درباره نیازتان راهنمایی شوید.",
  },
  {
    q: "محدوده فعالیت هیرمند کجاست؟",
    a: "تمرکز ما روی اصفهان است؛ از جلفا، مرداویج و سپاهان‌شهر تا شهرک ولی‌عصر، سیمین، ناژوان، خوراسگان، ملک‌شهر و ده‌ها محله دیگر. هر محله روی نقشه گوگل، بلد و نشان قابل مشاهده است.",
  },
  {
    q: "آیا فایل‌ها روی سایت به‌روز می‌شوند؟",
    a: "فایل‌های مناسب پس از گفت‌وگو و شناخت نیاز شما معرفی می‌شوند تا گزینه‌ها دقیق و مرتبط باشند.",
  },
  {
    q: "بازدید ملک چطور هماهنگ می‌شود؟",
    a: "پس از بررسی درخواست، زمان بازدید را با شما هماهنگ می‌کنیم و در محل همراهتان خواهیم بود.",
  },
  {
    q: "شماره تماس را چطور سریع داشته باشم؟",
    a: "از دکمه تماس بالای صفحه، آقای شیخ یا آقای مرادی را انتخاب کنید. کنار هر شماره دکمه کپی هم هست و می‌توانید در واتساپ، تلگرام، ایتا یا اینستاگرام پیام بفرستید.",
  },
  {
    q: "کمیسیون چطور محاسبه می‌شود؟",
    a: "در خرید و فروش، ۰٫۵٪ از مبلغ معامله به‌علاوه ۹٪ مالیات محاسبه و بین دو طرف نصف می‌شود. در رهن و اجاره، ۲۵٪ از اجاره ماهانه معادل (با تبدیل هر ۱ میلیون رهن به ۳۰ هزار تومان اجاره) به‌علاوه ۹٪ مالیات است. مبلغ نهایی با هماهنگی دفتر مشخص می‌شود.",
  },
  {
    q: "تبدیل رهن به اجاره یعنی چه؟",
    a: "در بازار ایران معمولاً هر ۱ میلیون تومان رهن معادل حدود ۳۰ هزار تومان اجاره ماهانه است. با نوار لغزنده می‌توانید همین ارزش را بین رهن بیشتر یا اجاره بیشتر جابه‌جا کنید.",
  },
  {
    q: "ابزار سود سپرده و اقساط وام چیست؟",
    a: "در بخش ابزار مالی می‌توانید سود تقریبی سپرده بانکی و قسط وام را بر اساس نرخ رایج بانک‌ها ببینید. این اعداد راهنما هستند و نرخ قطعی هر بانک ممکن است متفاوت باشد.",
  },
  {
    q: "ثبت قرارداد و کد رهگیری چیست؟",
    a: "برای همکاری املاک، از بخش باشگاه همکاران وارد حساب شوید و قرارداد را ثبت کنید. پس از تأیید هیرمند، کد رهگیری صادر می‌شود و وضعیت قرارداد و مهرهای کارت همکاری از همان بخش قابل پیگیری است.",
  },
] as const;

export const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "RealEstateAgent",
      "@id": `${SITE.url}#organization`,
      name: SITE.nameFa,
      alternateName: "Hirmand Real Estate Consultants",
      url: SITE.url,
      founder: "آقای شیخ",
      telephone: ["+989131056029", "+989183576883", "+983137850615"],
      description: SITE.description,
      image: `${SITE.url}/images/hirmand-logo.png`,
      address: {
        "@type": "PostalAddress",
        addressLocality: SITE.locality,
        addressCountry: "IR",
        streetAddress: SITE.address,
      },
      hasMap: SITE.mapUrl,
      areaServed: {
        "@type": "City",
        name: "اصفهان",
      },
      contactPoint: {
        "@type": "ContactPoint",
        telephone: "+989131056029",
        contactType: "customer service",
        availableLanguage: ["fa"],
      },
      employee: TEAM.map((person) => ({
        "@type": "Person",
        name: person.name,
        jobTitle: person.role,
        telephone: `+98${person.phone.slice(1)}`,
      })),
      sameAs: [SITE.instagram, SITE.telegram, SITE.eitaa, SITE.whatsappDirect],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE.url}#website`,
      url: SITE.url,
      name: SITE.nameFa,
      inLanguage: "fa-IR",
      publisher: {
        "@id": `${SITE.url}#organization`,
      },
    },
  ],
};

export const FAQ_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.a,
    },
  })),
};
