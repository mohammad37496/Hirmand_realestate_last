import { useRef, useState, type ChangeEvent } from "react";
import { CheckCircle2, FileImage, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { uploadInChunks, uploadErrorMessage } from "@/lib/media-upload-client";
import "@/admin-floor-plan.css";

type Props = {
  value: string;
  onChange: (next: string) => void;
};

const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);

export function AdminFloorPlanField({ value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [broken, setBroken] = useState(false);

  async function upload(file: File) {
    if (!ALLOWED_TYPES.has(file.type)) {
      toast.error("پلان باید تصویر JPG، PNG، WebP یا AVIF باشد.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("حجم پلان باید حداکثر ۱۵ مگابایت باشد.");
      return;
    }

    setUploading(true);
    setProgress(0);
    setBroken(false);
    try {
      const result = await uploadInChunks({
        endpoint: "/api/upload",
        file,
        contentType: file.type,
        rejectedMessage: "آپلود پلان پذیرفته نشد.",
        onProgress: setProgress,
      });
      const url = typeof result.response.url === "string" ? result.response.url.trim() : "";
      if (!url) throw new Error("نشانی پلان آپلودشده دریافت نشد.");
      onChange(url);
      toast.success("پلان واقعی با موفقیت آپلود شد.");
    } catch (error) {
      toast.error(uploadErrorMessage(error, "آپلود پلان انجام نشد."));
    } finally {
      setUploading(false);
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) void upload(file);
  }

  return (
    <div className="admin-floor-plan-field">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        hidden
        onChange={onFileChange}
      />

      {value ? (
        <div className="admin-floor-plan-preview">
          {broken ? (
            <div className="admin-floor-plan-broken">
              <FileImage size={28} aria-hidden="true" />
              <span>فایل پلان ذخیره شده، اما پیش‌نمایش در دسترس نیست.</span>
            </div>
          ) : (
            <img
              src={value}
              alt="پیش‌نمایش پلان واقعی ملک"
              loading="lazy"
              decoding="async"
              onError={() => setBroken(true)}
            />
          )}
          <div className="admin-floor-plan-preview-bar">
            <span><CheckCircle2 size={15} /> پلان واقعی ثبت شده</span>
            <button type="button" onClick={() => onChange("")} disabled={uploading}>
              <Trash2 size={15} />
              حذف
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="admin-floor-plan-dropzone"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
        >
          <span className="admin-floor-plan-dropzone-icon">
            {uploading ? <Loader2 size={22} className="admin-floor-plan-spin" /> : <Upload size={22} />}
          </span>
          <span>
            <strong>{uploading ? "در حال آپلود پلان…" : "پلان واقعی را انتخاب کنید"}</strong>
            <small>{uploading ? `پیشرفت آپلود: ${progress.toLocaleString("fa-IR")}%` : "JPG، PNG، WebP یا AVIF · حداکثر ۱۵ مگابایت"}</small>
          </span>
        </button>
      )}

      {value ? (
        <div className="admin-floor-plan-change">
          <button type="button" className="btn-ghost" onClick={() => inputRef.current?.click()} disabled={uploading}>
            <Upload size={15} />
            {uploading ? "در حال آپلود…" : "تعویض پلان"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
