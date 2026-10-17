import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, ImagePlus, MapPinned, Search, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getAdminAreaContents, saveAdminAreaContent, type AreaContent, type AreaContentDraft } from "@/lib/area-content";
import { uploadErrorMessage, uploadInChunks } from "@/lib/media-upload-client";

const EMPTY_DRAFT: AreaContentDraft = {
  slug: "", intro: "", about: "", highlights: "", amenities: "",
  transportation: "", marketNote: "", heroImage: "", gallery: [],
  seoTitle: "", seoDescription: "", isPublished: false,
};

function toDraft(item: AreaContent): AreaContentDraft {
  return {
    slug: item.slug, intro: item.intro, about: item.about,
    highlights: item.highlights, amenities: item.amenities,
    transportation: item.transportation, marketNote: item.marketNote,
    heroImage: item.heroImage, gallery: [...item.gallery],
    seoTitle: item.seoTitle, seoDescription: item.seoDescription,
    isPublished: item.isPublished,
  };
}

function normalizeSearch(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("fa")
    .replace(/[يى]/g, "ی").replace(/ك/g, "ک")
    .replace(/[\u200c\u200f\u202a-\u202e]/g, " ")
    .replace(/\s+/g, " ").trim();
}

function lines(value: string) {
  return value.split(/\r?\n/).map((line) => line.replace(/^[\s•\-–—]+/, "").trim()).filter(Boolean);
}

function Field(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  rows?: number;
  hint?: string;
  dir?: "rtl" | "ltr";
}) {
  return (
    <label className="admin-area-field">
      <span>{props.label}</span>
      {props.multiline ? (
        <textarea rows={props.rows ?? 4} dir={props.dir ?? "rtl"} value={props.value} onChange={(event) => props.onChange(event.target.value)} />
      ) : (
        <input dir={props.dir ?? "rtl"} value={props.value} onChange={(event) => props.onChange(event.target.value)} />
      )}
      {props.hint ? <small>{props.hint}</small> : null}
    </label>
  );
}

export function AdminAreaContentManager() {
  const [areas, setAreas] = useState<AreaContent[]>([]);
  const [selectedSlug, setSelectedSlug] = useState("");
  const [draft, setDraft] = useState<AreaContentDraft>(EMPTY_DRAFT);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [databaseConfigured, setDatabaseConfigured] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    void getAdminAreaContents({ data: {} }).then((result) => {
      if (!active) return;
      setAreas(result.areas);
      setDatabaseConfigured(result.databaseConfigured);
      const first = result.areas[0];
      if (first) {
        setSelectedSlug(first.slug);
        setDraft(toDraft(first));
      }
    }).catch((error) => {
      if (active) toast.error(error instanceof Error ? error.message : "فهرست محله‌ها بارگذاری نشد.");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, []);

  const selectedArea = areas.find((area) => area.slug === selectedSlug) ?? null;
  const filteredAreas = useMemo(() => {
    const normalized = normalizeSearch(query);
    return areas.filter((area) => !normalized || normalizeSearch(area.name + " " + area.groupTitle).includes(normalized));
  }, [areas, query]);

  const publishedCount = areas.filter((area) => area.isPublished).length;
  const withContentCount = areas.filter((area) => Boolean(area.intro || area.about || area.heroImage || area.gallery.length || area.highlights || area.amenities)).length;

  function update<K extends keyof AreaContentDraft>(key: K, value: AreaContentDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function selectArea(area: AreaContent) {
    setSelectedSlug(area.slug);
    setDraft(toDraft(area));
  }

  async function uploadImages(fileList: FileList | null) {
    const files = fileList ? Array.from(fileList) : [];
    if (!files.length) return;
    const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);
    if (files.some((file) => !allowed.has(file.type))) {
      toast.error("فرمت مجاز تصویر: JPG، PNG، WebP، GIF یا AVIF.");
      if (fileInput.current) fileInput.current.value = "";
      return;
    }
    if (files.some((file) => file.size > 25 * 1024 * 1024)) {
      toast.error("حجم هر تصویر باید حداکثر ۲۵ مگابایت باشد.");
      if (fileInput.current) fileInput.current.value = "";
      return;
    }
    if (draft.gallery.length + files.length > 24) {
      toast.error("برای هر محله حداکثر ۲۴ تصویر گالری مجاز است.");
      if (fileInput.current) fileInput.current.value = "";
      return;
    }

    setUploading(true);
    const uploaded: string[] = [];
    let failed = 0;
    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index]!;
        try {
          const result = await uploadInChunks({
            endpoint: "/api/area-upload",
            file,
            contentType: file.type,
            rejectedMessage: "نوع یا حجم تصویر پذیرفته نشد.",
            onProgress: (percentage) => setUploadProgress(Math.round(((index + percentage / 100) / files.length) * 100)),
          });
          const url = typeof result.response.url === "string" ? result.response.url : "";
          if (!url) throw new Error("نشانی تصویر ذخیره‌شده دریافت نشد.");
          uploaded.push(url);
        } catch (error) {
          failed += 1;
          toast.error(uploadErrorMessage(error, "آپلود یک تصویر انجام نشد."));
        }
      }

      if (uploaded.length) {
        setDraft((current) => ({
          ...current,
          gallery: Array.from(new Set([...current.gallery, ...uploaded])).slice(0, 24),
          heroImage: current.heroImage || uploaded[0] || "",
        }));
        toast.success(uploaded.length.toLocaleString("fa-IR") + " تصویر آپلود شد.");
      }
      if (failed && uploaded.length) toast.warning(failed.toLocaleString("fa-IR") + " تصویر آپلود نشد.");
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function save() {
    setSaving(true);
    try {
      const result = await saveAdminAreaContent({ data: draft });
      setAreas((current) => current.map((area) => area.slug === result.slug ? result : area));
      setSelectedSlug(result.slug);
      setDraft(toDraft(result));
      toast.success(result.isPublished ? "اطلاعات محله ذخیره و در سایت منتشر شد." : "پیش‌نویس اطلاعات محله ذخیره شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ذخیره اطلاعات محله انجام نشد.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <section className="admin-area-content"><div className="admin-area-empty">در حال دریافت فهرست همهٔ محله‌ها…</div></section>;
  }

  return (
    <section className="admin-area-content" dir="rtl">
      <header className="admin-area-hero">
        <div className="admin-area-hero-icon"><MapPinned size={25} /></div>
        <div className="admin-area-hero-copy">
          <span className="kicker">راهنمای محله‌ها</span>
          <h2>اطلاعات محله‌ها</h2>
          <p>توضیحات، تصاویر، ویژگی‌ها و اطلاعات سئوی هر محله را یک‌بار ثبت کنید تا در صفحهٔ اختصاصی همان محله نمایش داده شود.</p>
        </div>
        <div className="admin-area-stats">
          <div><strong>{areas.length.toLocaleString("fa-IR")}</strong><span>محلهٔ ثبت‌شده</span></div>
          <div><strong>{withContentCount.toLocaleString("fa-IR")}</strong><span>دارای محتوا</span></div>
          <div><strong>{publishedCount.toLocaleString("fa-IR")}</strong><span>منتشرشده</span></div>
        </div>
      </header>

      {!databaseConfigured ? (
        <div className="admin-area-warning" role="alert">اتصال پایگاه داده تنظیم نشده است؛ فهرست محله‌ها در حالت فقط‌خواندنی است و ذخیره‌سازی تا فعال شدن دیتابیس ممکن نیست.</div>
      ) : null}

      <div className="admin-area-layout">
        <aside className="admin-area-directory">
          <div className="admin-area-directory-head"><strong>فهرست محله‌ها</strong><span>{filteredAreas.length.toLocaleString("fa-IR")} نتیجه</span></div>
          <label className="admin-area-search"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="جست‌وجوی نام محله…" /></label>
          <div className="admin-area-list">
            {filteredAreas.map((area) => (
              <button key={area.slug} type="button" className={"admin-area-list-item" + (selectedSlug === area.slug ? " is-active" : "")} onClick={() => selectArea(area)}>
                <span className="admin-area-list-main"><strong>{area.name}</strong><small>{area.groupTitle}</small></span>
                <span className={"admin-area-status" + (area.isPublished ? " is-published" : "")}>{area.isPublished ? "منتشر" : (area.intro || area.about || area.gallery.length ? "پیش‌نویس" : "بدون محتوا")}</span>
              </button>
            ))}
            {!filteredAreas.length ? <div className="admin-area-empty">محله‌ای با این عبارت پیدا نشد.</div> : null}
          </div>
        </aside>

        <div className="admin-area-editor">
          {!selectedArea || !draft.slug ? (
            <div className="admin-area-empty">برای شروع، یک محله را از فهرست انتخاب کنید.</div>
          ) : (
            <>
              <div className="admin-area-editor-head">
                <div>
                  <span className="kicker">{selectedArea.groupTitle}</span>
                  <h3>{selectedArea.name}</h3>
                  <p>صفحهٔ عمومی: <a href={"/areas/" + encodeURIComponent(selectedArea.slug)} target="_blank" rel="noreferrer">مشاهده محله <ExternalLink size={13} /></a></p>
                </div>
                <label className="admin-area-publish-toggle">
                  <input type="checkbox" checked={draft.isPublished} onChange={(event) => update("isPublished", event.target.checked)} />
                  <span><strong>انتشار در سایت</strong><small>{draft.isPublished ? "محتوا برای بازدیدکنندگان قابل نمایش است." : "پیش‌نویس فقط در پنل دیده می‌شود."}</small></span>
                </label>
              </div>

              <div className="admin-area-editor-grid">
                <Field label="معرفی کوتاه محله" value={draft.intro} onChange={(value) => update("intro", value)} multiline rows={3} hint="متن کوتاهی که بالای صفحهٔ اختصاصی محله نمایش داده می‌شود." />
                <Field label="شرح کامل محله" value={draft.about} onChange={(value) => update("about", value)} multiline rows={7} hint="چند پاراگراف دربارهٔ بافت محله، موقعیت و نکاتی که برای خریدار یا مستأجر مفید است." />
                <Field label="ویژگی‌های شاخص" value={draft.highlights} onChange={(value) => update("highlights", value)} multiline rows={5} hint="هر ویژگی را در یک خط بنویسید؛ برای نمونه دسترسی به خیابان‌های اصلی." />
                <Field label="امکانات و خدمات اطراف" value={draft.amenities} onChange={(value) => update("amenities", value)} multiline rows={5} hint="مدرسه، درمانگاه، مراکز خرید، فضای سبز و سایر خدمات؛ فقط مواردی که از صحت آن‌ها مطمئن هستید." />
                <Field label="دسترسی و حمل‌ونقل" value={draft.transportation} onChange={(value) => update("transportation", value)} multiline rows={5} hint="خیابان‌های اصلی، حمل‌ونقل عمومی و مسیرهای شناخته‌شده." />
                <Field label="یادداشت بازار محله" value={draft.marketNote} onChange={(value) => update("marketNote", value)} multiline rows={5} hint="توضیح کارشناسی دربارهٔ بازار ملک؛ قیمت قطعی یا دادهٔ تأییدنشده وارد نکنید." />
              </div>

              <section className="admin-area-media-section">
                <div className="admin-area-section-head"><div><span className="kicker">تصاویر</span><h4>کاور و گالری محله</h4></div><span>{draft.gallery.length.toLocaleString("fa-IR")} از ۲۴ تصویر</span></div>
                <Field label="نشانی تصویر کاور" value={draft.heroImage} onChange={(value) => update("heroImage", value)} dir="ltr" hint="آپلود تصویر اول، در صورت خالی بودن، آن را به‌عنوان کاور انتخاب می‌کند." />
                <div className="admin-area-upload-row">
                  <input ref={fileInput} type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,image/avif" hidden onChange={(event) => void uploadImages(event.target.files)} />
                  <button className="btn-ghost" type="button" disabled={uploading || !databaseConfigured} onClick={() => fileInput.current?.click()}>
                    <ImagePlus size={17} /> {uploading ? "در حال آپلود " + uploadProgress.toLocaleString("fa-IR") + "٪" : "آپلود تصویر از دستگاه"}
                  </button>
                  <small>JPG، PNG، WebP، GIF یا AVIF · حداکثر ۲۵ مگابایت برای هر تصویر</small>
                </div>
                <Field label="نشانی تصاویر گالری (هر خط یک تصویر)" value={draft.gallery.join("\n")} onChange={(value) => update("gallery", Array.from(new Set(lines(value))).slice(0, 24))} multiline rows={4} dir="ltr" hint="می‌توانید آدرس تصویرهای موجود را هم اضافه کنید." />
                {draft.gallery.length ? (
                  <div className="admin-area-gallery-editor">
                    {draft.gallery.map((url, index) => (
                      <figure className="admin-area-gallery-item" key={url + "-" + index}>
                        <img src={url} alt={"پیش‌نمایش تصویر " + (index + 1).toLocaleString("fa-IR")} loading="lazy" />
                        <figcaption>
                          <button type="button" onClick={() => update("heroImage", url)} title="استفاده به‌عنوان کاور">کاور</button>
                          <button type="button" onClick={() => update("gallery", draft.gallery.filter((_, itemIndex) => itemIndex !== index))} aria-label={"حذف تصویر " + (index + 1).toLocaleString("fa-IR")}><Trash2 size={14} /></button>
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                ) : <p className="admin-area-field-hint">هنوز تصویری برای این محله اضافه نشده است.</p>}
              </section>

              <section className="admin-area-seo-section">
                <div className="admin-area-section-head"><div><span className="kicker">SEO</span><h4>عنوان و توضیحات موتورهای جست‌وجو</h4></div></div>
                <div className="admin-area-editor-grid">
                  <Field label="عنوان اختصاصی صفحه" value={draft.seoTitle} onChange={(value) => update("seoTitle", value)} hint="اختیاری؛ در صورت خالی بودن عنوان پیش‌فرض سایت استفاده می‌شود." />
                  <Field label="توضیحات متا" value={draft.seoDescription} onChange={(value) => update("seoDescription", value)} multiline rows={3} hint="اختیاری؛ بهتر است توضیحی دقیق و طبیعی باشد." />
                </div>
              </section>

              <footer className="admin-area-savebar">
                <span>{selectedArea.updatedAt ? "آخرین ذخیره: " + new Date(selectedArea.updatedAt).toLocaleString("fa-IR") : "برای این محله هنوز محتوایی ذخیره نشده است."}</span>
                <button className="btn-gold" type="button" onClick={() => void save()} disabled={saving || uploading || !databaseConfigured}>
                  <Save size={17} /> {saving ? "در حال ذخیره…" : draft.isPublished ? "ذخیره و انتشار" : "ذخیره پیش‌نویس"}
                </button>
              </footer>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
