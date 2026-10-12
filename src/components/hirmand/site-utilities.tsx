import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

export function SiteUtilities() {
  const [progress, setProgress] = useState(0);
  const [showBackTop, setShowBackTop] = useState(false);

  useEffect(() => {
    const update = () => {
      const doc = document.documentElement;
      const max = Math.max(doc.scrollHeight - window.innerHeight, 1);
      const next = Math.min(100, Math.max(0, (window.scrollY / max) * 100));
      setProgress(next);
      setShowBackTop(window.scrollY > 520);
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  function goTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <>
      <div className="site-scroll-progress" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </div>
      <button
        type="button"
        className={`site-back-top${showBackTop ? " is-visible" : ""}`}
        onClick={goTop}
        aria-label="بازگشت به ابتدای صفحه"
        title="بازگشت به بالا"
      >
        <ArrowUp size={18} />
      </button>
    </>
  );
}
