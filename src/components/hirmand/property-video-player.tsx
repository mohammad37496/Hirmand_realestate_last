import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import "@/property-video-player.css";

type Quality = "auto" | "480" | "720" | "1080";
type RenditionsResponse = { available?: boolean; renditions?: Record<string, string> };
type NetworkConnection = EventTarget & {
  effectiveType?: string;
  downlink?: number;
  saveData?: boolean;
};

type Props = {
  src: string;
  title: string;
  className?: string;
  preload?: "none" | "metadata" | "auto";
};

const QUALITY_ORDER: Array<Exclude<Quality, "auto">> = ["480", "720", "1080"];

function networkQuality(): Exclude<Quality, "auto"> {
  if (typeof navigator === "undefined") return "720";
  const connection = (navigator as Navigator & { connection?: NetworkConnection }).connection;
  if (!connection) return "720";
  if (connection.saveData) return "480";

  const type = String(connection.effectiveType ?? "").toLowerCase();
  const downlink = Number(connection.downlink) || 0;
  if (type === "slow-2g" || type === "2g" || type === "3g" || downlink < 1.5) return "480";
  if (type === "4g" && downlink >= 5) return "1080";
  if (downlink >= 4) return "1080";
  if (downlink >= 1.5) return "720";
  return "480";
}

function faQuality(quality: string): string {
  return quality.replace("480", "۴۸۰").replace("720", "۷۲۰").replace("1080", "۱۰۸۰");
}

export function PropertyVideoPlayer({ src, title, className = "hd-gallery-video", preload = "metadata" }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const previousPlayback = useRef<{ time: number; wasPlaying: boolean } | null>(null);
  const [quality, setQuality] = useState<Quality>("auto");
  const [renditions, setRenditions] = useState<Partial<Record<Exclude<Quality, "auto">, string>>>({});
  const [autoQuality, setAutoQuality] = useState<Exclude<Quality, "auto">>("720");
  const [playbackUrl, setPlaybackUrl] = useState(src);
  const [networkHint, setNetworkHint] = useState("");

  useEffect(() => {
    let cancelled = false;
    setRenditions({});
    setQuality("auto");
    setAutoQuality(networkQuality());
    setPlaybackUrl(src);
    setNetworkHint("");

    const loadRenditions = async () => {
      try {
        const response = await fetch("/api/property-video-renditions?src=" + encodeURIComponent(src), {
          headers: { accept: "application/json" },
          credentials: "same-origin",
        });
        if (!response.ok) return;
        const payload = await response.json() as RenditionsResponse;
        if (cancelled || !payload.available || !payload.renditions) return;
        const next: Partial<Record<Exclude<Quality, "auto">, string>> = {};
        for (const option of QUALITY_ORDER) {
          const candidate = payload.renditions[option];
          if (typeof candidate === "string" && candidate.trim()) next[option] = candidate;
        }
        if (Object.keys(next).length) {
          setRenditions(next);
          setAutoQuality(networkQuality());
          setPlaybackUrl(next[networkQuality()] ?? next["720"] ?? next["480"] ?? next["1080"] ?? src);
        }
      } catch {
        // Existing video records and transient API errors safely keep the source
        // and browser-native controls without a fake quality selector.
      }
    };
    void loadRenditions();

    return () => {
      cancelled = true;
    };
  }, [src]);

  const currentQuality = quality === "auto" ? autoQuality : quality;
  const targetUrl = useMemo(
    () => quality === "auto"
      ? renditions[autoQuality] ?? src
      : renditions[quality] ?? src,
    [quality, autoQuality, renditions, src],
  );

  const changeQuality = useCallback((next: Quality) => {
    const video = videoRef.current;
    if (video) {
      previousPlayback.current = {
        time: Number.isFinite(video.currentTime) ? video.currentTime : 0,
        wasPlaying: !video.paused && !video.ended,
      };
    }
    setQuality(next);
    if (next === "auto") setAutoQuality(networkQuality());
  }, []);

  useEffect(() => {
    if (targetUrl !== playbackUrl) {
      const video = videoRef.current;
      if (video) {
        previousPlayback.current = {
          time: Number.isFinite(video.currentTime) ? video.currentTime : 0,
          wasPlaying: !video.paused && !video.ended,
        };
      }
      setPlaybackUrl(targetUrl);
    }
  }, [targetUrl, playbackUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const previous = previousPlayback.current;
    if (!previous) return;

    const restorePlayback = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : previous.time;
      video.currentTime = Math.max(0, Math.min(previous.time, duration || previous.time));
      if (previous.wasPlaying) void video.play().catch(() => undefined);
      previousPlayback.current = null;
    };
    video.addEventListener("loadedmetadata", restorePlayback, { once: true });
    return () => video.removeEventListener("loadedmetadata", restorePlayback);
  }, [playbackUrl]);

  useEffect(() => {
    if (quality !== "auto" || !Object.keys(renditions).length || typeof navigator === "undefined") return;
    const connection = (navigator as Navigator & { connection?: NetworkConnection }).connection;
    if (!connection) return;
    const update = () => {
      const next = networkQuality();
      setAutoQuality(next);
      const available = renditions[next] ?? renditions["720"] ?? renditions["480"] ?? renditions["1080"];
      if (available && available !== playbackUrl) {
        const video = videoRef.current;
        if (video) previousPlayback.current = {
          time: Number.isFinite(video.currentTime) ? video.currentTime : 0,
          wasPlaying: !video.paused && !video.ended,
        };
        setNetworkHint("کیفیت خودکار با تغییر سرعت اتصال تنظیم شد");
      }
    };
    connection.addEventListener("change", update);
    return () => connection.removeEventListener("change", update);
  }, [quality, renditions, playbackUrl]);

  const lowerQualityOnStall = useCallback(() => {
    if (quality !== "auto") return;
    const index = QUALITY_ORDER.indexOf(currentQuality);
    if (index <= 0) return;
    const next = QUALITY_ORDER[index - 1]!;
    if (!renditions[next]) return;
    const video = videoRef.current;
    if (video) previousPlayback.current = {
      time: Number.isFinite(video.currentTime) ? video.currentTime : 0,
      wasPlaying: true,
    };
    setAutoQuality(next);
    setNetworkHint("برای پخش روان‌تر، کیفیت کاهش یافت");
  }, [quality, currentQuality, renditions]);

  const hasQualityChoices = QUALITY_ORDER.some((option) => Boolean(renditions[option]));
  return (
    <div className="hd-gallery-video-player">
      <video
        ref={videoRef}
        className={className}
        src={playbackUrl}
        controls
        playsInline
        preload={preload}
        aria-label={title}
        onWaiting={lowerQualityOnStall}
      />
      {hasQualityChoices ? (
        <div className="hd-gallery-quality-bar">
          <label className="hd-gallery-quality-label" htmlFor={undefined}>
            <SlidersHorizontal size={15} aria-hidden="true" />
            <span>کیفیت پخش</span>
          </label>
          <select
            aria-label="انتخاب کیفیت پخش ویدئو"
            value={quality}
            onChange={(event) => changeQuality(event.currentTarget.value as Quality)}
          >
            <option value="auto">اتوماتیک (بر اساس سرعت اینترنت)</option>
            {QUALITY_ORDER.filter((option) => renditions[option]).map((option) => (
              <option value={option} key={option}>{faQuality(option)}p</option>
            ))}
          </select>
          <span className="hd-gallery-quality-current" aria-live="polite">
            {quality === "auto" ? `خودکار · ${faQuality(currentQuality)}p` : `${faQuality(quality)}p`}
          </span>
          {networkHint ? <span className="hd-gallery-quality-hint">{networkHint}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
