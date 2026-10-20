import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Check,
  FileImage,
  Film,
  ImagePlus,
  Link2,
  Loader2,
  RefreshCw,
  Star,
  Trash2,
  Upload,
  X,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import { toast } from "sonner";
import { MAX_PROPERTY_MEDIA, isAllowedMediaRef, isVideoUrl, mediaSourceCandidates } from "@/lib/media";
import { uploadErrorMessage, uploadPropertyMedia } from "@/lib/media-upload-client";
import type { PropertyType } from "@/lib/properties";
import type { PropertyWatermarkPosition } from "@/lib/property-watermark";
import { getPropertyFallbackImage, isPropertyFallbackImage } from "@/lib/property-fallback-images";
import { faBytes } from "@/components/hirmand/admin-ui-utils";
import "./admin-media-field.css";

type Props = {
  value: string;
  onChange: (next: string) => void;
  propertyType?: PropertyType;
  propertyId?: string;
};

type FailedUpload = {
  id: string;
  file: File;
  name: string;
  sizeBytes: number;
  message: string;
};

type UploadProgress = {
  name: string;
  progress: number;
  index: number;
  total: number;
};

const MAX_IMAGE_DIMENSION = 2560;
const IMAGE_QUALITY = 0.82;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

const ACCEPTED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

const WATERMARK_POSITION_OPTIONS: Array<{
  value: PropertyWatermarkPosition;
  label: string;
}> = [
  { value: "top-right", label: "بالا راست" },
  { value: "top-left", label: "بالا چپ" },
  { value: "bottom-right", label: "پایین راست" },
  { value: "bottom-left", label: "پایین چپ" },
];

function linesToList(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function listToLines(items: string[]): string {
  return items.join("\n");
}

function optionLabel(position: PropertyWatermarkPosition): string {
  return WATERMARK_POSITION_OPTIONS.find((option) => option.value === position)?.label ?? "پایین راست";
}

function uniqueMedia(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)))
    .filter((item) => !isPropertyFallbackImage(item))
    .slice(0, MAX_PROPERTY_MEDIA);
}

function mimeFromFilename(filename: string): string {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "png") return "image/png";
  if (extension === "webp") return "image/webp";
  if (extension === "gif") return "image/gif";
  if (extension === "avif") return "image/avif";
  if (extension === "mp4" || extension === "m4v") return "video/mp4";
  if (extension === "webm") return "video/webm";
  if (extension === "mov") return "video/quicktime";
  return "";
}

function resolveClientMime(file: File): string {
  if (ACCEPTED_TYPES.has(file.type)) return file.type;
  if (!file.type || file.type === "application/octet-stream") {
    const fromName = mimeFromFilename(file.name);
    if (ACCEPTED_TYPES.has(fromName)) return fromName;
  }
  return "";
}

async function loadImageDimensions(file: File): Promise<{
  width: number;
  height: number;
  close?: () => void;
}> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    return {
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    };
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("خواندن تصویر انتخاب‌شده انجام نشد."));
      element.src = objectUrl;
    });
    return { width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** Optimisation is best-effort. Original bytes are always retained on failure. */
async function optimiseImage(file: File): Promise<{ file: File; savedBytes: number }> {
  if (
    !file.type.startsWith("image/") ||
    file.type === "image/gif" ||
    file.type === "image/svg+xml"
  ) {
    return { file, savedBytes: 0 };
  }

  let dimensions: Awaited<ReturnType<typeof loadImageDimensions>>;
  try {
    dimensions = await loadImageDimensions(file);
  } catch {
    return { file, savedBytes: 0 };
  }

  if (
    file.type === "image/webp" &&
    dimensions.width <= MAX_IMAGE_DIMENSION &&
    dimensions.height <= MAX_IMAGE_DIMENSION
  ) {
    dimensions.close?.();
    return { file, savedBytes: 0 };
  }

  const maxDimension = Math.max(dimensions.width, dimensions.height);
  const scale = maxDimension > MAX_IMAGE_DIMENSION
    ? MAX_IMAGE_DIMENSION / maxDimension
    : 1;
  const width = Math.max(1, Math.round(dimensions.width * scale));
  const height = Math.max(1, Math.round(dimensions.height * scale));
  dimensions.close?.();

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("رمزگشایی تصویر برای بهینه‌سازی ناموفق بود."));
      element.src = objectUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return { file, savedBytes: 0 };

    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/webp", IMAGE_QUALITY);
    });
    if (!blob || blob.size >= file.size) return { file, savedBytes: 0 };

    const baseName = file.name.replace(/\.[^.]+$/, "") || "property-image";
    const optimised = new File([blob], baseName + ".webp", {
      type: "image/webp",
      lastModified: Date.now(),
    });
    return { file: optimised, savedBytes: file.size - optimised.size };
  } catch {
    return { file, savedBytes: 0 };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function MediaPreview({ src, fallback }: { src: string; fallback: string }) {
  const candidates = mediaSourceCandidates(src, fallback);
  const [attempt, setAttempt] = useState(0);
  const [broken, setBroken] = useState(false);
  const current = candidates[Math.min(attempt, Math.max(0, candidates.length - 1))] ?? fallback;

  useEffect(() => {
    setAttempt(0);
    setBroken(false);
  }, [src, fallback]);

  function handleError() {
    if (attempt < candidates.length - 1) {
      setAttempt((previous) => Math.min(previous + 1, candidates.length - 1));
    } else {
      setBroken(true);
    }
  }

  if (broken) {
    return (
      <div className="hirmand-media-preview-fallback" title="فایل در دسترس نیست">
        <FileImage size={25} aria-hidden="true" />
        <span>پیش‌نمایش در دسترس نیست</span>
      </div>
    );
  }

  if (isVideoUrl(current)) {
    return (
      <video
        src={current}
        muted
        playsInline
        preload="metadata"
        onError={handleError}
        aria-label="پیش‌نمایش ویدیوی ملک"
      />
    );
  }

  return (
    <img
      src={current}
      alt="پیش‌نمایش رسانه ملک"
      loading="lazy"
      decoding="async"
      onError={handleError}
    />
  );
}

export function AdminMediaField({
  value,
  onChange,
  propertyType,
  propertyId,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadingRef = useRef(false);
  const valueRef = useRef(value);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [failed, setFailed] = useState<FailedUpload[]>([]);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [linkDraft, setLinkDraft] = useState("");
  const [watermarkEnabled, setWatermarkEnabled] = useState(false);
  const [watermarkPosition, setWatermarkPosition] =
    useState<PropertyWatermarkPosition>("bottom-right");
  const items = linesToList(value).filter((item) => !isPropertyFallbackImage(item));
  const fallback = getPropertyFallbackImage(propertyType ?? "apartment", propertyId ?? "admin");
  const invalidExisting = items.filter((item) => !isAllowedMediaRef(item));

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  function setItems(nextItems: string[]) {
    const next = uniqueMedia(nextItems);
    const normalised = listToLines(next);
    valueRef.current = normalised;
    onChange(normalised);
    setSelected((current) => current.filter((item) => next.includes(item)));
  }

  function moveItem(index: number, offset: -1 | 1) {
    const target = index + offset;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target]!, next[index]!];
    setItems(next);
  }

  function makePrimary(index: number) {
    if (index <= 0 || index >= items.length) return;
    const next = [...items];
    const [primary] = next.splice(index, 1);
    if (!primary) return;
    next.unshift(primary);
    setItems(next);
    toast.success("تصویر کاور اصلی تغییر کرد.");
  }

  function reorderByDrag(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    setItems(next);
  }

  function removeSelected() {
    if (!selected.length) return;
    setItems(items.filter((item) => !selected.includes(item)));
    setSelected([]);
  }

  async function uploadOne(file: File, index: number, total: number) {
    const originalType = resolveClientMime(file);
    if (!originalType) {
      throw new Error("نوع این فایل پشتیبانی نمی‌شود. JPG، PNG، WebP، GIF، AVIF، MP4، WebM یا MOV انتخاب کنید.");
    }
    if (watermarkEnabled && originalType === "image/gif") {
      throw new Error("برای حفظ انیمیشن GIF، واترمارک دائمی ممکن نیست؛ واترمارک را خاموش کنید یا تصویر ثابت انتخاب کنید.");
    }
    if (file.size <= 0) throw new Error("فایل انتخاب‌شده خالی است.");
    if (file.size > MAX_FILE_BYTES) throw new Error("حجم هر فایل باید حداکثر ۲۵ مگابایت باشد.");

    const optimised = await optimiseImage(file);
    const contentType = resolveClientMime(optimised.file) || originalType;
    const result = await uploadPropertyMedia({
      file: optimised.file,
      contentType,
      assetKind: "gallery",
      watermark: {
        enabled: watermarkEnabled,
        position: watermarkPosition,
      },
      rejectedMessage: "آپلود رسانه پذیرفته نشد.",
      onProgress: (percentage) => {
        setProgress({
          name: file.name,
          progress: percentage,
          index,
          total,
        });
      },
    });
    return { url: result.url, savedBytes: optimised.savedBytes };
  }

  async function uploadFiles(input: FileList | File[]) {
    if (uploadingRef.current) return;
    const files = Array.from(input);
    if (!files.length) return;

    const latestItems = linesToList(valueRef.current).filter((item) => !isPropertyFallbackImage(item));
    if (latestItems.length + files.length > MAX_PROPERTY_MEDIA) {
      toast.error(`حداکثر ${MAX_PROPERTY_MEDIA.toLocaleString("fa-IR")} رسانه برای هر فایل ملک مجاز است.`);
      return;
    }
    if (files.some((file) => file.size > MAX_FILE_BYTES)) {
      toast.error("حجم هر فایل باید حداکثر ۲۵ مگابایت باشد.");
      return;
    }
    const unsupported = files.find((file) => !resolveClientMime(file));
    if (unsupported) {
      toast.error(`نوع فایل «${unsupported.name}» پشتیبانی نمی‌شود.`);
      return;
    }

    uploadingRef.current = true;
    setUploading(true);
    setProgress({ name: files[0]!.name, progress: 0, index: 1, total: files.length });
    const added: string[] = [];
    const failedRows: FailedUpload[] = [];
    let savedBytes = 0;

    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index]!;
        setProgress({
          name: file.name,
          progress: 0,
          index: index + 1,
          total: files.length,
        });
        try {
          const uploaded = await uploadOne(file, index + 1, files.length);
          added.push(uploaded.url);
          savedBytes += uploaded.savedBytes;
        } catch (error) {
          failedRows.push({
            id: `${file.name}-${file.lastModified}-${index}`,
            file,
            name: file.name,
            sizeBytes: file.size,
            message: uploadErrorMessage(error, "آپلود این فایل انجام نشد."),
          });
        }
      }

      if (added.length) {
        setItems([
          ...linesToList(valueRef.current).filter((item) => !isPropertyFallbackImage(item)),
          ...added,
        ]);
      }
      if (failedRows.length) setFailed((current) => [...current, ...failedRows]);

      const saved = savedBytes > 0 ? `؛ حدود ${faBytes(savedBytes)} حجم کاهش یافت` : "";
      if (added.length && failedRows.length) {
        toast.warning(
          `${added.length.toLocaleString("fa-IR")} رسانه آپلود شد${saved}؛ ${failedRows.length.toLocaleString("fa-IR")} فایل ناموفق است و امکان تلاش مجدد دارد.`,
        );
      } else if (added.length) {
        toast.success(
          added.length === 1
            ? `رسانه با موفقیت آپلود شد${saved}.`
            : `${added.length.toLocaleString("fa-IR")} رسانه با موفقیت آپلود شد${saved}.`,
        );
      } else if (failedRows.length) {
        toast.error("هیچ‌کدام از فایل‌ها آپلود نشد. پیام هر فایل را بررسی کنید.");
      }
    } finally {
      uploadingRef.current = false;
      setUploading(false);
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function retryFailed(entry: FailedUpload) {
    if (uploadingRef.current) return;
    if (linesToList(valueRef.current).filter((item) => !isPropertyFallbackImage(item)).length >= MAX_PROPERTY_MEDIA) {
      toast.error(`حداکثر ${MAX_PROPERTY_MEDIA.toLocaleString("fa-IR")} رسانه برای هر ملک مجاز است.`);
      return;
    }

    uploadingRef.current = true;
    setUploading(true);
    setFailed((current) => current.filter((item) => item.id !== entry.id));
    setProgress({ name: entry.name, progress: 0, index: 1, total: 1 });
    try {
      const uploaded = await uploadOne(entry.file, 1, 1);
      setItems([
        ...linesToList(valueRef.current).filter((item) => !isPropertyFallbackImage(item)),
        uploaded.url,
      ]);
      toast.success(`«${entry.name}» با موفقیت آپلود شد.`);
    } catch (error) {
      const message = uploadErrorMessage(error, "تلاش مجدد انجام نشد.");
      setFailed((current) => [...current, { ...entry, message }]);
      toast.error(message);
    } finally {
      uploadingRef.current = false;
      setUploading(false);
      setProgress(null);
    }
  }

  function onPick(event: ChangeEvent<HTMLInputElement>) {
    // Snapshot the File objects before resetting the input. Some browsers clear
    // the live FileList when value is set to an empty string.
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (files.length) void uploadFiles(files);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);
    if (!uploading && event.dataTransfer.files.length) {
      void uploadFiles(event.dataTransfer.files);
    }
  }

  function addLink() {
    const url = linkDraft.trim();
    if (!url) return;
    if (!isAllowedMediaRef(url)) {
      toast.error("آدرس باید HTTPS یا یک آدرس داخلی معتبر از رسانه‌های هیرمند باشد.");
      return;
    }
    if (items.length >= MAX_PROPERTY_MEDIA) {
      toast.error(`حداکثر ${MAX_PROPERTY_MEDIA.toLocaleString("fa-IR")} رسانه برای هر ملک مجاز است.`);
      return;
    }
    setItems([...items, url]);
    setLinkDraft("");
    toast.success("آدرس رسانه به فایل اضافه شد؛ برای ذخیره نهایی، فایل ملک را ذخیره کنید.");
  }

  return (
    <section className="hirmand-media-manager" aria-label="مدیریت تصاویر و ویدیوهای ملک">
      <div className="hirmand-media-heading">
        <div>
          <span className="hirmand-media-eyebrow">رسانه‌های فایل</span>
          <h3>تصاویر و ویدیوهای ملک</h3>
          <p>فایل را انتخاب کنید یا بکشید و اینجا رها کنید. رسانه‌ها پس از ذخیرهٔ فایل ملک ثبت می‌شوند.</p>
        </div>
        <div className="hirmand-media-count" aria-live="polite">
          <strong>{items.length.toLocaleString("fa-IR")}</strong>
          <span>از {MAX_PROPERTY_MEDIA.toLocaleString("fa-IR")}</span>
        </div>
      </div>

      <input
        ref={inputRef}
        className="hirmand-media-file-input"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/webm,video/quicktime"
        multiple
        onChange={onPick}
      />

      <section className="hirmand-watermark-controls" aria-label="تنظیم واترمارک عکس و ویدیوی ملک">
        <div className="hirmand-watermark-controls-header">
          <div className="hirmand-watermark-controls-title">
            <span className={`hirmand-watermark-controls-icon${watermarkEnabled ? " is-active" : ""}`}>
              {watermarkEnabled
                ? <ShieldCheck size={20} aria-hidden="true" />
                : <ShieldOff size={20} aria-hidden="true" />}
            </span>
            <div>
              <strong>واترمارک اختصاصی هیرمند</strong>
              <p>لوگوی کوچک و نیمه‌شفاف روی فایل نهایی عکس یا ویدیو درج می‌شود.</p>
            </div>
          </div>
          <button
            type="button"
            className={`hirmand-watermark-toggle${watermarkEnabled ? " is-active" : ""}`}
            role="switch"
            aria-checked={watermarkEnabled}
            disabled={uploading}
            onClick={() => setWatermarkEnabled((enabled) => !enabled)}
          >
            <span className="hirmand-watermark-switch-track" aria-hidden="true">
              <span />
            </span>
            <span>{watermarkEnabled ? "واترمارک روشن" : "بدون واترمارک"}</span>
          </button>
        </div>

        <div className={`hirmand-watermark-controls-body${watermarkEnabled ? " is-enabled" : ""}`}>
          <div className="hirmand-watermark-position-area">
            <strong>محل قرارگیری لوگو</strong>
            <p>گوشه‌ای را انتخاب کن که کمترین تداخل را با نمای ملک داشته باشد.</p>
            <div className="hirmand-watermark-position-grid" role="group" aria-label="محل قرارگیری واترمارک">
              {WATERMARK_POSITION_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`hirmand-watermark-position-option${watermarkPosition === option.value ? " is-selected" : ""}`}
                  aria-pressed={watermarkPosition === option.value}
                  disabled={!watermarkEnabled || uploading}
                  onClick={() => setWatermarkPosition(option.value)}
                >
                  <span className="hirmand-watermark-corner-diagram" aria-hidden="true">
                    <span className={`is-${option.value}`} />
                  </span>
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="hirmand-watermark-preview-card">
            <div className="hirmand-watermark-preview-scene" role="img" aria-label="پیش‌نمایش قرارگیری لوگو">
              <span className="hirmand-watermark-preview-building" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              {watermarkEnabled ? (
                <span className={`hirmand-watermark-preview-mark is-${watermarkPosition}`} aria-hidden="true">
                  <img src="/images/hirmand-logo.png" alt="" />
                </span>
              ) : null}
            </div>
            <div className="hirmand-watermark-preview-caption">
              <strong>پیش‌نمایش</strong>
              <span>{watermarkEnabled ? optionLabel(watermarkPosition) : "واترمارک خاموش است"}</span>
            </div>
          </div>
        </div>
        <p className="hirmand-watermark-note">
          این گزینه فقط روی رسانه‌هایی که از این به بعد آپلود می‌کنی اعمال می‌شود؛ فایل‌های قبلی تغییر نمی‌کنند.
          واترمارک روی نسخهٔ نهایی درج می‌شود و مثل یک لایهٔ قابل‌خاموش‌کردن نیست.
        </p>
      </section>

      <div
        className={`hirmand-media-dropzone${dragOver ? " is-over" : ""}${uploading ? " is-busy" : ""}`}
        role="button"
        tabIndex={0}
        aria-disabled={uploading}
        aria-label="انتخاب یا رها کردن عکس و ویدیوی ملک"
        onClick={() => !uploading && inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (!uploading) inputRef.current?.click();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          if (!uploading) setDragOver(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragOver(false);
        }}
        onDrop={onDrop}
      >
        <span className="hirmand-media-drop-icon">
          {uploading ? <Loader2 size={24} className="hirmand-media-spin" aria-hidden="true" /> : <ImagePlus size={24} aria-hidden="true" />}
        </span>
        <strong>{uploading ? "در حال ارسال رسانه" : "افزودن تصاویر و ویدیوها"}</strong>
        <span>{uploading ? progress?.name : "برای انتخاب از دستگاه کلیک کنید یا فایل‌ها را اینجا رها کنید"}</span>
        {uploading && progress ? (
          <div className="hirmand-media-progress-wrap">
            <div className="hirmand-media-progress-label">
              <span>فایل {progress.index.toLocaleString("fa-IR")} از {progress.total.toLocaleString("fa-IR")}</span>
              <strong>{progress.progress.toLocaleString("fa-IR")}٪</strong>
            </div>
            <div className="hirmand-media-progress" role="progressbar" aria-valuenow={progress.progress} aria-valuemin={0} aria-valuemax={100} aria-label="پیشرفت آپلود">
              <span style={{ width: `${Math.max(0, Math.min(100, progress.progress))}%` }} />
            </div>
          </div>
        ) : (
          <small>JPG، PNG، WebP، GIF، AVIF، MP4، WebM و MOV · حداکثر ۲۵ مگابایت برای هر فایل</small>
        )}
      </div>

      {invalidExisting.length > 0 ? (
        <div className="hirmand-media-alert" role="alert">
          <AlertCircle size={17} aria-hidden="true" />
          <span>{invalidExisting.length.toLocaleString("fa-IR")} آدرس قدیمی یا نامعتبر شناسایی شده. آن‌ها را حذف یا با رسانهٔ جدید جایگزین کنید تا ذخیره‌سازی متوقف نشود.</span>
        </div>
      ) : null}

      {failed.length > 0 ? (
        <div className="hirmand-media-failed" role="alert">
          <div className="hirmand-media-failed-heading">
            <AlertCircle size={17} aria-hidden="true" />
            <strong>{failed.length.toLocaleString("fa-IR")} فایل نیاز به تلاش مجدد دارد</strong>
            <button type="button" className="hirmand-media-icon-button" onClick={() => setFailed([])} aria-label="پاک کردن فهرست فایل‌های ناموفق">
              <X size={16} />
            </button>
          </div>
          {failed.map((entry) => (
            <div className="hirmand-media-failed-item" key={entry.id}>
              <div className="hirmand-media-failed-meta">
                <strong dir="auto">{entry.name}</strong>
                <small>{faBytes(entry.sizeBytes)}</small>
                <span>{entry.message}</span>
              </div>
              <button type="button" className="hirmand-media-secondary-button" disabled={uploading} onClick={() => void retryFailed(entry)}>
                <RefreshCw size={14} aria-hidden="true" /> تلاش مجدد
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {items.length > 0 ? (
        <div className="hirmand-media-library">
          <div className="hirmand-media-library-heading">
            <div>
              <strong>رسانه‌های انتخاب‌شده</strong>
              <span>اولین مورد کاور اصلی است.</span>
            </div>
            {selected.length > 0 ? (
              <button type="button" className="hirmand-media-text-button is-danger" onClick={removeSelected} disabled={uploading}>
                <Trash2 size={14} aria-hidden="true" /> حذف {selected.length.toLocaleString("fa-IR")} مورد
              </button>
            ) : (
              <span className="hirmand-media-hint">برای تغییر ترتیب از فلش‌ها استفاده کنید.</span>
            )}
          </div>
          <div className="hirmand-media-grid">
            {items.map((src, index) => {
              const video = isVideoUrl(src);
              const invalid = !isAllowedMediaRef(src);
              return (
                <article
                  key={`${src}-${index}`}
                  className={`hirmand-media-card${index === 0 ? " is-primary" : ""}${dragIndex === index ? " is-dragging" : ""}${invalid ? " is-invalid" : ""}`}
                  draggable={!uploading}
                  onDragStart={(event) => {
                    setDragIndex(index);
                    event.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (dragIndex != null) reorderByDrag(dragIndex, index);
                    setDragIndex(null);
                  }}
                  onDragEnd={() => setDragIndex(null)}
                >
                  <div className="hirmand-media-preview">
                    <MediaPreview src={src} fallback={fallback} />
                    <label className="hirmand-media-select" title="انتخاب برای حذف گروهی">
                      <input
                        type="checkbox"
                        checked={selected.includes(src)}
                        onChange={() => setSelected((current) => current.includes(src) ? current.filter((item) => item !== src) : [...current, src])}
                        aria-label={`انتخاب رسانه ${(index + 1).toLocaleString("fa-IR")}`}
                        disabled={uploading}
                      />
                    </label>
                    <span className="hirmand-media-kind" title={video ? "ویدیو" : "تصویر"}>
                      {video ? <Film size={13} aria-hidden="true" /> : <ImagePlus size={13} aria-hidden="true" />}
                      {video ? "ویدیو" : "تصویر"}
                    </span>
                    {index === 0 ? <span className="hirmand-media-primary-label"><Star size={12} fill="currentColor" aria-hidden="true" /> کاور اصلی</span> : null}
                    {invalid ? <span className="hirmand-media-invalid-label">آدرس نامعتبر</span> : null}
                  </div>
                  <div className="hirmand-media-card-footer">
                    <span className="hirmand-media-card-index">رسانه { (index + 1).toLocaleString("fa-IR") }</span>
                    <div className="hirmand-media-card-actions">
                      <button type="button" onClick={() => moveItem(index, -1)} disabled={uploading || index === 0} aria-label="انتقال به بالا" title="انتقال به بالا">
                        <ArrowUp size={15} />
                      </button>
                      <button type="button" onClick={() => moveItem(index, 1)} disabled={uploading || index === items.length - 1} aria-label="انتقال به پایین" title="انتقال به پایین">
                        <ArrowDown size={15} />
                      </button>
                      <button type="button" onClick={() => makePrimary(index)} disabled={uploading || index === 0} aria-label="تعیین به‌عنوان کاور اصلی" title="تعیین به‌عنوان کاور اصلی">
                        <Star size={14} />
                      </button>
                      <button type="button" className="is-delete" onClick={() => setItems(items.filter((_, itemIndex) => itemIndex !== index))} disabled={uploading} aria-label="حذف این رسانه" title="حذف از این فایل">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          {items.length < MAX_PROPERTY_MEDIA ? (
            <p className="hirmand-media-footnote"><Check size={14} aria-hidden="true" /> حذف از این فهرست فقط رسانه را از همین فایل ملک جدا می‌کند؛ فایل فیزیکی به‌صورت خودکار و ناخواسته از رسانه‌های احتمالی مشترک پاک نمی‌شود.</p>
          ) : null}
        </div>
      ) : (
        <div className="hirmand-media-empty">
          <ImagePlus size={22} aria-hidden="true" />
          <strong>هنوز رسانه‌ای اضافه نشده</strong>
          <span>حداقل یک عکس واضح از فضای داخلی یا نمای ملک اضافه کنید.</span>
        </div>
      )}

      <details className="hirmand-media-link-details">
        <summary><Link2 size={15} aria-hidden="true" /> افزودن لینک رسانهٔ موجود</summary>
        <div className="hirmand-media-link-row">
          <input
            type="url"
            dir="ltr"
            value={linkDraft}
            onChange={(event) => setLinkDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addLink();
              }
            }}
            placeholder="https://… یا /api/media/…"
            aria-label="نشانی مستقیم تصویر یا ویدیو"
            disabled={uploading}
          />
          <button type="button" onClick={addLink} disabled={uploading || !linkDraft.trim()}>
            <Link2 size={15} aria-hidden="true" /> افزودن
          </button>
        </div>
        <small>برای فایل‌هایی که قبلاً در فضای رسانه ذخیره شده‌اند یا لینک معتبر HTTPS دارند. در حالت عادی از آپلود مستقیم استفاده کنید.</small>
      </details>
    </section>
  );
}
