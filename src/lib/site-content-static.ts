/**
 * Client-safe half of the site-content module.
 *
 * `site-content.ts` holds the admin CRUD server functions, so it imports
 * `@/lib/db` — which imports `node:fs` for the PGlite fallback. TanStack Start
 * can only split a server-function module away from the browser bundle when
 * *every* export is a server function, so a single plain helper living next to
 * them kept the whole module (and the database with it) in the client graph:
 * `mkdirSync` then threw on `/admin` and the panel rendered nothing but the
 * error boundary.
 *
 * Types, seed content and the JSON-LD builder are pure, so they live here and
 * the server module re-exports them for its own callers.
 */
import { FAQS } from "@/lib/site";

export type GuideContent = {
  id: string;
  category: string;
  title: string;
  summary: string;
  points: string[];
  sortOrder: number;
  active: boolean;
};

export type FaqContent = {
  id: string;
  question: string;
  answer: string;
  category: string;
  sortOrder: number;
  active: boolean;
};

export const DEFAULT_GUIDES: GuideContent[] = [
  {id:"before-buy",sortOrder:0,active:true,category:"خرید",title:"قبل از خرید ملک چه چیزهایی را بررسی کنیم؟",summary:"یک چک‌لیست عملی برای اینکه تصمیم خرید فقط بر اساس ظاهر و قیمت آگهی نباشد.",points:["نیاز خودتان را قبل از بازدید مشخص کنید: متراژ، تعداد خواب، پارکینگ، آسانسور و محدوده.","شرایط ملک را از نزدیک بررسی کنید؛ نور، صدا، دسترسی، کیفیت مشاعات و وضعیت نگهداری را جداگانه ببینید.","مدارک و وضعیت حقوقی ملک را قبل از هر تعهد مالی با دقت بررسی کنید و درباره موارد مبهم از متخصص مربوطه سؤال کنید.","قیمت را با چند فایل مشابه در همان محدوده مقایسه کنید، نه فقط یک آگهی."]},
  {id:"selling",sortOrder:10,active:true,category:"فروش",title:"برای فروش سریع‌تر، فایل ملک را چطور آماده کنیم؟",summary:"اقدام‌های ساده‌ای که کیفیت ارائه فایل را بهتر می‌کنند و تصمیم‌گیری خریدار را آسان‌تر می‌سازند.",points:["فضا را قبل از عکاسی مرتب و روشن کنید و از چند زاویه مهم عکس بگیرید.","متراژ، تعداد خواب، پارکینگ، انباری، آسانسور و وضعیت بازسازی را شفاف و یکدست ثبت کنید.","قیمت را با فایل‌های نزدیک همان محله و ویژگی‌ها مقایسه کنید.","زمان‌های مناسب برای بازدید و شرایط مذاکره را از ابتدا مشخص کنید تا رفت‌وبرگشت کمتر شود."]},
  {id:"rent",sortOrder:20,active:true,category:"رهن و اجاره",title:"در رهن و اجاره چه نکاتی را کنار هم بسنجیم؟",summary:"فقط مبلغ رهن یا اجاره را نبینید؛ ترکیب مالی و شرایط واقعی ملک را با هم مقایسه کنید.",points:["چند ترکیب رهن و اجاره را با یک نرخ تبدیل ثابت با هم مقایسه کنید.","هزینه‌های جانبی، شارژ و شرایط پرداخت را در کنار مبلغ اصلی بررسی کنید.","وضعیت پارکینگ، انباری، آسانسور و زمان تحویل را حتماً در مقایسه نگه دارید.","اگر فایل قابل تبدیل است، سناریوهای مختلف را قبل از تصمیم نهایی کنار هم ببینید."]},
  {id:"compare",sortOrder:30,active:true,category:"تصمیم‌گیری",title:"چطور دو فایل ملکی را منصفانه مقایسه کنیم؟",summary:"برای مقایسه واقعی، شاخص‌ها را یکسان کنید و تفاوت‌های مهم را کنار هم ببینید.",points:["قیمت کل به‌تنهایی کافی نیست؛ قیمت هر متر را هم بررسی کنید.","متراژ، تعداد خواب، طبقه، جهت، پارکینگ، آسانسور و انباری را در یک جدول کنار هم قرار دهید.","موقعیت محله و کیفیت دسترسی را جدا از مشخصات داخل ساختمان ارزیابی کنید.","اگر دو فایل از نظر قیمت نزدیک‌اند، شرایط معامله و وضعیت سند می‌تواند تفاوت اصلی را ایجاد کند."]},
  {id:"visit",sortOrder:40,active:true,category:"بازدید",title:"در بازدید ملک چه چیزهایی یادداشت کنیم؟",summary:"یک قالب ساده برای اینکه بعد از چند بازدید، جزئیات فایل‌ها با هم قاطی نشوند.",points:["نورگیری، صدا، بوی نامطبوع، کیفیت نما و مشاعات را همان‌جا یادداشت کنید.","ابعاد اتاق‌ها و فضای پارک خودرو را با نیاز واقعی خودتان تطبیق دهید.","سؤال‌های مهم درباره زمان تخلیه، شرایط پرداخت، هزینه‌های ساختمان و وضعیت تعمیرات را ثبت کنید.","در پایان بازدید سه نکته مثبت، سه نکته منفی و یک سؤال باز باقی‌مانده را بنویسید."]},
  {id:"neighborhood",sortOrder:50,active:true,category:"محله",title:"برای انتخاب محله چه معیارهایی مهم است؟",summary:"انتخاب محله فقط به قیمت هر متر محدود نمی‌شود و باید با سبک زندگی شما جور باشد.",points:["فاصله تا محل کار، مدرسه، مراکز خرید و مسیرهای اصلی را با زمان واقعی رفت‌وبرگشت بسنجید.","در ساعات مختلف روز، سطح شلوغی، صدای محیط و جای پارک را بررسی کنید.","به امکانات اطراف و کیفیت دسترسی پیاده و خودرو توجه کنید.","برای سرمایه‌گذاری و سکونت، اولویت معیارها ممکن است متفاوت باشد؛ هدف خودتان را از ابتدا مشخص کنید."]}
];

export const DEFAULT_FAQS: FaqContent[] = FAQS.map((item, index) => ({
  id: `faq-${index + 1}`,
  question: item.q,
  answer: item.a,
  category: "عمومی",
  sortOrder: index * 10,
  active: true,
}));

export function buildFaqJsonLd(faqs: FaqContent[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}
