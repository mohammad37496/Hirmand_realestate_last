import { useEffect, useState } from "react";
import { HousePlus, X } from "lucide-react";
import "@/pwa-install-prompt.css";

type DeferredInstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const DISMISS_KEY = "hirmand-pwa-install-dismissed-v1";

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}
function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
function dismissedRecently() {
  try {
    const stamp = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return Number.isFinite(stamp) && Date.now() - stamp < 14 * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

export function PwaInstallPrompt() {
  const [deferred, setDeferred] = useState<DeferredInstallEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if (isStandalone() || dismissedRecently() || window.location.pathname.startsWith("/admin")) return;
    const isiOS = isIOS();
    setIos(isiOS);
    if (isiOS) {
      const timer = window.setTimeout(() => setVisible(true), 1800);
      return () => window.clearTimeout(timer);
    }
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as DeferredInstallEvent);
      window.setTimeout(() => setVisible(true), 1200);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const onDisplayModeChange = () => { if (displayMode.matches) setVisible(false); };
    displayMode.addEventListener?.("change", onDisplayModeChange);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      displayMode.removeEventListener?.("change", onDisplayModeChange);
    };
  }, []);

  const close = () => {
    setVisible(false);
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* Storage may be blocked; the prompt simply shows again. */ }
  };
  const install = async () => {
    if (ios) { window.location.href = "/?install=1&platform=ios"; return; }
    if (!deferred) return;
    await deferred.prompt();
    const result = await deferred.userChoice;
    if (result.outcome === "accepted") setVisible(false);
    setDeferred(null);
  };
  if (!visible) return null;
  return <aside className="pwa-install-prompt" role="dialog" aria-label="نصب اپ هیرمند">
    <img src="/pwa/icon-180.png" alt="" width="48" height="48" />
    <div className="pwa-install-prompt-copy">
      <strong>هیرمند را روی گوشی نصب کنید</strong>
      <span>{ios ? "راهنمای افزودن به صفحه اصلی را ببینید." : "دسترسی سریع به فایل‌ها، ذخیره‌ها و جستجو از صفحه اصلی گوشی."}</span>
    </div>
    <button type="button" className="pwa-install-prompt-cta" onClick={() => void install()}><HousePlus size={16} /> {ios ? "راهنمای نصب" : "نصب روی گوشی"}</button>
    <button type="button" className="pwa-install-prompt-close" onClick={close} aria-label="بستن"><X size={17} /></button>
  </aside>;
}
