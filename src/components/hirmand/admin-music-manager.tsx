import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  CheckCircle2,
  FileAudio,
  GripVertical,
  Loader2,
  Music2,
  Pause,
  Play,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
} from "lucide-react";
import { toast } from "sonner";
import { uploadErrorMessage, uploadInChunks } from "@/lib/media-upload-client";

type AdminMusicTrack = {
  id: string;
  title: string;
  artist: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  active: boolean;
  position: number;
  createdAt: string;
};

const AUDIO_MIME_TYPES: Record<string, string> = {
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  aac: "audio/aac",
};

function formatSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " کیلوبایت";
  return (bytes / 1024 / 1024).toFixed(1) + " مگابایت";
}

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "۰:۰۰";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function audioMimeType(file: File) {
  const declared = file.type.trim().toLowerCase();
  if (declared === "audio/mp3") return "audio/mpeg";
  if (declared.startsWith("audio/") && Object.values(AUDIO_MIME_TYPES).includes(declared)) {
    return declared;
  }
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return AUDIO_MIME_TYPES[extension] ?? "";
}

function normalizedAudioFile(file: File) {
  const mimeType = audioMimeType(file);
  if (!mimeType) return null;
  if (file.type === mimeType) return { file, mimeType };
  return {
    file: new File([file], file.name, { type: mimeType, lastModified: file.lastModified }),
    mimeType,
  };
}

export function AdminMusicManager() {
  const [tracks, setTracks] = useState<AdminMusicTrack[]>([]);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/music-admin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "list" }),
      });
      if (!response.ok) {
        const failure = (await response.json().catch(() => null)) as
          | { statusMessage?: string; message?: string }
          | null;
        throw new Error(failure?.statusMessage || failure?.message || "بارگذاری آهنگ‌ها انجام نشد.");
      }
      const data = (await response.json()) as { tracks?: AdminMusicTrack[] };
      setTracks(Array.isArray(data.tracks) ? data.tracks : []);
    } catch (error) {
      toast.error(uploadErrorMessage(error, "بارگذاری آهنگ‌ها انجام نشد."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
    };
  }, [load]);

  function stopAudio() {
    audioRef.current?.pause();
    audioRef.current = null;
    setPlayingId(null);
    setCurrentTime(0);
    setDuration(0);
  }

  function playTrack(track: AdminMusicTrack) {
    if (playingId === track.id) {
      const audio = audioRef.current;
      if (audio?.paused) {
        void audio.play().catch(() => toast.error("این فایل صوتی در مرورگر قابل پخش نیست."));
      } else {
        audio?.pause();
      }
      return;
    }

    stopAudio();

    const candidates = [
      track.url,
      `/api/music/file/${encodeURIComponent(track.id)}`,
    ].filter((value, index, list) => Boolean(value) && list.indexOf(value) === index);

    let sourceIndex = 0;
    const audio = new Audio();
    audio.muted = muted;
    audio.preload = "metadata";

    const loadSource = (index: number) => {
      const source = candidates[index];
      if (!source) {
        stopAudio();
        toast.error("این فایل موسیقی قابل دریافت یا پخش نیست.");
        return;
      }
      sourceIndex = index;
      audio.src = source;
      audio.load();
      void audio.play().catch(() => {
        if (sourceIndex + 1 < candidates.length) loadSource(sourceIndex + 1);
        else {
          audio.pause();
          toast.error("این فایل موسیقی قابل پخش نیست.");
        }
      });
    };

    audio.onplay = () => setPlayingId(track.id);
    audio.onpause = () => setPlayingId((id) => (id === track.id ? null : id));
    audio.onloadedmetadata = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    };
    audio.ontimeupdate = () => setCurrentTime(audio.currentTime);
    audio.onended = stopAudio;
    audio.onerror = () => {
      if (sourceIndex + 1 < candidates.length) loadSource(sourceIndex + 1);
      else stopAudio();
    };

    audioRef.current = audio;
    loadSource(0);
  }

  function seek(value: number) {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(duration) || duration <= 0) return;
    audio.currentTime = Math.max(0, Math.min(duration, value));
    setCurrentTime(audio.currentTime);
  }

  async function uploadTrack(event: FormEvent) {
    event.preventDefault();

    if (!file) {
      toast.error("یک فایل صوتی انتخاب کنید.");
      return;
    }
    if (!title.trim()) {
      toast.error("عنوان آهنگ را وارد کنید.");
      return;
    }

    const normalized = normalizedAudioFile(file);
    if (!normalized) {
      toast.error("فرمت فایل صوتی پشتیبانی نمی‌شود. MP3، OGG، WAV، M4A یا AAC انتخاب کنید.");
      return;
    }

    setBusy(true);
    setUploadProgress(0);
    setStage("در حال آماده‌سازی…");

    const controller = new AbortController();

    try {
      const result = await uploadInChunks({
        endpoint: "/api/music-upload",
        file: normalized.file,
        contentType: normalized.mimeType,
        payload: { title: title.trim(), artist: artist.trim() },
        signal: controller.signal,
        rejectedMessage: "فایل انتخاب‌شده برای آپلود پذیرفته نشد.",
        onProgress: (percentage) => {
          setUploadProgress(percentage);
          setStage(percentage >= 100 ? "در حال پردازش فایل…" : `در حال آپلود… ${percentage}%`);
        },
      });

      const track = result.response.track as AdminMusicTrack | undefined;
      if (!track) throw new Error("ثبت آهنگ در کتابخانه انجام نشد.");

      setTracks((prev) => [...prev, track]);
      setTitle("");
      setArtist("");
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";

      toast.success("آهنگ آپلود و به فهرست سایت اضافه شد.");
    } catch (error) {
      toast.error(uploadErrorMessage(error, "آپلود آهنگ انجام نشد."));
    } finally {
      setBusy(false);
      setUploadProgress(0);
      setStage("");
    }
  }

  /** Rewrites the playlist order on the server from the locally arranged list. */
  async function persistOrder(next: AdminMusicTrack[]) {
    setSavingOrder(true);
    try {
      const response = await fetch("/api/music-admin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "reorder", ids: next.map((track) => track.id) }),
      });
      const data = (await response.json().catch(() => null)) as
        | { tracks?: AdminMusicTrack[]; statusMessage?: string; message?: string }
        | null;

      if (!response.ok || !Array.isArray(data?.tracks)) {
        throw new Error(data?.statusMessage || data?.message || "ثبت ترتیب آهنگ‌ها انجام نشد.");
      }
      setTracks(data.tracks);
    } catch (error) {
      toast.error(uploadErrorMessage(error, "ثبت ترتیب آهنگ‌ها انجام نشد."));
      await load();
    } finally {
      setSavingOrder(false);
    }
  }

  function moveTrack(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    if (fromIndex >= tracks.length || toIndex >= tracks.length) return;

    const next = [...tracks];
    const [moved] = next.splice(fromIndex, 1);
    if (!moved) return;
    next.splice(toIndex, 0, moved);

    setTracks(next);
    void persistOrder(next);
  }

  function moveTrackById(id: string, direction: -1 | 1) {
    const fromIndex = tracks.findIndex((track) => track.id === id);
    if (fromIndex < 0) return;
    moveTrack(fromIndex, fromIndex + direction);
  }

  async function action(id: string, actionName: "toggle" | "delete", active?: boolean) {
    if (actionName === "delete" && !confirm("این آهنگ از فهرست سایت حذف شود؟")) return;

    try {
      const response = await fetch("/api/music-admin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: actionName, id, active }),
      });
      const data = (await response.json().catch(() => null)) as
        | { statusMessage?: string; message?: string }
        | null;

      if (!response.ok) {
        throw new Error(data?.statusMessage || data?.message || "عملیات انجام نشد.");
      }

      if (actionName === "delete") {
        setTracks((prev) => prev.filter((item) => item.id !== id));
        if (playingId === id) stopAudio();
        toast.success("آهنگ حذف شد.");
      } else {
        setTracks((prev) =>
          prev.map((item) => (item.id === id ? { ...item, active: active === true } : item)),
        );
        toast.success(active ? "آهنگ در سایت فعال شد." : "آهنگ از پخش سایت خارج شد.");
      }
    } catch (error) {
      toast.error(uploadErrorMessage(error, "عملیات انجام نشد."));
    }
  }

  const activeCount = tracks.filter((track) => track.active).length;
  const totalBytes = tracks.reduce((sum, track) => sum + (track.sizeBytes || 0), 0);

  return (
    <div className="admin-music-manager">
      <style>{MUSIC_ADMIN_CSS}</style>

      <section className="admin-section">
        <div className="admin-music-head">
          <div>
            <span className="kicker">کتابخانه موسیقی</span>
            <h2>آپلود آهنگ برای پلیر سایت</h2>
            <p>
              فایل صوتی را انتخاب کن؛ آپلود به‌صورت قطعه‌قطعه انجام می‌شود، درصد واقعی
              پیشرفت را می‌بینی و فایل بلافاصله در پلیر سایت قابل پخش است.
            </p>
          </div>
          <div className="admin-music-summary">
            <span>
              <strong>{activeCount.toLocaleString("fa-IR")}</strong> فعال
              <small> از {tracks.length.toLocaleString("fa-IR")} آهنگ</small>
            </span>
            <span>
              <strong>{formatSize(totalBytes)}</strong>
              <small>حجم کتابخانه</small>
            </span>
          </div>
        </div>

        <form className="admin-music-upload" onSubmit={uploadTrack}>
          <label className="field">
            <span>عنوان آهنگ</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={160}
              placeholder="مثلاً شب‌های اصفهان"
            />
          </label>

          <label className="field">
            <span>خواننده / هنرمند</span>
            <input
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              maxLength={120}
              placeholder="نام خواننده"
            />
          </label>

          <label className="admin-music-file">
            <span>فایل صوتی</span>
            <input
              ref={inputRef}
              id="admin-music-file"
              type="file"
              accept=".mp3,.ogg,.oga,.wav,.m4a,.aac,audio/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <span className={file ? "admin-music-file-card is-selected" : "admin-music-file-card"}>
              <span className="admin-music-file-icon">
                <FileAudio size={18} />
              </span>
              <span className="admin-music-file-copy">
                <strong>{file ? file.name : "انتخاب فایل صوتی"}</strong>
                <small>
                  {file
                    ? `${formatSize(file.size)} · ${audioMimeType(file) || "فرمت نامشخص"}`
                    : "MP3 / OGG / WAV / M4A / AAC · حداکثر ۳۲ مگابایت"}
                </small>
              </span>
              <Upload size={16} />
            </span>
          </label>

          {busy ? (
            <div className="admin-music-upload-progress" role="status">
              <div className="admin-music-upload-bar">
                <span style={{ width: uploadProgress + "%" }} />
              </div>
              <small>{stage || "در حال آپلود…"}</small>
            </div>
          ) : null}

          <button type="submit" className="btn-gold" disabled={busy || !file}>
            {busy ? <Loader2 size={16} className="admin-spin" /> : <Upload size={16} />}
            {busy ? "در حال آپلود…" : "آپلود و انتشار آهنگ"}
          </button>
        </form>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-head">
          <div>              <span className="kicker">فهرست پخش</span>
            <h2>
              {tracks.length.toLocaleString("fa-IR")} آهنگ
              {savingOrder ? <small className="admin-music-saving"> · در حال ذخیره ترتیب…</small> : null}
            </h2>
          </div>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setMuted((value) => !value)}
          >
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            {muted ? "بی‌صدا" : "صدا"}
          </button>
        </div>

        {!loading && tracks.length > 0 ? (
          <p className="admin-music-hint">
            ترتیب همین فهرست، ترتیب پخش در سایت است. با دستگیره‌ی کنار هر ردیف آن را
            بکش، یا روی دستگیره کلیدهای بالا/پایین را بزن.
          </p>
        ) : null}

        {loading ? (
          <div className="admin-empty">
            <Loader2 size={24} className="admin-spin" />
            <strong>در حال بارگذاری…</strong>
          </div>
        ) : tracks.length === 0 ? (
          <div className="admin-empty">
            <Music2 size={30} />
            <strong>هنوز آهنگی اضافه نشده</strong>
            <p>اولین آهنگ را از فرم بالا آپلود کن.</p>
          </div>
        ) : (
          <div className="admin-music-list">
            {tracks.map((track, index) => {
              const playing = playingId === track.id;
              const rowClass = [
                "admin-music-row",
                playing ? "is-playing" : "",
                draggingId === track.id ? "is-dragging" : "",
                dropTargetId === track.id ? "is-drop-target" : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <article
                  key={track.id}
                  className={rowClass}
                  onDragOver={(event) => {
                    if (!draggingId || draggingId === track.id) return;
                    event.preventDefault();
                    setDropTargetId(track.id);
                  }}
                  onDragLeave={() =>
                    setDropTargetId((current) => (current === track.id ? null : current))
                  }
                  onDrop={(event) => {
                    event.preventDefault();
                    const fromIndex = tracks.findIndex((item) => item.id === draggingId);
                    setDraggingId(null);
                    setDropTargetId(null);
                    if (fromIndex >= 0) moveTrack(fromIndex, index);
                  }}
                >
                  <button
                    type="button"
                    className="admin-music-handle"
                    draggable
                    title="برای جابه‌جایی بکشید (یا با کلیدهای بالا/پایین)"
                    aria-label={
                      "جابه‌جایی «" + track.title + "» — با کلیدهای بالا و پایین یا کشیدن"
                    }
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", track.id);
                      setDraggingId(track.id);
                    }}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setDropTargetId(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowUp") {
                        event.preventDefault();
                        moveTrackById(track.id, -1);
                      } else if (event.key === "ArrowDown") {
                        event.preventDefault();
                        moveTrackById(track.id, 1);
                      }
                    }}
                  >
                    <GripVertical size={15} />
                  </button>

                  <button
                    type="button"
                    className="admin-icon-btn"
                    title={playing ? "توقف" : "پخش آزمایشی"}
                    onClick={() => playTrack(track)}
                  >
                    {playing ? <Pause size={16} /> : <Play size={16} />}
                  </button>

                  <div className="admin-music-main">
                    <div className="admin-music-title-row">
                      <span className="admin-music-index">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <strong>{track.title}</strong>
                      {playing ? (
                        <span className="admin-music-eq" aria-hidden="true">
                          <i />
                          <i />
                          <i />
                        </span>
                      ) : null}
                      <span
                        className={track.active ? "admin-music-active" : "admin-music-inactive"}
                      >
                        {track.active ? "در پخش سایت" : "خاموش"}
                      </span>
                    </div>
                    <span>
                      {track.artist || "بدون نام هنرمند"} · {formatSize(track.sizeBytes)}
                    </span>

                    {playing ? (
                      <div className="admin-music-seek">
                        <span>{formatTime(currentTime)}</span>
                        <input
                          type="range"
                          min={0}
                          max={Math.max(duration, 0.1)}
                          step={0.1}
                          value={Math.min(currentTime, Math.max(duration, 0.1))}
                          onChange={(event) => seek(Number(event.target.value))}
                          aria-label="موقعیت پخش"
                        />
                        <span>{formatTime(duration)}</span>
                      </div>
                    ) : null}
                  </div>

                  <div className="admin-property-actions">
                    <button
                      type="button"
                      className="admin-icon-btn"
                      title={track.active ? "خارج کردن از پخش سایت" : "فعال کردن در سایت"}
                      onClick={() => void action(track.id, "toggle", !track.active)}
                    >
                      {track.active ? <CheckCircle2 size={16} /> : <VolumeX size={16} />}
                    </button>
                    <button
                      type="button"
                      className="admin-icon-btn danger"
                      title="حذف"
                      onClick={() => void action(track.id, "delete")}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

const MUSIC_ADMIN_CSS = `
/* Reads on the light admin surface. */
.admin-music-manager .kicker{color:rgb(0 0 0 / .55)!important;letter-spacing:.02em}
.admin-music-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;flex-wrap:wrap;color:#111315}
.admin-music-summary{display:flex;gap:10px;flex-wrap:wrap}
.admin-music-summary>span{display:flex;flex-direction:column;gap:2px;padding:10px 14px;border:1px solid rgb(0 0 0 / .12);border-radius:14px;background:rgb(0 0 0 / .03);min-width:110px}
.admin-music-summary strong{font-size:1rem;color:#111315}
.admin-music-summary small{color:rgb(0 0 0 / .58);font-size:.7rem}
.admin-music-file-card{display:flex;align-items:center;gap:10px;min-height:62px;padding:10px 14px;border:1px dashed rgb(0 0 0 / .22);border-radius:14px;background:rgb(0 0 0 / .02);cursor:pointer;transition:border-color .15s,background .15s;color:#111315}
.admin-music-file-card:hover{border-color:rgba(183,123,72,.55);background:rgb(0 0 0 / .045)}
.admin-music-file-card.is-selected{border-style:solid;border-color:#111315;background:rgb(0 0 0 / .06)}
.admin-music-file-icon{display:grid;place-items:center;width:36px;height:36px;border-radius:11px;background:rgb(0 0 0 / .06);flex:0 0 auto}
.admin-music-file-copy{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1}
.admin-music-file-copy strong{font-size:.85rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#111315}
.admin-music-file-copy small{color:rgb(0 0 0 / .58);font-size:.72rem}
.admin-music-upload-progress{grid-column:1/-1;display:flex;flex-direction:column;gap:6px}
.admin-music-upload-bar{height:6px;border-radius:999px;background:rgb(0 0 0 / .1);overflow:hidden}
.admin-music-upload-bar span{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#111315,#4a4f55);transition:width .18s linear}
.admin-music-upload-progress small{color:rgb(0 0 0 / .64);font-size:.74rem}
.admin-music-hint{margin:0;padding:12px 20px;border-bottom:1px solid rgb(0 0 0 / .07);color:rgb(0 0 0 / .58);font-size:.76rem;line-height:1.9}
.admin-music-saving{color:rgb(0 0 0 / .5);font-size:.7rem;font-weight:600}
/* The first track is the drag handle and the second the EQ bars. The handle's
   column is 44px, not 26px: a 26px column clipped the 44px button and left a
   tap target well under the 44px the rest of the panel holds to. */
.admin-music-row{grid-template-columns:44px 44px minmax(0,1fr) auto!important}
.admin-music-row.is-playing{background:rgb(0 0 0 / .035)}
.admin-music-row.is-dragging{opacity:.45}
.admin-music-row.is-drop-target{box-shadow:inset 0 2px 0 #111315;background:rgb(0 0 0 / .04)}
.admin-music-handle{display:grid;place-items:center;width:44px;height:44px;padding:0;border:0;border-radius:8px;background:transparent;color:rgb(0 0 0 / .35);cursor:grab}
.admin-music-handle:hover{color:#111315;background:rgb(0 0 0 / .05)}
.admin-music-handle:active{cursor:grabbing}
.admin-music-handle:focus-visible{outline:2px solid #111315;outline-offset:2px}
@media (max-width:640px){
  .admin-music-row{grid-template-columns:44px 40px minmax(0,1fr)!important}
  .admin-music-row>.admin-property-actions{grid-column:3;justify-content:flex-start;padding-top:6px}
}
.admin-music-index{color:rgb(0 0 0 / .45);font-size:.7rem;font-variant-numeric:tabular-nums}
.admin-music-eq{display:inline-flex;align-items:flex-end;gap:2px;height:14px}
.admin-music-eq i{width:3px;border-radius:2px;background:#111315;animation:admin-music-eq 1s ease-in-out infinite}
.admin-music-eq i:nth-child(1){height:60%;animation-delay:-.2s}
.admin-music-eq i:nth-child(2){height:100%}
.admin-music-eq i:nth-child(3){height:45%;animation-delay:-.45s}
@keyframes admin-music-eq{0%,100%{transform:scaleY(.4)}50%{transform:scaleY(1)}}
.admin-music-seek{display:grid;grid-template-columns:38px minmax(0,1fr) 38px;align-items:center;gap:8px;margin-top:8px}
.admin-music-seek span{color:rgb(0 0 0 / .5);font-size:.68rem;font-variant-numeric:tabular-nums}
.admin-music-seek input{width:100%;accent-color:#111315}
.admin-music-active,.admin-music-inactive{display:inline-flex;flex-shrink:0;padding:2px 8px;border-radius:999px;font-size:.68rem;font-weight:700;border:1px solid rgb(0 0 0 / .12)}
.admin-music-active{background:#111315;color:#f7f5ef}
.admin-music-inactive{background:rgb(0 0 0 / .05);color:rgb(0 0 0 / .55)}
@media (prefers-reduced-motion:reduce){.admin-music-eq i{animation:none}}

/* Admin 3.0 theme override */
.admin-music-manager{color:#122333!important}.admin-music-manager .kicker{color:#8a5e14!important}
.admin-music-head,.admin-music-summary>span,.admin-music-file-card{color:#122333!important}
.admin-music-summary>span,.admin-music-file-card{background:#fff!important;border-color:#d9e1e8!important}
.admin-music-summary>span{background:#f8fafc!important}.admin-music-summary strong,.admin-music-file-copy strong{color:#122333!important}.admin-music-summary small,.admin-music-file-copy small,.admin-music-hint,.admin-music-saving,.admin-music-seek span{color:#66717d!important}
.admin-music-file-card:hover{background:#fffaf2!important;border-color:#d8bc8c!important}.admin-music-file-card.is-selected{background:#fffaf2!important;border-color:#c08a2a!important}
.admin-music-file-icon{background:#f7efe2!important;color:#8a5e14!important}
.admin-music-upload-bar,.admin-music-progress{background:#e8edf2!important}.admin-music-upload-bar span,.admin-music-progress span{background:linear-gradient(90deg,#8a5e14,#c08a2a)!important}
.admin-music-row{border-color:#e5eaf0!important;background:#fff!important}.admin-music-row.is-playing{background:#fffaf2!important}.admin-music-row.is-drop-target{box-shadow:inset 0 2px 0 #c08a2a!important;background:#fffaf2!important}
.admin-music-handle{color:#8a959f!important}.admin-music-handle:hover{color:#8a5e14!important;background:#f7efe2!important}
.admin-music-index{color:#5f6b74!important}.admin-music-eq i{background:#c08a2a!important}.admin-music-seek input{accent-color:#a96f18!important}
.admin-music-active{background:#eef8f2!important;color:#18794e!important;border-color:#bfe5cc!important}.admin-music-inactive{background:#f2f4f7!important;color:#66717d!important;border-color:#d7dfe6!important}
`;
