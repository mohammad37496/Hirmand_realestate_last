import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import {
  ChevronDown,
  ListMusic,
  LoaderCircle,
  Music2,
  Pause,
  Play,
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
  const pathname = useLocation({ select: (location) => location.pathname });
  const audioRef = useRef<HTMLAudioElement>(null);
  const [tracks, setTracks] = useState<PublicTrack[]>([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [muted, setMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState("");

  const loadTracks = useCallback(async () => {
    try {
      const response = await fetch("/api/music", { headers: { accept: "application/json" } });
      if (!response.ok) throw new Error("فهرست موسیقی دریافت نشد.");
      const data = (await response.json()) as { tracks?: PublicTrack[] };
      const next = Array.isArray(data.tracks)
        ? data.tracks.filter((track) => track.id && (track.stream || track.src))
        : [];
      setTracks(next);
      setIndex((current) => Math.min(current, Math.max(0, next.length - 1)));
    } catch {
      setError("دریافت فهرست موسیقی ممکن نشد.");
    } finally {
      setLoading(false);
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

  const activeTrack = tracks[index];
  const source = activeTrack?.stream || (activeTrack ? `/api/music/file/${encodeURIComponent(activeTrack.id)}` : "");

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !source) return;
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
    if (audioRef.current) audioRef.current.muted = muted;
  }, [muted]);

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

  const changeTrack = (step: number) => {
    if (!tracks.length) return;
    setIndex((current) => (current + step + tracks.length) % tracks.length);
    setPlaying(true);
  };

  if (pathname.startsWith("/admin")) return null;

  return (
    <aside className={`music-player music-player-float${tracks.length ? "" : " music-player-empty"}${expanded ? " is-expanded" : ""}`} aria-label="پخش موسیقی هیرمند">
      <audio
        ref={audioRef}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
        onEnded={() => tracks.length > 1 ? changeTrack(1) : setPlaying(false)}
        onError={() => { if (activeTrack) setError("دریافت فایل صوتی ممکن نشد. اتصال سایت یا فایل را بررسی کنید."); }}
      />
      {tracks.length === 0 ? (
        <div className="music-player-empty-copy" aria-live="polite">
          <Music2 size={18} /> {loading ? "در حال بارگذاری موسیقی…" : "به‌زودی با موسیقی هیرمند"}
        </div>
      ) : (
        <>
          <div className="music-player-float-head">
            <span className="music-player-brand-mark"><Music2 size={18} /></span>
            <span className="music-player-brand-copy"><strong>موسیقی هیرمند</strong><small>{playing ? "در حال پخش" : "همراه لحظه‌های شما"}</small></span>
            <button type="button" className="music-player-utility" onClick={() => setExpanded((value) => !value)} aria-label={expanded ? "بستن فهرست" : "نمایش فهرست موسیقی"}>
              {expanded ? <ChevronDown size={17} /> : <ListMusic size={17} />}
            </button>
            <button type="button" className="music-player-utility music-player-hide" onClick={() => setExpanded(false)} aria-label="جمع کردن پلیر"><X size={15} /></button>
          </div>
          <div className="music-player-float-track">
            <span className={`music-player-disc${playing ? " is-spinning" : ""}`}><Music2 size={20} /></span>
            <span className="music-player-float-meta"><strong title={activeTrack?.title}>{activeTrack?.title || "موسیقی هیرمند"}</strong><small>{activeTrack?.artist || "املاک هیرمند"}</small></span>
            <div className="music-player-float-controls">
              <button type="button" onClick={() => changeTrack(-1)} aria-label="آهنگ قبلی" disabled={tracks.length < 2}><SkipForward size={17} /></button>
              <button type="button" className="music-player-float-play" onClick={togglePlayback} aria-label={playing ? "مکث" : "پخش"}>
                {loading ? <LoaderCircle size={19} className="music-player-loader" /> : playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}
              </button>
              <button type="button" onClick={() => changeTrack(1)} aria-label="آهنگ بعدی" disabled={tracks.length < 2}><SkipBack size={17} /></button>
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
              <div className="music-player-float-playlist-head"><strong>فهرست پخش</strong><span>{tracks.length.toLocaleString("fa-IR")} آهنگ</span></div>
              {tracks.map((track, trackIndex) => (
                <button key={track.id} type="button" className={`music-player-float-item${trackIndex === index ? " is-active" : ""}`} onClick={() => { setIndex(trackIndex); setPlaying(true); }}>
                  <span>{trackIndex === index && playing ? <span className="music-player-eq"><i /><i /><i /></span> : String(trackIndex + 1).padStart(2, "0")}</span>
                  <span><strong>{track.title}</strong><small>{track.artist || "املاک هیرمند"}</small></span>
                  {trackIndex === index && playing ? <Pause size={15} /> : <Play size={15} />}
                </button>
              ))}
              <button type="button" className="music-player-float-volume" onClick={() => setMuted((value) => !value)}>{muted ? <VolumeX size={16} /> : <Volume2 size={16} />}{muted ? "روشن کردن صدا" : "بی‌صدا کردن"}</button>
            </div>
          ) : null}
        </>
      )}
    </aside>
  );
}
