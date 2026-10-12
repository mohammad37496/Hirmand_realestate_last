import { uploadErrorMessage, uploadInChunks } from "@/lib/media-upload-client";
import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Film,
  ImageIcon,
  Loader2,
  RefreshCw,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { MAX_PROPERTY_MEDIA, isVideoUrl } from "@/lib/media";
import type { PropertyType } from "@/lib/properties";
import { getPropertyFallbackImage } from "@/lib/property-fallback-images";
import {
  getPropertyWatermarkSettings,
  DEFAULT_PROPERTY_WATERMARK,
  isPermanentlyWatermarkedMediaUrl,
  type PropertyWatermarkSettings,
} from "@/lib/property-watermark";
import { applyPropertyImageWatermark } from "@/lib/property-image-watermark";
import { PropertyMediaWatermark } from "@/components/hirmand/property-media-watermark";
import { faBytes } from "@/components/hirmand/admin-ui-utils";

type Props = {
  value: string;
  onChange: (next: string) => void;
  /** Used to render a branded fallback when a stored image 404s. */
  propertyType?: PropertyType;
  propertyId?: string;
};

type FailedUpload = {
  key: string;
  name: string;
  sizeBytes: number;
  file: File;
  message: string;
};

function linesToList(raw: string) {
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function listToLines(items: string[]) {
  return items.join("\n");
}

const MAX_IMAGE_DIMENSION = 2560;
const IMAGE_QUALITY = 0.82;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

async function loadImageDimensions(file: File): Promise<{ width: number; height: number; close?: () => void }> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    return { width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("خواندن تصویر انجام نشد."));
      element.src = objectUrl;
    });
    return { width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function optimizeImage(file: File): Promise<{ file: File; savedBytes: number }> {
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.type === "image/svg+xml") {
    return { file, savedBytes: 0 };
  }

  if (file.type === "image/webp") {
    const dimensions = await loadImageDimensions(file);
    dimensions.close?.();
    if (dimensions.width <= MAX_IMAGE_DIMENSION && dimensions.height <= MAX_IMAGE_DIMENSION) {
      return { file, savedBytes: 0 };
    }
  }

  const dimensions = await loadImageDimensions(file);
  const maxDimension = Math.max(dimensions.width, dimensions.height);
  const scale = maxDimension > MAX_IMAGE_DIMENSION ? MAX_IMAGE_DIMENSION / maxDimension : 1;
  const width = Math.max(1, Math.round(dimensions.width * scale));
  const height = Math.max(1, Math.round(dimensions.height * scale));
  dimensions.close?.();

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("پردازش تصویر انجام نشد."));
      element.src = objectUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return { file, savedBytes: 0 };

    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", IMAGE_QUALITY),
    );

    if (!blob || blob.size >= file.size) {
      return { file, savedBytes: 0 };
    }

    const baseName = file.name.replace(/\.[^.]+$/, "") || "property-image";
    const optimized = new File([blob], baseName + ".webp", {
      type: "image/webp",
      lastModified: Date.now(),
    });
    return { file: optimized, savedBytes: file.size - optimized.size };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** A single thumbnail that swaps in a branded fallback when the file is gone. */
function MediaThumb({ src, fallback }: { src: string; fallback: string }) {
  const [broken, setBroken] = useState(false);

  if (broken) {
    return (
      <img
        src={fallback}
        alt="تصویر در دسترس نیست"
        className="is-broken"
        loading="lazy"
        data-broken="true"
        title="این فایل در سرور پیدا نشد — بارگذاری دوباره یا حذف آن را در نظر بگیرید"
      />
    );
  }

  return isVideoUrl(src) ? (
    <video src={src} muted playsInline preload="metadata" onError={() => setBroken(true)} />
  ) : (
    <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} />
  );
}

export function AdminMediaField({ value, onChange, propertyType, propertyId }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadLabel, setUploadLabel] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [failed, setFailed] = useState<FailedUpload[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [watermarkSettings, setWatermarkSettings] = useState<PropertyWatermarkSettings>(DEFAULT_PROPERTY_WATERMARK);
  const items = linesToList(value);
  const fallback = getPropertyFallbackImage(propertyType ?? "apartment", propertyId ?? "admin");

  useEffect(() => {
    let active = true;
    void getPropertyWatermarkSettings().then((settings) => {
      if (active) setWatermarkSettings(settings);
    });
    return () => {
      active = false;
    };
  }, []);

  function setItems(next: string[]) {
    const unique = Array.from(new Set(next.map((item) => item.trim()).filter(Boolean)));
    onChange(listToLines(unique.slice(0, MAX_PROPERTY_MEDIA)));
    setSelected((current) => current.filter((item) => unique.includes(item)));
  }

  function moveItem(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= items.length) return;
    const next = [...items];
    const current = next[index]!;
    next[index] = next[nextIndex]!;
    next[nextIndex] = current;
    setItems(next);
  }

  /** Promote any thumbnail to the cover slot without disturbing the rest. */
  function makePrimary(index: number) {
    if (index <= 0) return;
    const next = [...items];
    const [moved] = next.splice(index, 1);
    if (!moved) return;
    next.unshift(moved);
    setItems(next);
  }

  function reorderByDrag(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    setItems(next);
  }

  function removeAt(index: number) {
    setItems(items.filter((_, i) => i !== index));
  }

  function removeSelected() {
    if (!selected.length) return;
    setItems(items.filter((item) => !selected.includes(item)));
    setSelected([]);
  }

  function toggleSelected(src: string) {
    setSelected((current) =>
      current.includes(src) ? current.filter((item) => item !== src) : [...current, src],
    );
  }

  async function uploadOne(file: File): Promise<{ url: string; savedBytes: number }> {
    const watermarked = await applyPropertyImageWatermark(file, watermarkSettings);
    const optimized = await optimizeImage(watermarked);
    const result = await uploadInChunks({
      endpoint: "/api/upload",
      file: optimized.file,
      contentType: optimized.file.type,
      rejectedMessage: "نوع یا حجم این فایل رسانه‌ای پذیرفته نشد.",
      onProgress: (percentage) => setUploadProgress(percentage),
    });
    const url = typeof result.response.url === "string" ? result.response.url : "";
    if (!url) throw new Error("نشانی فایل آپلودشده دریافت نشد.");
    return { url, savedBytes: optimized.savedBytes };
  }

  async function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;
    if (items.length + list.length > MAX_PROPERTY_MEDIA) {
      toast.error(`حداکثر ${MAX_PROPERTY_MEDIA.toLocaleString("fa-IR")} فایل رسانه مجاز است.`);
      return;
    }
    if (list.some((file) => !ALLOWED_TYPES.has(file.type))) {
      toast.error("نوع یکی از فایل‌ها پشتیبانی نمی‌شود (JPG، PNG، WebP، GIF، AVIF، MP4، WebM، MOV).");
      return;
    }
    if (list.some((file) => file.size > MAX_FILE_BYTES)) {
      toast.error("حجم فایل اولیه باید حداکثر ۲۵ مگابایت باشد.");
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    const uploaded: string[] = [];
    const newlyFailed: FailedUpload[] = [];
    let optimizedBytes = 0;

    try {
      for (let index = 0; index < list.length; index += 1) {
        const originalFile = list[index]!;
        setUploadLabel(
          `فایل ${(index + 1).toLocaleString("fa-IR")} از ${list.length.toLocaleString("fa-IR")}: ${originalFile.name}`,
        );
        try {
          const result = await uploadOne(originalFile);
          optimizedBytes += result.savedBytes;
          uploaded.push(result.url);
        } catch (error) {
          // Keep the File so the operator can retry instead of re-picking it.
          newlyFailed.push({
            key: `${originalFile.name}-${originalFile.lastModified}-${index}`,
            name: originalFile.name,
            sizeBytes: originalFile.size,
            file: originalFile,
            message: uploadErrorMessage(error, "آپلود این فایل انجام نشد."),
          });
        }
      }

      if (uploaded.length) setItems([...items, ...uploaded]);
      if (newlyFailed.length) setFailed((current) => [...current, ...newlyFailed]);

      const savedLabel = optimizedBytes > 0
        ? ` · حدود ${faBytes(optimizedBytes)} حجم کم شد`
        : "";

      if (uploaded.length && newlyFailed.length) {
        toast.warning(
          `${uploaded.length.toLocaleString("fa-IR")} فایل آپلود شد${savedLabel} · ${newlyFailed.length.toLocaleString("fa-IR")} فایل شکست خورد و در پایین صفحه قابل تلاش مجدد است.`,
        );
      } else if (uploaded.length) {
        toast.success(
          uploaded.length === 1
            ? "فایل با موفقیت آپلود شد." + savedLabel
            : uploaded.length.toLocaleString("fa-IR") + " فایل آپلود شد." + savedLabel,
        );
      }
    } finally {
      setUploading(false);
      setUploadProgress(0);
      setUploadLabel("");
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  /** Re-uploads one failed file in place; keeps other failures untouched. */
  async function retryFailed(entry: FailedUpload) {
    setFailed((current) => current.filter((item) => item.key !== entry.key));
    setUploading(true);
    setUploadProgress(0);
    setUploadLabel(`تلاش مجدد: ${entry.name}`);
    try {
      const { url } = await uploadOne(entry.file);
      setItems([...linesToList(value), url]);
      toast.success(`«${entry.name}» با موفقیت آپلود شد.`);
    } catch (error) {
      setFailed((current) => [
        ...current,
        { ...entry, message: uploadErrorMessage(error, "تلاش مجدد انجام نشد.") },
      ]);
      toast.error(uploadErrorMessage(error, "تلاش مجدد انجام نشد."));
    } finally {
      setUploading(false);
      setUploadProgress(0);
      setUploadLabel("");
    }
  }

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) void uploadFiles(e.target.files);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (uploading) return;
    if (e.dataTransfer.files?.length) void uploadFiles(e.dataTransfer.files);
  }

  return (
    <div className="admin-media">
      <div
        className={`admin-media-drop${dragOver ? " is-over" : ""}${uploading ? " is-busy" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!uploading) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => !uploading && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-disabled={uploading}
        aria-label="افزودن تصویر یا ویدیو به ملک"
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!uploading) inputRef.current?.click();
          }
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/webm,video/quicktime"
          multiple
          hidden
          onChange={onPick}
        />
        {uploading ? (
          <>
            <Loader2 size={22} className="admin-spin" aria-hidden="true" />
            <strong dir="rtl">در حال آپلود… {uploadProgress.toLocaleString("fa-IR")}٪</strong>
            {uploadLabel ? <span dir="ltr">{uploadLabel}</span> : null}
            <div
              className="admin-upload-progress"
              role="progressbar"
              aria-valuenow={uploadProgress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="درصد پیشرفت آپلود"
            >
              <span style={{ width: `${Math.min(100, Math.max(0, uploadProgress))}%` }} />
            </div>
          </>
        ) : (
          <>
            <Upload size={22} aria-hidden="true" />
            <strong>آپلود از گالری یا کامپیوتر</strong>
            <span>تصویر یا ویدیو را بکشید و رها کنید · یا کلیک کنید</span>
            <small>jpg / png / webp / gif / avif / mp4 / webm · تصاویر به WebP و حداکثر ۲۵۶۰px بهینه می‌شوند · ویدئوها بعد از آپلود با واترمارک دائمی به MP4 تبدیل می‌شوند · حداکثر ۲۵ مگابایت · تا {MAX_PROPERTY_MEDIA.toLocaleString("fa-IR")} فایل</small>
          </>
        )}
      </div>

      {failed.length ? (
        <div className="admin-media-failures" role="alert">
          <div className="admin-media-failures-head">
            <AlertTriangle size={16} aria-hidden="true" />
            <strong>{failed.length.toLocaleString("fa-IR")} فایل آپلود نشد</strong>
            <button
              type="button"
              className="admin-icon-btn danger"
              onClick={() => setFailed([])}
              aria-label="پاک کردن فهرست فایل‌های ناموفق"
              title="پاک کردن فهرست"
            >
              <Trash2 size={14} />
            </button>
          </div>
          {failed.map((entry) => (
            <div className="admin-media-failure" key={entry.key}>
              <span className="admin-media-failure-name" dir="ltr" title={entry.name}>
                {entry.name}
              </span>
              <small>{faBytes(entry.sizeBytes)}</small>
              <small className="admin-media-failure-error">{entry.message}</small>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => void retryFailed(entry)}
                disabled={uploading}
              >
                <RefreshCw size={14} /> تلاش مجدد
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {items.length ? (
        <>
          <div className="admin-media-toolbar">
            <strong>
              {items.length.toLocaleString("fa-IR")} رسانه از {MAX_PROPERTY_MEDIA.toLocaleString("fa-IR")}
            </strong>
            <span>اولین مورد کاور اصلی است · برای جابه‌جایی، رسانه را بکشید و روی جای جدید رها کنید.</span>
          </div>

          {selected.length ? (
            <div className="admin-bulk-bar">
              <strong>{selected.length.toLocaleString("fa-IR")} رسانه انتخاب شده</strong>
              <button type="button" className="btn-ghost" onClick={() => setSelected([])}>
                لغو انتخاب
              </button>
              <button type="button" className="btn-ghost danger" onClick={removeSelected}>
                <Trash2 size={15} /> حذف انتخاب‌شده‌ها
              </button>
            </div>
          ) : null}

          <div className="admin-media-grid">
            {items.map((src, index) => {
              const video = isVideoUrl(src);
              return (
                <div
                  key={`${src}-${index}`}
                  className={`admin-media-item${index === 0 ? " is-primary" : ""}${dragIndex === index ? " is-dragging" : ""}`}
                  draggable={!uploading}
                  onDragStart={(e) => {
                    setDragIndex(index);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    reorderByDrag(dragIndex ?? index, index);
                    setDragIndex(null);
                  }}
                  onDragEnd={() => setDragIndex(null)}
                >
                  <MediaThumb src={src} fallback={fallback} />
                  {!video || !isPermanentlyWatermarkedMediaUrl(src) ? <PropertyMediaWatermark /> : null}
                  <label className="admin-media-pick">
                    <input
                      type="checkbox"
                      checked={selected.includes(src)}
                      onChange={() => toggleSelected(src)}
                      aria-label={`انتخاب رسانه ${(index + 1).toLocaleString("fa-IR")}`}
                    />
                  </label>
                  {index === 0 ? <span className="admin-media-primary">کاور اصلی</span> : null}
                  <span className="admin-media-badge" title={video ? "ویدیو" : "تصویر"}>
                    {video ? <Film size={12} /> : <ImageIcon size={12} />}
                  </span>
                  <div className="admin-media-controls">
                    <button
                      type="button"
                      className="admin-media-move"
                      onClick={() => moveItem(index, -1)}
                      disabled={index === 0}
                      title="انتقال به بالا"
                      aria-label={`انتقال رسانه ${(index + 1).toLocaleString("fa-IR")} به بالا`}
                    >
                      <ChevronUp size={13} />
                    </button>
                    <button
                      type="button"
                      className="admin-media-move"
                      onClick={() => moveItem(index, 1)}
                      disabled={index === items.length - 1}
                      title="انتقال به پایین"
                      aria-label={`انتقال رسانه ${(index + 1).toLocaleString("fa-IR")} به پایین`}
                    >
                      <ChevronDown size={13} />
                    </button>
                    <button
                      type="button"
                      className="admin-media-move"
                      onClick={() => makePrimary(index)}
                      disabled={index === 0}
                      title="تعیین به‌عنوان کاور اصلی"
                      aria-label={`تعیین رسانه ${(index + 1).toLocaleString("fa-IR")} به‌عنوان کاور اصلی`}
                    >
                      <Star size={13} />
                    </button>
                    <button
                      type="button"
                      className="admin-media-remove"
                      onClick={() => removeAt(index)}
                      title="حذف این رسانه"
                      aria-label={`حذف رسانه ${(index + 1).toLocaleString("fa-IR")}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : null}

      <label className="field" style={{ marginTop: 12 }}>
        <span>یا لینک مستقیم تصویر/ویدیو (هر خط یک آدرس)</span>
        <textarea
          rows={3}
          dir="ltr"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={"https://...\nhttps://..."}
        />
      </label>
      <p className="admin-field-help">
        حذف یک رسانه فقط آن را از این فایل برمی‌دارد. برای پاک کردن فایل از سرور، بعد از ذخیره از بخش رسانه‌های همان فایل اقدام کنید.
      </p>
    </div>
  );
}
