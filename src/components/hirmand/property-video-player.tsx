import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import "@/property-video-player.css";

type Quality = "auto" | "480" | "720" | "1080";
type RenditionsResponse = { available?: boolean; processing?: boolean; renditions?: Record<string, string> };
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
  const [isProcessingQualities, setIsProcessingQualities] = useState(false);
  const [autoQuality, setAutoQuality] = useState<Exclude<Quality, "auto">>("720");
  const [playbackUrl, setPlaybackUrl] = useState(src);
  const [networkHint, setNetworkHint] = useState("");

  useEffect(() => {
    let cancelled = false;
    setRenditions({});
    setIsProcessingQualities(false);
    setQuality("auto");
    setAutoQuality(networkQuality());
    setPlaybackUrl(src);
    setNetworkHint("");

    const loadRenditions = async () => {
      // Large videos finish their upload first; their quality ladder is built in
      // the background. Poll only while the server explicitly reports a job,
      // never for legacy videos without a manifest.
      for (let attempt = 0; attempt < 180 && !cancelled; attempt += 1) {
        try {
          const response = await fetch("/api/property-video-renditions?src=" + encodeURIComponent(src), {
            headers: { accept: "application/json" },
            credentials: "same-origin",
          });
          if (!response.ok) return;
          const payload = await response.json() as RenditionsResponse;
          if (cancelled) return;
          setIsProcessingQualities(payload.processing === true);
          const next: Partial<Record<Exclude<Quality, "auto">, string>> = {};
          if (payload.available && payload.renditions) {
            for (const option of QUALITY_ORDER) {
              const candidate = payload.renditions[option];
              if (typeof candidate === "string" && candidate.trim()) next[option] = candidate;
            }
          }
          if (Object.keys(next).length) {
            setRenditions(next);
            setAutoQuality(networkQuality());
            setPlaybackUrl((current) => current === src
              ? next[networkQuality()] ?? next["720"] ?? next["480"] ?? next["1080"] ?? src
              : current);
          }
          if (!payload.processing) return;
          await new Promise((resolve) => setTimeout(resolve, 5_000));
        } catch {
          // A temporary request failure should not stop a pending quality job;
          // keep the original video playable and retry on the next poll.
          if (cancelled) return;
          await new Promise((resolve) => setTimeout(resolve, 5_000));
        }
      }
    };
    void loadRenditions();

    return () => {
      cancelled = true;
    };
  }, [src]);

  const currentQuality: Exclude<Quality, "auto"> = quality === "auto"
    ? (renditions[autoQuality] ? autoQuality : renditions["720"] ? "720" : renditions["480"] ? "480" : "1080")
    : quality;
  const targetUrl = useMemo(
    () => renditions[currentQuality] ?? src,
    [currentQuality, renditions, src],
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
      <div className="hd-gallery-quality-bar">
          <span className="hd-gallery-quality-label">
            <SlidersHorizontal size={15} aria-hidden="true" />
            <span>کیفیت پخش</span>
          </span>
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
            {quality === "auto"
              ? hasQualityChoices ? `خودکار · ${faQuality(currentQuality)}p` : "خودکار · کیفیت اصلی"
              : `${faQuality(quality)}p`}
          </span>
          {networkHint ? <span className="hd-gallery-quality-hint">{networkHint}</span> : null}
          {isProcessingQualities ? <span className="hd-gallery-quality-hint" role="status">در حال آماده‌سازی کیفیت‌های دیگر؛ پخش ویدئو ادامه دارد…</span> : null}
          {!isProcessingQualities && !hasQualityChoices ? <span className="hd-gallery-quality-hint">فعلاً فقط کیفیت اصلی این ویدئو موجود است.</span> : null}
      </div>
    </div>
  );
}
