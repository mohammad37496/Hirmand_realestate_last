import { useCallback, useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import {
  ChevronDown,
  ListMusic,
  LoaderCircle,
  Music2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  Square,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

type PublicTrack = {
  id: string;
  title: string;
  artist: string;
  src?: string;
  stream?: string;
  position?: number;
};

function clock(value: number) {
  if (!Number.isFinite(value) || value < 0) return "۰:۰۰";
  return `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, "0")}`;
}

export function SiteMusicPlayer() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const audioRef = useRef<HTMLAudioElement>(null);
  const [tracks, setTracks] = useState<PublicTrack[]>([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.7);
  const [shuffle, setShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<"off" | "all" | "one">("all");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState("");
  const selectedTrackId = useRef<string | null>(null);
  const requestVersion = useRef(0);

  selectedTrackId.current = tracks[index]?.id ?? null;

  const loadTracks = useCallback(async () => {
    const version = ++requestVersion.current;
    try {
      const response = await fetch("/api/music", { headers: { accept: "application/json" } });
      if (!response.ok) throw new Error("فهرست موسیقی دریافت نشد.");
      const data = (await response.json()) as { tracks?: PublicTrack[] };
      const next = Array.isArray(data.tracks)
        ? data.tracks.filter((track) => track && typeof track.id === "string" && track.id && (track.stream || track.src))
        : [];
      if (version !== requestVersion.current) return;
      const previousId = selectedTrackId.current;
      const preservedIndex = previousId ? next.findIndex((track) => track.id === previousId) : -1;
      if (previousId && preservedIndex < 0) setPlaying(false);
      setTracks(next);
      setIndex(preservedIndex >= 0 ? preservedIndex : (current) => Math.min(current, Math.max(0, next.length - 1)));
      if (next.length) setError("");
    } catch {
      if (version === requestVersion.current) setError("دریافت فهرست موسیقی ممکن نشد.");
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTracks();
    const refresh = () => {
      if (document.visibilityState === "visible") void loadTracks();
    };
    const audio = audioRef.current;
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      audio?.pause();
    };
  }, [loadTracks]);

  useEffect(() => {
    const mobileViewport = window.matchMedia("(max-width: 720px)");
    const isPropertyDetailPage = pathname.startsWith("/properties/") && pathname !== "/properties/";
    setCollapsed(mobileViewport.matches || isPropertyDetailPage);
    setExpanded(false);
    const syncViewportMode = (event: MediaQueryListEvent) => {
      setCollapsed(event.matches || isPropertyDetailPage);
      setExpanded(false);
    };
    mobileViewport.addEventListener("change", syncViewportMode);
    return () => {
      mobileViewport.removeEventListener("change", syncViewportMode);
    };
  }, [pathname]);

  const activeTrack = tracks[index];
  const source = activeTrack?.stream || (activeTrack ? `/api/music/file/${encodeURIComponent(activeTrack.id)}` : "");

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!source) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      setPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      return;
    }
    audio.pause();
    audio.src = source;
    audio.load();
    setCurrentTime(0);
    setDuration(0);
    setError("");
  }, [source]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !source) return;
    if (!playing) {
      audio.pause();
      return;
    }
    void audio.play().catch(() => {
      setPlaying(false);
      setError("برای شروع پخش، دکمهٔ پخش را لمس کنید.");
    });
  }, [playing, source]);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.muted = muted;
    audioRef.current.volume = volume;
  }, [muted, volume]);

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio || !activeTrack) return;
    setError("");
    if (audio.paused) {
      void audio.play().then(() => setPlaying(true)).catch(() => {
        setPlaying(false);
        setError("این آهنگ در حال حاضر قابل پخش نیست.");
      });
    } else {
      audio.pause();
      setPlaying(false);
    }
  };

  const stopPlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setCurrentTime(0);
    setPlaying(false);
  };

  const closePlaylist = () => {
    setExpanded(false);
    if (window.matchMedia("(max-width: 720px)").matches) setCollapsed(true);
  };

  const changeTrack = (step: number) => {
    if (!tracks.length) return;
    setIndex((current) => {
      if (shuffle && step > 0 && tracks.length > 1) {
        const choices = tracks.map((_, i) => i).filter((i) => i !== current);
        return choices[Math.floor(Math.random() * choices.length)] ?? current;
      }
      return (current + step + tracks.length) % tracks.length;
    });
    setPlaying(true);
  };

  const handleTrackEnded = () => {
    if ((repeatMode === "one" || (tracks.length === 1 && repeatMode === "all")) && audioRef.current) {
      audioRef.current.currentTime = 0;
      void audioRef.current.play().catch(() => setPlaying(false));
      return;
    }
    if (index < tracks.length - 1 || repeatMode === "all" || (shuffle && tracks.length > 1)) {
      changeTrack(1);
      return;
    }
    setPlaying(false);
  };

  const cycleRepeatMode = () => {
    setRepeatMode((mode) => mode === "all" ? "one" : mode === "one" ? "off" : "all");
  };

  return (
    <aside id="hirmand-site-music-player" className={`music-player-float${tracks.length ? "" : " music-player-float-empty"}${expanded ? " is-expanded" : ""}${collapsed ? " is-collapsed" : ""}`} aria-label="پخش موسیقی هیرمند">
      <audio
        ref={audioRef}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
        onPause={() => setPlaying(false)}
        onEnded={handleTrackEnded}
        onError={() => { if (activeTrack) { setPlaying(false); setError("دریافت فایل صوتی ممکن نشد. اتصال سایت یا فایل را بررسی کنید."); } }}
      />
      <button
        type="button"
        className="music-player-restore"
        onClick={() => { setCollapsed(false); if (window.matchMedia("(max-width: 720px)").matches) setExpanded(true); }}
        aria-label="باز کردن پلیر موسیقی"
      >
        <Music2 size={18} />
        <strong>موسیقی هیرمند</strong>
        {playing ? <Pause size={15} /> : <Play size={15} />}
      </button>
      <div className="music-player-full-content">
      {tracks.length === 0 ? (
        <div className="music-player-empty-copy" aria-live="polite">
          <Music2 size={18} /> {loading ? "در حال بارگذاری موسیقی…" : error || "به‌زودی با موسیقی هیرمند"}
          {expanded ? <button type="button" className="music-player-utility" onClick={closePlaylist} aria-label="بستن پنل موسیقی"><X size={15} /></button> : null}
        </div>
      ) : (
        <>
          <div className="music-player-float-head">
            <span className="music-player-brand-mark"><Music2 size={18} /></span>
            <span className="music-player-brand-copy"><strong>موسیقی هیرمند</strong><small>{playing ? "در حال پخش" : "همراه لحظه‌های شما"}</small></span>
            <button type="button" className="music-player-utility" onClick={() => expanded ? closePlaylist() : setExpanded(true)} aria-label={expanded ? "بستن فهرست" : "نمایش فهرست موسیقی"}>
              {expanded ? <ChevronDown size={17} /> : <ListMusic size={17} />}
            </button>
            <button type="button" className="music-player-utility music-player-hide" onClick={() => { setExpanded(false); setCollapsed(true); }} aria-label="جمع کردن پلیر"><X size={15} /></button>
          </div>
          <div className="music-player-float-track">
            <span className={`music-player-disc${playing ? " is-spinning" : ""}`}><Music2 size={20} /></span>
            <span className="music-player-float-meta"><strong title={activeTrack?.title}>{activeTrack?.title || "موسیقی هیرمند"}</strong><small>{activeTrack?.artist || "املاک هیرمند"}</small></span>
            <div className="music-player-float-controls">
              <button type="button" onClick={() => changeTrack(-1)} aria-label="آهنگ قبلی" disabled={tracks.length < 2}><SkipBack size={17} /></button>
              <button type="button" className="music-player-float-play" onClick={togglePlayback} aria-label={playing ? "مکث" : "پخش"}>
                {loading ? <LoaderCircle size={19} className="music-player-loader" /> : playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}
              </button>
              <button type="button" onClick={stopPlayback} aria-label="توقف آهنگ"><Square size={15} fill="currentColor" /></button>
              <button type="button" onClick={() => changeTrack(1)} aria-label="آهنگ بعدی" disabled={tracks.length < 2}><SkipForward size={17} /></button>
            </div>
          </div>
          <div className="music-player-float-progress">
            <span>{clock(currentTime)}</span>
            <input aria-label="موقعیت آهنگ" type="range" min={0} max={Math.max(duration, 0.1)} step={0.1} value={Math.min(currentTime, Math.max(duration, 0.1))} style={{ "--music-progress": `${duration ? currentTime / duration * 100 : 0}%` } as React.CSSProperties} onChange={(event) => { if (audioRef.current) audioRef.current.currentTime = Number(event.target.value); }} />
            <span>{clock(duration)}</span>
          </div>
          {error ? <p className="music-player-float-error" role="status">{error}</p> : null}
          {expanded ? (
            <div className="music-player-float-playlist">
              <div className="music-player-volume-control">
                <button type="button" className="music-player-volume-toggle" onClick={() => setMuted((value) => !value)} aria-label={muted ? "روشن کردن صدا" : "قطع صدا"} title={muted ? "روشن کردن صدا" : "قطع صدا"}>
                  {muted || volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}
                </button>
                <input aria-label="کم و زیاد کردن صدا" type="range" min={0} max={1} step={0.05} value={muted ? 0 : volume} style={{ "--music-volume": `${(muted ? 0 : volume) * 100}%` } as React.CSSProperties} onChange={(event) => { const next = Number(event.target.value); setVolume(next); setMuted(next === 0); }} />
                <span>{Math.round((muted ? 0 : volume) * 100).toLocaleString("fa-IR")}%</span>
              </div>
              <div className="music-player-options" aria-label="تنظیمات پخش">
                <button type="button" className={shuffle ? "is-active" : ""} onClick={() => setShuffle((value) => !value)} aria-pressed={shuffle} title="پخش تصادفی" aria-label="پخش تصادفی">
                  <Shuffle size={16} /><span>تصادفی</span>
                </button>
                <button type="button" className={repeatMode !== "off" ? "is-active" : ""} onClick={cycleRepeatMode} aria-pressed={repeatMode !== "off"} title={repeatMode === "all" ? "تکرار همه آهنگ‌ها" : repeatMode === "one" ? "تکرار همین آهنگ" : "بدون تکرار"} aria-label={repeatMode === "all" ? "تکرار همه آهنگ‌ها" : repeatMode === "one" ? "تکرار همین آهنگ" : "فعال کردن تکرار"}>
                  {repeatMode === "one" ? <Repeat1 size={16} /> : <Repeat size={16} />}<span>{repeatMode === "all" ? "تکرار همه" : repeatMode === "one" ? "تکرار آهنگ" : "بدون تکرار"}</span>
                </button>
              </div>
              <div className="music-player-float-playlist-head"><strong>انتخاب موسیقی</strong><span>{tracks.length.toLocaleString("fa-IR")} آهنگ</span></div>
              {tracks.map((track, trackIndex) => (
                <button key={track.id} type="button" className={`music-player-float-item${trackIndex === index ? " is-active" : ""}`} onClick={() => { setIndex(trackIndex); setPlaying(true); }}>
                  <span>{trackIndex === index && playing ? <span className="music-player-eq"><i /><i /><i /></span> : String(trackIndex + 1).padStart(2, "0")}</span>
                  <span><strong>{track.title}</strong><small>{track.artist || "املاک هیرمند"}</small></span>
                  {trackIndex === index && playing ? <Pause size={15} /> : <Play size={15} />}
                </button>
              ))}
            </div>
          ) : null}
        </>
      )}
      </div>
    </aside>
  );
}
