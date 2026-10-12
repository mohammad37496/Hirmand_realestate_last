import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  ChevronDown,
  ChevronUp,
  ListMusic,
  Loader2,
  Music2,
  Pause,
  Play,
  Repeat2,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";

type MusicTrack = {
  id?: string;
  title: string;
  artist?: string;
  src: string;
  stream?: string;
  cover?: string;
};

type MusicManifest = {
  autoplay?: boolean;
  tracks: MusicTrack[];
};

const STORAGE_KEY = "hirmand-music-state";

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "۰:۰۰";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function isAutoplayBlocked(error: unknown) {
  return error instanceof DOMException && error.name === "NotAllowedError";
}

function waitForMediaReady(audio: HTMLAudioElement, timeoutMs = 12000): Promise<void> {
  if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) return Promise.resolve();

  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      window.clearTimeout(timer);
      audio.removeEventListener("canplay", onReady);
      audio.removeEventListener("loadeddata", onLoadedData);
      audio.removeEventListener("error", onError);
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const onReady = () => finish(resolve);
    const onLoadedData = () => {
      if (audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) finish(resolve);
    };
    const onError = () => finish(() => reject(new Error("media-load-failed")));
    const timer = window.setTimeout(
      () => finish(() => reject(new Error("media-load-timeout"))),
      timeoutMs,
    );

    audio.addEventListener("canplay", onReady);
    audio.addEventListener("loadeddata", onLoadedData);
    audio.addEventListener("error", onError);
  });
}

/** Source order used when a track's first URL refuses to load. */
function sourceCandidatesFor(track: MusicTrack): string[] {
  return Array.from(
    new Set(
      [
        track.src,
        track.stream,
        track.id ? `/api/music/file/${encodeURIComponent(track.id)}` : "",
      ].filter((value): value is string => Boolean(value && value.trim())),
    ),
  );
}

export function MusicPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const resumeAfterLoadRef = useRef(false);
  const playRequestedRef = useRef(false);
  const sourceCandidatesRef = useRef<string[]>([]);
  const sourceIndexRef = useRef(0);

  const [manifest, setManifest] = useState<MusicManifest>({ tracks: [] });
  const [index, setIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isListOpen, setIsListOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.72);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const tracks = Array.isArray(manifest.tracks) ? manifest.tracks : [];
  const safeIndex = tracks.length ? Math.min(Math.max(index, 0), tracks.length - 1) : 0;
  const currentTrack = tracks[safeIndex] ?? null;

  useEffect(() => {
    if (index !== safeIndex) setIndex(safeIndex);
  }, [index, safeIndex]);

  const progress = useMemo(
    () => (duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0),
    [currentTime, duration],
  );
  const bufferedPercent = useMemo(
    () => (duration > 0 ? Math.min(100, Math.max(progress, (buffered / duration) * 100)) : 0),
    [buffered, duration, progress],
  );

  useEffect(() => {
    let cancelled = false;

    fetch("/api/music", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("music api not found");
        return (await response.json()) as MusicManifest;
      })
      .catch(async () => {
        const response = await fetch("/music/playlist.json", { cache: "no-store" });
        if (!response.ok) throw new Error("music manifest not found");
        return (await response.json()) as MusicManifest;
      })
      .then((next) => {
        if (cancelled) return;
        const safeTracks = Array.isArray(next.tracks)
          ? next.tracks.filter(
              (track) => track && typeof track.src === "string" && track.src.trim(),
            )
          : [];
        setManifest({ autoplay: false, tracks: safeTracks });
      })
      .catch(() => {
        if (!cancelled) setManifest({ autoplay: true, tracks: [] });
      });

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<{
          index: number;
          volume: number;
          muted: boolean;
          shuffle: boolean;
          repeat: boolean;
          expanded: boolean;
          hidden: boolean;
        }>;
        if (Number.isInteger(saved.index)) setIndex(Math.max(0, saved.index ?? 0));
        if (typeof saved.volume === "number") setVolume(Math.min(1, Math.max(0, saved.volume)));
        if (typeof saved.muted === "boolean") setIsMuted(saved.muted);
        if (typeof saved.shuffle === "boolean") setShuffle(saved.shuffle);
        if (typeof saved.repeat === "boolean") setRepeat(saved.repeat);
        if (typeof saved.expanded === "boolean") setIsExpanded(saved.expanded);
        if (typeof saved.hidden === "boolean") setIsHidden(saved.hidden);
      }
    } catch {
      // Ignore malformed local state.
    }

    return () => {
      cancelled = true;
    };
  }, []);

  const switchToFallbackSource = useCallback(() => {
    const audio = audioRef.current;
    const candidates = sourceCandidatesRef.current;
    const nextIndex = sourceIndexRef.current + 1;

    if (!audio || nextIndex >= candidates.length) return false;

    sourceIndexRef.current = nextIndex;
    setLoadError(false);
    setAutoplayBlocked(false);
    setIsBuffering(true);
    audio.src = candidates[nextIndex]!;
    audio.load();
    return true;
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    if (!currentTrack) return;
    const candidates = sourceCandidatesFor(currentTrack);
    sourceCandidatesRef.current = candidates;
    sourceIndexRef.current = 0;
    setCurrentTime(0);
    setDuration(0);
    setBuffered(0);
    setLoadError(false);
    setAutoplayBlocked(false);

    if (!candidates[0]) {
      setLoadError(true);
      return;
    }

    setIsBuffering(true);
    audio.src = candidates[0];
    audio.load();

    if (!resumeAfterLoadRef.current) {
      setIsBuffering(false);
      return;
    }

    const attemptPlay = () => {
      audio
        .play()
        .then(() => {
          playRequestedRef.current = false;
          setIsPlaying(true);
        })
        .catch(async (error) => {
          if (switchToFallbackSource()) {
            void waitForMediaReady(audio)
              .then(() => audio.play())
              .then(
                () => {
                  playRequestedRef.current = false;
                  setIsPlaying(true);
                },
                (fallbackError) => {
                  playRequestedRef.current = false;
                  setIsPlaying(false);
                  if (isAutoplayBlocked(fallbackError)) setAutoplayBlocked(true);
                  else setLoadError(true);
                },
              );
            return;
          }

          playRequestedRef.current = false;
          setIsPlaying(false);
          if (isAutoplayBlocked(error)) setAutoplayBlocked(true);
          else setLoadError(true);
        });
    };

    if (audio.readyState >= 2) attemptPlay();
    else {
      audio.addEventListener("canplay", attemptPlay, { once: true });
      return () => audio.removeEventListener("canplay", attemptPlay);
    }
  }, [currentTrack, switchToFallbackSource]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = isMuted ? 0 : volume;
    audio.muted = isMuted;
  }, [isMuted, volume]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ index, volume, muted: isMuted, shuffle, repeat, expanded: isExpanded, hidden: isHidden }),
      );
    } catch {
      // Storage can be unavailable in private browsing contexts.
    }
  }, [index, isExpanded, isHidden, isMuted, repeat, shuffle, volume]);

  async function playOrPause() {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    if (!audio.paused) {
      playRequestedRef.current = false;
      audio.pause();
      setIsPlaying(false);
      return;
    }

    playRequestedRef.current = true;
    setIsBuffering(true);

    try {
      await audio.play();
      playRequestedRef.current = false;
      setIsPlaying(true);
      setAutoplayBlocked(false);
      setLoadError(false);
    } catch (error) {
      if (switchToFallbackSource()) {
        try {
          await waitForMediaReady(audio);
          await audio.play();
          playRequestedRef.current = false;
          setIsPlaying(true);
          setAutoplayBlocked(false);
          setLoadError(false);
          return;
        } catch (fallbackError) {
          playRequestedRef.current = false;
          setIsPlaying(false);
          if (isAutoplayBlocked(fallbackError)) setAutoplayBlocked(true);
          else setLoadError(true);
          return;
        }
      }

      playRequestedRef.current = false;
      setIsPlaying(false);
      if (isAutoplayBlocked(error)) setAutoplayBlocked(true);
      else setLoadError(true);
    } finally {
      setIsBuffering(false);
    }
  }

  function selectTrack(nextIndex: number, shouldPlay = true) {
    if (!tracks.length) return;
    const safeIndex = Math.max(0, Math.min(tracks.length - 1, nextIndex));
    setIsListOpen(false);

    if (safeIndex === index && shouldPlay) {
      void playOrPause();
      return;
    }

    resumeAfterLoadRef.current = shouldPlay;
    playRequestedRef.current = shouldPlay;
    setIndex(safeIndex);
  }

  function nextTrack() {
    if (!tracks.length) return;
    const nextIndex = shuffle
      ? Math.floor(Math.random() * tracks.length)
      : (index + 1) % tracks.length;
    selectTrack(nextIndex, true);
  }

  function previousTrack() {
    if (!tracks.length) return;
    const audio = audioRef.current;
    if (audio && audio.currentTime > 4) {
      audio.currentTime = 0;
      return;
    }
    selectTrack((index - 1 + tracks.length) % tracks.length, true);
  }

  function handleEnded() {
    if (repeat && audioRef.current) {
      audioRef.current.currentTime = 0;
      void audioRef.current.play().catch(() => undefined);
      return;
    }
    nextTrack();
  }

  function seek(value: number) {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(duration) || duration <= 0) return;
    audio.currentTime = Math.max(0, Math.min(duration, value));
    setCurrentTime(audio.currentTime);
  }

  function changeVolume(value: number) {
    const safe = Math.max(0, Math.min(1, value));
    setVolume(safe);
    if (safe > 0 && isMuted) setIsMuted(false);
  }

  // Space toggles playback, arrows seek, M mutes — but never while the visitor
  // is typing into a field or interacting with a form control.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName))
      ) {
        return;
      }
      if (event.key === " " || event.code === "Space") {
        event.preventDefault();
        void playOrPause();
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        seek((audioRef.current?.currentTime ?? 0) - 5);
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        seek((audioRef.current?.currentTime ?? 0) + 5);
        return;
      }
      if (event.key.toLowerCase() === "m") {
        setIsMuted((value) => !value);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrack, duration]);

  if (!tracks.length) {
    return (
      <div className="music-player music-player-empty" aria-label="پخش‌کننده موسیقی">
        <Music2 size={17} />
        <span>هنوز موسیقی‌ای اضافه نشده</span>
      </div>
    );
  }

  const statusLabel = autoplayBlocked
    ? "برای شروع موسیقی روی پخش بزنید"
    : loadError
      ? "فایل موسیقی قابل پخش نیست؛ لینک یا فرمت فایل را بررسی کنید."
      : isBuffering
        ? "در حال آماده‌سازی…"
        : null;

  return (
    <>
      <style>{MUSIC_PLAYER_CSS}</style>

      <audio
        ref={audioRef}
        preload="metadata"
        playsInline
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onProgress={(event) => {
          const audio = event.currentTarget;
          if (!audio.buffered.length || !audio.duration) return;
          setBuffered(audio.buffered.end(audio.buffered.length - 1));
        }}
        onLoadedMetadata={(event) => {
          setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0);
          setLoadError(false);
        }}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => setIsBuffering(false)}
        onCanPlay={() => {
          setLoadError(false);
          setIsBuffering(false);
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={handleEnded}
        onError={() => {
          if (playRequestedRef.current && switchToFallbackSource()) {
            const fallback = audioRef.current;
            if (fallback) {
              void waitForMediaReady(fallback)
                .then(() => fallback.play())
                .catch((error) => {
                  playRequestedRef.current = false;
                  setIsPlaying(false);
                  if (isAutoplayBlocked(error)) setAutoplayBlocked(true);
                  else setLoadError(true);
                });
            }
            return;
          }
          setIsPlaying(false);
          setIsBuffering(false);
          setLoadError(true);
        }}
      />

      <button
        type="button"
        className={isHidden ? "music-player-launcher is-visible" : "music-player-launcher"}
        onClick={() => setIsHidden(false)}
        aria-label="نمایش پخش‌کننده موسیقی"
        title="نمایش پخش‌کننده"
      >
        {isPlaying ? <Pause size={18} /> : <Music2 size={18} />}
        <span>{currentTrack.title}</span>
      </button>

      <section
        className={`music-player${isExpanded ? " is-expanded" : ""}${isPlaying ? " is-playing" : ""}${isHidden ? " is-hidden" : ""}`}
        aria-label="پخش‌کننده موسیقی هیرمند"
      >
        <div className="music-player-main">
          <button
            type="button"
            className={`music-cover${isPlaying ? " is-spinning" : ""}`}
            onClick={() => setIsExpanded((value) => !value)}
            aria-label={isExpanded ? "بستن کنترل‌های موسیقی" : "باز کردن کنترل‌های موسیقی"}
            title={isExpanded ? "بستن" : "باز کردن"}
          >
            {currentTrack.cover ? (
              <img src={currentTrack.cover} alt="" />
            ) : (
              <span aria-hidden="true">
                <Music2 size={19} />
              </span>
            )}
          </button>

          <div className="music-meta" aria-live="polite">
            <strong>{currentTrack.title}</strong>
            <span>{currentTrack.artist || "موسیقی هیرمند"}</span>
            {statusLabel ? <small>{statusLabel}</small> : null}
          </div>

          <div className="music-transport" aria-label="کنترل پخش">
            <button type="button" onClick={previousTrack} aria-label="آهنگ قبلی" title="قبلی">
              <SkipBack size={17} />
            </button>
            <button
              type="button"
              className="music-play"
              onClick={() => void playOrPause()}
              aria-label={isPlaying ? "توقف" : "پخش"}
              title={isPlaying ? "توقف" : "پخش"}
            >
              {isBuffering && !isPlaying ? (
                <Loader2 size={18} className="music-spin" />
              ) : isPlaying ? (
                <Pause size={18} />
              ) : (
                <Play size={18} fill="currentColor" />
              )}
            </button>
            <button type="button" onClick={nextTrack} aria-label="آهنگ بعدی" title="بعدی">
              <SkipForward size={17} />
            </button>
          </div>

          <div className="music-compact-actions">
            <span className={`music-live-badge${isPlaying ? " is-live" : ""}`} aria-hidden="true">
              <span className="music-bars">
                <i />
                <i />
                <i />
              </span>
            </span>
            <button
              type="button"
              onClick={() => setIsListOpen((value) => !value)}
              aria-expanded={isListOpen}
              aria-label="فهرست موسیقی"
              title="فهرست"
            >
              <ListMusic size={17} />
            </button>
            <button
              type="button"
              onClick={() => setIsExpanded((value) => !value)}
              aria-expanded={isExpanded}
              aria-label="تنظیمات پخش"
              title="تنظیمات"
            >
              {isExpanded ? <ChevronDown size={17} /> : <ChevronUp size={17} />}
            </button>
            <button
              type="button"
              onClick={() => setIsHidden(true)}
              aria-label="مخفی کردن پخش‌کننده"
              title="مخفی کردن"
            >
              <X size={17} />
            </button>
          </div>
        </div>

        <div className="music-progress-row">
          <span>{formatTime(currentTime)}</span>
          <div className="music-rail">
            <span
              className="music-rail-buffer"
              style={{ width: bufferedPercent + "%" }}
              aria-hidden="true"
            />
            <input
              className="music-progress"
              type="range"
              min="0"
              max={Math.max(duration, 0)}
              step="0.1"
              value={Math.min(currentTime, Math.max(duration, 0))}
              onChange={(event) => seek(Number(event.target.value))}
              aria-label="موقعیت آهنگ"
              style={{ "--music-progress": `${progress}%` } as CSSProperties}
            />
          </div>
          <span>{formatTime(duration)}</span>
        </div>

        {loadError ? (
          <div className="music-player-error" role="alert">
            فایل موسیقی از سرور قابل دریافت نیست؛ دوباره روی «پخش» بزنید.
          </div>
        ) : null}

        {isExpanded ? (
          <div className="music-player-panel">
            <div className="music-secondary-controls">
              <button
                type="button"
                className={shuffle ? "is-active" : ""}
                onClick={() => setShuffle((value) => !value)}
                aria-pressed={shuffle}
                title="پخش تصادفی"
              >
                <Shuffle size={16} />
                <span>تصادفی</span>
              </button>
              <button
                type="button"
                className={repeat ? "is-active" : ""}
                onClick={() => setRepeat((value) => !value)}
                aria-pressed={repeat}
                title="تکرار"
              >
                <Repeat2 size={16} />
                <span>تکرار</span>
              </button>
              <label className="music-volume" title="صدا">
                <button
                  type="button"
                  onClick={() => setIsMuted((value) => !value)}
                  aria-label={isMuted ? "روشن کردن صدا" : "بی‌صدا کردن"}
                >
                  {isMuted || volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={isMuted ? 0 : volume}
                  onChange={(event) => changeVolume(Number(event.target.value))}
                  aria-label="بلندی صدا"
                />
              </label>
              <button
                type="button"
                className={isListOpen ? "is-active" : ""}
                onClick={() => setIsListOpen((value) => !value)}
                aria-pressed={isListOpen}
                title="فهرست آهنگ‌ها"
              >
                <ListMusic size={16} />
                <span>فهرست پخش</span>
              </button>
            </div>
          </div>
        ) : null}

        {isListOpen ? (
          <div className="music-playlist" role="listbox" aria-label="فهرست آهنگ‌ها">
            <div className="music-playlist-head">
              <strong>موسیقی‌های هیرمند</strong>
              <span>{tracks.length.toLocaleString("fa-IR")} آهنگ</span>
            </div>
            <div className="music-playlist-list">
              {tracks.map((track, trackIndex) => (
                <button
                  type="button"
                  key={`${track.src}-${trackIndex}`}
                  className={trackIndex === safeIndex ? "music-track is-active" : "music-track"}
                  onClick={() => selectTrack(trackIndex, true)}
                  role="option"
                  aria-selected={trackIndex === safeIndex}
                >
                  <span className="music-track-number">
                    {String(trackIndex + 1).padStart(2, "0")}
                  </span>
                  <span className="music-track-copy">
                    <strong>{track.title}</strong>
                    <small>{track.artist || "هیرمند"}</small>
                  </span>
                  {trackIndex === index && isPlaying ? (
                    <span className="music-bars" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                  ) : (
                    <Play size={13} className="music-track-play" aria-hidden="true" />
                  )}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </>
  );
}

const MUSIC_PLAYER_CSS = `
.music-player-launcher{position:fixed;inset-inline-end:18px;bottom:max(18px,env(safe-area-inset-bottom));z-index:91;display:none;align-items:center;gap:9px;max-width:min(360px,calc(100vw - 36px));min-height:48px;padding:8px 14px;border:1px solid rgba(255,255,255,.12);border-radius:999px;background:rgba(18,26,39,.92);color:#f6f3ea;box-shadow:0 16px 40px rgba(0,0,0,.26);backdrop-filter:blur(18px);cursor:pointer;font-weight:700}.music-player-launcher.is-visible{display:inline-flex}.music-player-launcher span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.music-player.is-hidden{display:none!important}@media(max-width:680px){.music-player-launcher{inset-inline-end:10px;max-width:calc(100vw - 20px);min-height:46px;padding-inline:12px}}
.music-player .music-rail{position:relative;display:flex;align-items:center;min-width:0}
.music-player .music-rail-buffer{position:absolute;inset-inline-start:0;top:50%;height:4px;border-radius:999px;background:rgba(255,255,255,.22);transform:translateY(-50%);pointer-events:none}
.music-player .music-rail .music-progress{position:relative;z-index:1;width:100%;background:transparent}
.music-player .music-rail .music-progress::-webkit-slider-runnable-track{background:linear-gradient(90deg,#c89461 0 var(--music-progress,0%),transparent var(--music-progress,0%) 100%)!important}
.music-player .music-rail .music-progress::-moz-range-track{background:transparent!important}
.music-player .music-rail .music-progress::-webkit-slider-thumb{width:13px;height:13px;border-radius:50%;background:#f6e3cb;border:2px solid #b87945;box-shadow:0 2px 6px rgba(0,0,0,.35);-webkit-appearance:none;appearance:none;margin-top:-4.5px}
.music-player .music-rail .music-progress::-moz-range-thumb{width:13px;height:13px;border-radius:50%;background:#f6e3cb;border:2px solid #b87945}
.music-player .music-spin{animation:music-player-spin 1s linear infinite}
@keyframes music-player-spin{to{transform:rotate(360deg)}}
.music-player .music-cover.is-spinning img,
.music-player .music-cover.is-spinning>span{animation:music-cover-pulse 2.4s ease-in-out infinite}
@keyframes music-cover-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
.music-player .music-bars{display:inline-flex;align-items:flex-end;gap:2px;height:15px}
.music-player .music-bars i{width:3px;border-radius:2px;background:#e1ba8b}
.music-player.is-playing .music-bars i{animation:music-bars 1s ease-in-out infinite}
.music-player .music-bars i:nth-child(1){height:55%;animation-delay:-.25s}
.music-player .music-bars i:nth-child(2){height:100%}
.music-player .music-bars i:nth-child(3){height:42%;animation-delay:-.5s}
@keyframes music-bars{0%,100%{transform:scaleY(.35)}50%{transform:scaleY(1)}}
.music-player .music-live-badge{display:none;align-items:center;justify-content:center;width:35px;height:35px;border-radius:11px;border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.05);opacity:.45}
.music-player .music-live-badge.is-live{display:inline-flex;opacity:1;border-color:rgba(200,148,97,.34);background:rgba(200,148,97,.12)}
.music-player .music-track-play{color:rgba(23,32,51,.35);justify-self:center}
@media (prefers-reduced-motion:reduce){
  .music-player .music-bars i,
  .music-player .music-cover.is-spinning img,
  .music-player .music-cover.is-spinning>span{animation:none!important}
}
`;
