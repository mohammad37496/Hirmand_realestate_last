import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, FilePlus2, Film, Home, ImagePlus, Loader2, MapPin, Phone, Send, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { PROPERTY_TYPES, SERVICES, NEIGHBORHOODS, SITE } from "@/lib/site";
import {
  PROPERTY_CABINET_OPTIONS,
  PROPERTY_COOLING_OPTIONS,
  PROPERTY_FLOORING_OPTIONS,
  PROPERTY_HEATING_OPTIONS,
  PROPERTY_OTHER_AMENITY_OPTIONS,
  PROPERTY_WALL_CLOSET_OPTIONS,
} from "@/lib/property-options";
import { normalizeMoneyText } from "@/lib/property-input-normalization";
import { rememberCustomerTrackingCode } from "@/lib/customer-tracking";
import { isVideoUrl } from "@/lib/media";
import { uploadErrorMessage, uploadInChunks } from "@/lib/media-upload-client";
import "@/owner-property.css";

function digits(value: string) {
  return value
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

function normalizePhone(value: string) {
  return digits(value).replace(/\D/g, "").replace(/^(\+98|0098|98)/, "0");
}

function numberValue(value: string) {
  const raw = digits(value).replace(/[٬،,\s]/g, "");
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function moneyValue(value: string) {
  const normalized = normalizeMoneyText(value);
  return normalized ? normalized : null;
}

const CUSTOMER_PROPERTY_TYPES = [
  ...PROPERTY_TYPES,
  { id: "land", title: "زمین", text: "" },
  { id: "commercial", title: "تجاری", text: "" },
] as const;

const MAX_MEDIA = 12;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/gif", "image/avif",
  "video/mp4", "video/webm", "video/quicktime",
]);

export const Route = createFileRoute("/submit-property")({
  head: () => ({
    meta: [
      { title: "ثبت کامل ملک توسط مالک | " + SITE.nameFa },
      { name: "description", content: "ثبت کامل مشخصات ملک، عکس و ویدئو برای بررسی و انتشار در سامانه هیرمند." },
    ],
  }),
  component: SubmitPropertyPage,
});

function SubmitPropertyPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [ownerName, setOwnerName] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [title, setTitle] = useState("");
  const [transactionType, setTransactionType] = useState<"buy"|"sell"|"rent"|"mortgage">("sell");
  const [propertyType, setPropertyType] = useState<"apartment"|"villa"|"office"|"heritage"|"land"|"commercial">("apartment");
  const [neighborhood, setNeighborhood] = useState("");
  const [address, setAddress] = useState("");
  const [area, setArea] = useState("");
  const [bedrooms, setBedrooms] = useState("");
  const [bathrooms, setBathrooms] = useState("");
  const [floor, setFloor] = useState("");
  const [totalFloors, setTotalFloors] = useState("");
  const [builtYear, setBuiltYear] = useState("");
  const [orientation, setOrientation] = useState("");
  const [cabinetType, setCabinetType] = useState("");
  const [flooringType, setFlooringType] = useState("");
  const [coolingSystem, setCoolingSystem] = useState("");
  const [heatingSystem, setHeatingSystem] = useState("");
  const [wallClosetType, setWallClosetType] = useState("");
  const [parking, setParking] = useState(false);
  const [elevator, setElevator] = useState(false);
  const [storage, setStorage] = useState(false);
  const [painted, setPainted] = useState(false);
  const [wallpaper, setWallpaper] = useState(false);
  const [convertible, setConvertible] = useState(false);
  const [otherAmenities, setOtherAmenities] = useState<string[]>([]);
  const [features, setFeatures] = useState<string[]>([]);
  const [price, setPrice] = useState("");
  const [deposit, setDeposit] = useState("");
  const [rent, setRent] = useState("");
  const [description, setDescription] = useState("");
  const [media, setMedia] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadLabel, setUploadLabel] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [editToken, setEditToken] = useState("");
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [locationStatus, setLocationStatus] = useState<"idle"|"loading"|"done"|"error">("idle");
  const [draftReady, setDraftReady] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState("");
  const CUSTOMER_DRAFT_KEY = "hirmand:customer-property-draft:v1";

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("code")?.trim().toUpperCase().replace(/\s+/g, "") || "";
    if (!/^HIR-[A-Z0-9]{2}-[A-F0-9]{12}$/.test(token)) {
      try {
        const raw = window.localStorage.getItem(CUSTOMER_DRAFT_KEY);
        const parsed = raw ? JSON.parse(raw) as { savedAt?: number; data?: Record<string, unknown> } : null;
        const data = parsed?.data;
        if (data && typeof data === "object") {
          const text = (key: string) => String(data[key] ?? "");
          const num = (key: string) => data[key] == null ? "" : String(data[key]);
          const bool = (key: string) => Boolean(data[key]);
          setOwnerName(text("ownerName")); setOwnerPhone(text("ownerPhone")); setTitle(text("title"));
          if (["buy","sell","rent","mortgage"].includes(String(data.transactionType))) setTransactionType(String(data.transactionType) as typeof transactionType);
          if (["apartment","villa","office","heritage","land","commercial"].includes(String(data.propertyType))) setPropertyType(String(data.propertyType) as typeof propertyType);
          setNeighborhood(text("neighborhood")); setAddress(text("address")); setArea(text("area")); setBedrooms(num("bedrooms")); setBathrooms(num("bathrooms")); setFloor(num("floor")); setTotalFloors(num("totalFloors")); setBuiltYear(num("builtYear")); setOrientation(text("orientation"));
          setCabinetType(text("cabinetType")); setFlooringType(text("flooringType")); setCoolingSystem(text("coolingSystem")); setHeatingSystem(text("heatingSystem")); setWallClosetType(text("wallClosetType"));
          setParking(bool("parking")); setElevator(bool("elevator")); setStorage(bool("storage")); setPainted(bool("painted")); setWallpaper(bool("wallpaper")); setConvertible(bool("convertible"));
          setOtherAmenities(Array.isArray(data.otherAmenities) ? data.otherAmenities.filter((v): v is string => typeof v === "string") : []);
          setFeatures(Array.isArray(data.features) ? data.features.filter((v): v is string => typeof v === "string") : []);
          setPrice(text("price")); setDeposit(text("deposit")); setRent(text("rent")); setDescription(text("description"));
          setMedia(Array.isArray(data.media) ? data.media.filter((v): v is string => typeof v === "string") : []);
          setLatitude(data.latitude == null ? null : Number(data.latitude));
          setLongitude(data.longitude == null ? null : Number(data.longitude));
          if (data.latitude != null && data.longitude != null) setLocationStatus("done");
          if (parsed?.savedAt) setDraftSavedAt(new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit" }).format(new Date(parsed.savedAt)));
          toast.info("پیش‌نویس قبلی فرم ثبت ملک بازیابی شد.");
        }
      } catch {
        // Ignore an invalid local draft.
      }
      setDraftReady(true);
      return;
    }
    setEditToken(token);
    setLoadingExisting(true);
    void fetch("/api/customer-property-submissions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ action: "load", trackingToken: token }),
    }).then(async (response) => {
      const payload = await response.json().catch(() => null) as { success?: boolean; propertyData?: Record<string, unknown>; reviewNote?: string; statusMessage?: string } | null;
      if (!response.ok || !payload?.success || !payload.propertyData) throw new Error(payload?.statusMessage || "اطلاعات درخواست برای ویرایش قابل دریافت نیست.");
      const data = payload.propertyData;
      const text = (key: string) => String(data[key] ?? "");
      const num = (key: string) => data[key] == null ? "" : String(data[key]);
      const bool = (key: string) => Boolean(data[key]);
      setOwnerName(text("ownerName")); setOwnerPhone(text("ownerPhone")); setTitle(text("title"));
      if (["buy","sell","rent","mortgage"].includes(String(data.transactionType))) setTransactionType(String(data.transactionType) as typeof transactionType);
      if (["apartment","villa","office","heritage","land","commercial"].includes(String(data.propertyType))) setPropertyType(String(data.propertyType) as typeof propertyType);
      setNeighborhood(text("neighborhood")); setAddress(text("address")); setArea(num("areaM2")); setBedrooms(num("bedrooms")); setBathrooms(num("bathrooms")); setFloor(num("floor")); setTotalFloors(num("totalFloors")); setBuiltYear(num("builtYear")); setOrientation(text("orientation"));
      setCabinetType(text("cabinetType")); setFlooringType(text("flooringType")); setCoolingSystem(text("coolingSystem")); setHeatingSystem(text("heatingSystem")); setWallClosetType(text("wallClosetType"));
      setParking(bool("parking")); setElevator(bool("elevator")); setStorage(bool("storage")); setPainted(bool("painted")); setWallpaper(bool("wallpaper")); setConvertible(bool("convertible"));
      setOtherAmenities(Array.isArray(data.otherAmenities) ? data.otherAmenities.filter((v): v is string => typeof v === "string") : []);
      setFeatures(Array.isArray(data.features) ? data.features.filter((v): v is string => typeof v === "string") : []);
      setPrice(text("price")); setDeposit(text("deposit")); setRent(text("rent")); setDescription(text("description"));
      setMedia(Array.isArray(data.images) ? data.images.filter((v): v is string => typeof v === "string") : []);
      setLatitude(data.latitude == null ? null : Number(data.latitude));
      setLongitude(data.longitude == null ? null : Number(data.longitude));
      if (data.latitude != null && data.longitude != null) setLocationStatus("done");
      if (payload.reviewNote) toast.info("علت نیاز به اصلاح: " + payload.reviewNote);
    }).catch((error) => {
      setError(error instanceof Error ? error.message : "اطلاعات درخواست قابل دریافت نیست.");
    }).finally(() => {
      setLoadingExisting(false);
      setDraftReady(true);
    });
  }, []);

  useEffect(() => {
    if (!draftReady || editToken || done) return;
    const draft = {
      ownerName, ownerPhone, title, transactionType, propertyType, neighborhood, address, area,
      bedrooms, bathrooms, floor, totalFloors, builtYear, orientation, cabinetType, flooringType,
      coolingSystem, heatingSystem, wallClosetType, parking, elevator, storage, painted, wallpaper,
      convertible, otherAmenities, features, price, deposit, rent, description, media, latitude, longitude,
    };
    try {
      window.localStorage.setItem(CUSTOMER_DRAFT_KEY, JSON.stringify({ savedAt: Date.now(), data: draft }));
      setDraftSavedAt(new Intl.DateTimeFormat("fa-IR", { hour: "2-digit", minute: "2-digit" }).format(new Date()));
    } catch {
      // Best-effort only; form submission must keep working.
    }
  }, [
    draftReady, editToken, done, ownerName, ownerPhone, title, transactionType, propertyType,
    neighborhood, address, area, bedrooms, bathrooms, floor, totalFloors, builtYear, orientation,
    cabinetType, flooringType, coolingSystem, heatingSystem, wallClosetType, parking, elevator,
    storage, painted, wallpaper, convertible, otherAmenities, features, price, deposit, rent, description, media,
  ]);

  const imageCount = useMemo(() => media.filter((src) => !isVideoUrl(src)).length, [media]);

  function toggleAmenity(value: string) {
    setOtherAmenities((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  }

  function captureLocation() {
    if (!navigator.geolocation) {
      setLocationStatus("error");
      toast.error("مرورگر شما موقعیت مکانی را پشتیبانی نمی‌کند.");
      return;
    }
    setLocationStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(Number(position.coords.latitude.toFixed(6)));
        setLongitude(Number(position.coords.longitude.toFixed(6)));
        setLocationStatus("done");
        toast.success("موقعیت ملک ثبت شد.");
      },
      () => {
        setLocationStatus("error");
        toast.error("دسترسی به موقعیت مکانی انجام نشد؛ بدون موقعیت هم می‌توانید ادامه دهید.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  async function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;
    if (media.length + list.length > MAX_MEDIA) {
      toast.error("حداکثر ۱۲ رسانه برای هر درخواست مجاز است.");
      return;
    }
    if (list.some((file) => !ALLOWED_TYPES.has(file.type))) {
      toast.error("فقط JPG، PNG، WebP، GIF، AVIF، MP4، WebM و MOV مجاز است.");
      return;
    }
    if (list.some((file) => file.size > MAX_FILE_BYTES)) {
      toast.error("حجم هر فایل حداکثر ۲۵ مگابایت است.");
      return;
    }
    if (
      (media.some((src) => isVideoUrl(src)) || list.some((file) => file.type.startsWith("video/"))) &&
      (media.filter((src) => isVideoUrl(src)).length + list.filter((file) => file.type.startsWith("video/")).length > 1)
    ) {
      toast.error("برای هر ملک حداکثر یک ویدئو مجاز است.");
      return;
    }

    setUploading(true);
    setProgress(0);
    const uploaded: string[] = [];
    try {
      for (let index = 0; index < list.length; index += 1) {
        const file = list[index]!;
        setUploadLabel("فایل " + (index + 1).toLocaleString("fa-IR") + " از " + list.length.toLocaleString("fa-IR") + ": " + file.name);
        const result = await uploadInChunks({
          endpoint: "/api/customer-property-upload",
          file,
          contentType: file.type,
          rejectedMessage: "آپلود فایل پذیرفته نشد.",
          onProgress: setProgress,
        });
        const url = typeof result.response.url === "string" ? result.response.url : "";
        if (!url) throw new Error("نشانی فایل آپلودشده دریافت نشد.");
        uploaded.push(url);
      }
      setMedia((current) => Array.from(new Set([...current, ...uploaded])).slice(0, MAX_MEDIA));
      toast.success(uploaded.length === 1 ? "رسانه با موفقیت آپلود شد." : uploaded.length.toLocaleString("fa-IR") + " رسانه آپلود شد.");
    } catch (cause) {
      toast.error(uploadErrorMessage(cause, "آپلود رسانه انجام نشد."));
    } finally {
      setUploading(false);
      setProgress(0);
      setUploadLabel("");
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const normalizedPhone = normalizePhone(ownerPhone);
    if (ownerName.trim().length < 2) return setError("نام مالک را وارد کنید.");
    if (!/^09\d{9}$/.test(normalizedPhone)) return setError("شماره موبایل معتبر وارد کنید.");
    if (title.trim().length < 8) return setError("عنوان ملک را کامل‌تر بنویسید.");
    if (!neighborhood) return setError("محله را انتخاب کنید.");
    const areaNumber = numberValue(area);
    if (!areaNumber || areaNumber <= 0) return setError("متراژ معتبر وارد کنید.");
    if (description.trim().length < 80) return setError("توضیحات ملک حداقل ۸۰ کاراکتر باشد.");
    if (imageCount < 1) return setError("حداقل یک تصویر از ملک آپلود کنید.");
    if (transactionType === "sell" && !moneyValue(price)) return setError("برای فروش، قیمت کل را وارد کنید.");
    if (transactionType === "rent" && !moneyValue(deposit) && !moneyValue(rent)) return setError("برای اجاره، حداقل رهن یا اجاره را وارد کنید.");
    if (transactionType === "mortgage" && !moneyValue(deposit)) return setError("برای رهن، مبلغ رهن را وارد کنید.");

    setUploading(true);
    try {
      const response = await fetch("/api/customer-property-submissions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          action: editToken ? "resubmit" : undefined,
          trackingToken: editToken || undefined,
          ownerName: ownerName.trim(),
          ownerPhone: normalizedPhone,
          title: title.trim(),
          transactionType,
          propertyType,
          neighborhood,
          address: address.trim(),
          areaM2: areaNumber,
          bedrooms: numberValue(bedrooms),
          bathrooms: numberValue(bathrooms),
          floor: numberValue(floor),
          totalFloors: numberValue(totalFloors),
          builtYear: numberValue(builtYear),
          orientation: orientation || null,
          parking, elevator, storage, painted, wallpaper, convertible,
          cabinetType, flooringType, coolingSystem, heatingSystem, wallClosetType,
          otherAmenities, features,
          price: moneyValue(price),
          deposit: moneyValue(deposit),
          rent: moneyValue(rent),
          description: description.trim(),
          images: media,
          latitude,
          longitude,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.statusMessage || payload?.message || "ثبت ملک انجام نشد.");
      }
      setDone(String(payload.trackingToken || ""));
      try { window.localStorage.removeItem(CUSTOMER_DRAFT_KEY); } catch {
        // Ignore storage failures; the submission already succeeded.
      }
      setDraftSavedAt("");
      if (payload.trackingToken) rememberCustomerTrackingCode(String(payload.trackingToken));
      toast.success(editToken ? "اصلاحات با موفقیت ارسال و دوباره وارد صف بررسی شد." : "ملک برای بررسی کارشناسان هیرمند ارسال شد.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ثبت ملک انجام نشد.");
    } finally {
      setUploading(false);
    }
  }

  if (done) {
    return (
      <main className="owner-submit-page customer-property-submit-page">
        <section className="owner-success customer-submission-success">
          <div className="owner-success-icon"><CheckCircle2 size={30} /></div>
          <span className="kicker">ارسال موفق</span>
          <h1>{editToken ? "اصلاحات ملک شما دریافت شد." : "اطلاعات ملک شما دریافت شد."}</h1>
          <p>{editToken ? "نسخه اصلاح‌شده دوباره در صف بررسی قرار گرفت و تا تأیید کارشناسان در بخش فایل‌های عمومی نمایش داده نمی‌شود." : "فایل ابتدا در صف بررسی هیرمند قرار می‌گیرد و تا تأیید کارشناسان در بخش فایل‌های عمومی نمایش داده نمی‌شود."}</p>
          <div className="owner-tracking">
            <small>کد رهگیری</small>
            <strong dir="ltr">{done || "—"}</strong>
            {done ? <a className="btn-gold" href={"/request-tracking?code=" + encodeURIComponent(done)}><Send size={16}/> پیگیری درخواست</a> : null}
          </div>
          <Link className="btn-ghost" to="/properties">مشاهده فایل‌های منتشرشده</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="owner-submit-page customer-property-submit-page">
      <header className="owner-submit-header">
        <Link to="/" className="owner-back">بازگشت به هیرمند</Link>
        <div className="owner-brand"><span className="owner-icon"><Home size={22}/></span><span><small>HIRMAND REAL ESTATE</small><strong>{editToken ? "اصلاح و ارسال مجدد ملک" : "ثبت کامل ملک توسط مالک"}</strong></span></div>
      </header>

      <section className="customer-property-intro">
        <span className="kicker">ثبت فایل توسط مشتری</span>
        <h1>{editToken ? "اصلاحات درخواستتان را انجام دهید." : "ملکتان را کامل برای ما ارسال کنید."}</h1>
        <p>{editToken ? "اطلاعات قبلی شما بارگذاری شده است. موارد موردنظر را اصلاح کنید و دوباره برای بررسی هیرمند بفرستید." : "مشخصات کامل ملک، امکانات، عکس و یک ویدئو را ارسال کنید. پس از بررسی و تأیید کارشناس، فایل با مشاور هیرمند منتشر می‌شود."}</p>
        <div className="customer-property-intro-points">
          <span><CheckCircle2 size={15}/> صف بررسی و تأیید</span>
          <span><CheckCircle2 size={15}/> آپلود مرحله‌ای رسانه</span>
          <span><CheckCircle2 size={15}/> انتشار فقط بعد از تأیید</span>
        </div>
      </section>

      <form className="customer-property-form" onSubmit={submit}>
        <section className="customer-property-section">
          <div className="customer-property-section-head"><span>۱</span><div><h2>اطلاعات مالک</h2><p>نام و شماره فقط برای هماهنگی داخلی استفاده می‌شود.</p></div></div>
          <div className="customer-property-grid">
            <label className="field"><span>نام و نام خانوادگی مالک</span><input value={ownerName} onChange={(e)=>setOwnerName(e.target.value)} autoComplete="name"/></label>
            <label className="field"><span>شماره موبایل مالک</span><input value={ownerPhone} onChange={(e)=>setOwnerPhone(e.target.value)} inputMode="tel" dir="ltr" placeholder="0912..." autoComplete="tel"/></label>
          </div>
        </section>

        <section className="customer-property-section">
          <div className="customer-property-section-head"><span>۲</span><div><h2>مشخصات اصلی ملک</h2><p>اطلاعات دقیق باعث می‌شود فایل سریع‌تر برای انتشار آماده شود.</p></div></div>
          <div className="customer-property-grid">
            <label className="field customer-property-wide"><span>عنوان ملک</span><input value={title} onChange={(e)=>setTitle(e.target.value)} placeholder="مثلاً آپارتمان نوساز دوخوابه در سپاهان‌شهر"/></label>
            <label className="field"><span>نوع معامله</span><select value={transactionType} onChange={(e)=>setTransactionType(e.target.value as typeof transactionType)}>{SERVICES.map((item)=><option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
            <label className="field"><span>نوع ملک</span><select value={propertyType} onChange={(e)=>setPropertyType(e.target.value as typeof propertyType)}>{CUSTOMER_PROPERTY_TYPES.map((item)=><option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
            <label className="field"><span>محله</span><select value={neighborhood} onChange={(e)=>setNeighborhood(e.target.value)}><option value="">انتخاب محله</option>{NEIGHBORHOODS.map((item)=><option key={item.name}>{item.name}</option>)}</select></label>
            <label className="field customer-property-location-field"><span>آدرس / توضیح موقعیت</span><input value={address} onChange={(e)=>setAddress(e.target.value)} placeholder="اختیاری؛ شماره واحد حساس ننویسید"/>
              <div className="customer-property-location-row"><button type="button" className="btn-ghost" onClick={captureLocation} disabled={locationStatus==="loading"}><MapPin size={15}/>{locationStatus==="loading"?"در حال دریافت موقعیت…":locationStatus==="done"?"موقعیت ثبت شد":"ثبت موقعیت روی نقشه"}</button>{latitude!=null&&longitude!=null?<small dir="ltr">{latitude.toFixed(6)}, {longitude.toFixed(6)}</small>:<small>اختیاری؛ با اجازه مرورگر ثبت می‌شود.</small>}</div>
            </label>
            <label className="field"><span>متراژ</span><input value={area} onChange={(e)=>setArea(e.target.value)} inputMode="decimal" dir="ltr" placeholder="120"/></label>
            <label className="field"><span>خواب</span><select value={bedrooms} onChange={(e)=>setBedrooms(e.target.value)}><option value="">ثبت نشده</option>{[0,1,2,3,4,5,6].map((n)=><option key={n} value={String(n)}>{n===0?"بدون خواب":n===6?"۶ خواب و بیشتر":n.toLocaleString("fa-IR")+" خواب"}</option>)}</select></label>
            <label className="field"><span>حمام</span><input value={bathrooms} onChange={(e)=>setBathrooms(e.target.value)} inputMode="numeric" dir="ltr"/></label>
            <label className="field"><span>طبقه</span><input value={floor} onChange={(e)=>setFloor(e.target.value)} inputMode="numeric" dir="ltr"/></label>
            <label className="field"><span>تعداد طبقات</span><input value={totalFloors} onChange={(e)=>setTotalFloors(e.target.value)} inputMode="numeric" dir="ltr"/></label>
            <label className="field"><span>سال ساخت</span><input value={builtYear} onChange={(e)=>setBuiltYear(e.target.value)} inputMode="numeric" dir="ltr" placeholder="1402"/></label>
            <label className="field"><span>جهت</span><select value={orientation} onChange={(e)=>setOrientation(e.target.value)}><option value="">ثبت نشده</option>{[["north","شمالی"],["south","جنوبی"],["east","شرقی"],["west","غربی"],["northeast","شمال‌شرقی"],["northwest","شمال‌غربی"],["southeast","جنوب‌شرقی"],["southwest","جنوب‌غربی"],["two_fronts","دوبر"],["three_fronts","سه‌بر"],["four_fronts","چهاربر"],["other","سایر"]].map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
          </div>
        </section>

        <section className="customer-property-section">
          <div className="customer-property-section-head"><span>۳</span><div><h2>قیمت و شرایط مالی</h2><p>مبالغ را فقط به عدد وارد کنید.</p></div></div>
          <div className="customer-property-grid">
            {(transactionType==="sell" || transactionType==="buy") ? <label className="field"><span>قیمت کل</span><input value={price} onChange={(e)=>setPrice(e.target.value)} inputMode="numeric" dir="ltr"/></label> : null}
            {(transactionType==="rent" || transactionType==="mortgage") ? <label className="field"><span>رهن</span><input value={deposit} onChange={(e)=>setDeposit(e.target.value)} inputMode="numeric" dir="ltr"/></label> : null}
            {transactionType==="rent" ? <label className="field"><span>اجاره ماهانه</span><input value={rent} onChange={(e)=>setRent(e.target.value)} inputMode="numeric" dir="ltr"/></label> : null}
          </div>
        </section>

        <section className="customer-property-section">
          <div className="customer-property-section-head"><span>۴</span><div><h2>امکانات ملک</h2><p>فقط امکانات واقعی را انتخاب کنید.</p></div></div>
          <div className="customer-property-checks">
            {([
              ["پارکینگ",parking,setParking],["آسانسور",elevator,setElevator],["انباری",storage,setStorage],
              ["رنگ‌شده",painted,setPainted],["کاغذدیواری",wallpaper,setWallpaper],["قابل تبدیل",convertible,setConvertible],
            ] as Array<[string, boolean, (value: boolean) => void]>).map(([label,checked,setter])=><label key={label} className="customer-property-check"><input type="checkbox" checked={checked} onChange={(e)=>setter(e.target.checked)}/><span>{label}</span></label>)}
          </div>
          <div className="customer-property-grid">
            <label className="field"><span>کابینت</span><select value={cabinetType} onChange={(e)=>setCabinetType(e.target.value)}><option value="">ثبت نشده</option>{PROPERTY_CABINET_OPTIONS.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select></label>
            <label className="field"><span>کف‌پوش</span><select value={flooringType} onChange={(e)=>setFlooringType(e.target.value)}><option value="">ثبت نشده</option>{PROPERTY_FLOORING_OPTIONS.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select></label>
            <label className="field"><span>سرمایش</span><select value={coolingSystem} onChange={(e)=>setCoolingSystem(e.target.value)}><option value="">ثبت نشده</option>{PROPERTY_COOLING_OPTIONS.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select></label>
            <label className="field"><span>گرمایش</span><select value={heatingSystem} onChange={(e)=>setHeatingSystem(e.target.value)}><option value="">ثبت نشده</option>{PROPERTY_HEATING_OPTIONS.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select></label>
            <label className="field"><span>کمد دیواری</span><select value={wallClosetType} onChange={(e)=>setWallClosetType(e.target.value)}><option value="">ثبت نشده</option>{PROPERTY_WALL_CLOSET_OPTIONS.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select></label>
          </div>
          <div className="customer-property-chip-list">
            {PROPERTY_OTHER_AMENITY_OPTIONS.map((item)=><button type="button" key={item.value} className={"customer-property-chip"+(otherAmenities.includes(item.value)?" is-active":"")} onClick={()=>toggleAmenity(item.value)}>{item.label}</button>)}
          </div>
        </section>

        <section className="customer-property-section">
          <div className="customer-property-section-head"><span>۵</span><div><h2>توضیحات فایل</h2><p>مزایا، دسترسی، شرایط سند و هر نکته مهم را بنویسید.</p></div></div>
          <label className="field"><span>توضیحات کامل</span><textarea rows={8} value={description} onChange={(e)=>setDescription(e.target.value)} placeholder="مثلاً نورگیری، تعداد واحد، وضعیت سند، پارکینگ، انباری، دسترسی‌ها، وضعیت تخلیه و…"/></label>
          <label className="field"><span>ویژگی‌های مهم، با «،» جدا کنید</span><input value={features.join("، ")} onChange={(e)=>setFeatures(e.target.value.split("،").map((x)=>x.trim()).filter(Boolean).slice(0,20))} placeholder="نوساز، خوش‌نقشه، نورگیر، تخلیه فوری"/></label>
        </section>

        <section className="customer-property-section">
          <div className="customer-property-section-head"><span>۶</span><div><h2>عکس و فیلم</h2><p>حداقل یک عکس لازم است؛ یک ویدئوی کوتاه هم می‌توانید اضافه کنید.</p></div></div>
          <div className={"customer-property-upload-zone"+(uploading?" is-busy":"")} onClick={()=>!uploading&&inputRef.current?.click()} role="button" tabIndex={0}>
            <input ref={inputRef} type="file" hidden multiple accept="image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/webm,video/quicktime" onChange={(e)=>e.target.files&&void uploadFiles(e.target.files)}/>
            {uploading ? <><Loader2 size={26} className="customer-property-spin"/><strong>در حال آپلود… {progress.toLocaleString("fa-IR")}٪</strong><small dir="ltr">{uploadLabel}</small><div className="customer-property-progress"><span style={{width:Math.min(100,Math.max(0,progress))+"%"}}/></div></> : <><Upload size={28}/><strong>افزودن عکس و ویدئو</strong><small>حداکثر ۱۲ رسانه · هر فایل حداکثر ۲۵ مگابایت</small></>}
          </div>
          {media.length ? <div className="customer-property-media-grid">{media.map((src,index)=><div className="customer-property-media" key={src}><button type="button" onClick={(e)=>{e.stopPropagation();setMedia((current)=>current.filter((item)=>item!==src));}} aria-label="حذف رسانه"><X size={15}/></button>{isVideoUrl(src)?<><video src={src} controls muted preload="metadata"/><span><Film size={13}/> ویدئو</span></>:<><img src={src} alt={"تصویر ملک "+(index+1)}/><span><ImagePlus size={13}/> {index===0?"کاور":"تصویر "+(index+1).toLocaleString("fa-IR")}</span></>}</div>)}</div> : null}
        </section>

        {error ? <p className="customer-property-error" role="alert">{error}</p> : null}
        <div className="customer-property-submit-actions">
          <Link to="/" className="btn-ghost">انصراف</Link>
          <button type="submit" className="btn-gold" disabled={uploading || loadingExisting}>{loadingExisting ? <Loader2 size={18} className="owner-spin"/> : <FilePlus2 size={18}/>} {loadingExisting ? "در حال بارگذاری درخواست…" : uploading ? "در حال ارسال…" : editToken ? "اصلاح و ارسال مجدد" : "ارسال ملک برای بررسی"}</button>
        </div>
        {draftReady && !done ? <div className="customer-property-draft-status"><span>{draftSavedAt ? "پیش‌نویس خودکار ذخیره شد • " + draftSavedAt : "ذخیره خودکار پیش‌نویس فعال است"}</span><button type="button" onClick={()=>{try{window.localStorage.removeItem(CUSTOMER_DRAFT_KEY);}catch{ /* storage may be blocked */ }setDraftSavedAt("");toast.success("پیش‌نویس پاک شد.");}}>پاک کردن پیش‌نویس</button></div> : null}
        <p className="customer-property-privacy"><Phone size={14}/> اطلاعات مالک و رسانه‌ها فقط برای بررسی و تکمیل فایل استفاده می‌شوند و انتشار عمومی منوط به تأیید است.</p>
      </form>
    </main>
  );
}
