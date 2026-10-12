/**
 * Presentation layer of the Divar admin panel: the section stylesheet plus the
 * card-level gallery primitives.
 *
 * Split out of `admin-divar-files.tsx` so the panel file stays about state and
 * workflow instead of carrying ~15 KB of CSS. Pure formatters live in
 * `@/lib/divar-status` so they stay unit-testable.
 */
import { useEffect, useMemo, useState } from "react";
import { BadgeCheck, Image as ImageIcon, Images, ShieldCheck, Sparkles } from "lucide-react";
import { mediaSourceCandidates } from "@/lib/media";
import type { DivarFile } from "@/lib/divar";
import { fa } from "@/lib/divar-status";

export const DIVAR_CSS = `
/* The admin shell renders on a light surface, so this section uses a dark-on-cream palette. */
.divar-wrap{display:flex;flex-direction:column;gap:18px;color:#111315}
.divar-wrap .kicker{color:rgb(0 0 0 / .55)!important;letter-spacing:.02em}
.divar-hero{position:relative;display:flex;justify-content:space-between;gap:20px;align-items:flex-start;padding:24px;border:1px solid rgba(183,123,72,.26);border-radius:20px;background:linear-gradient(135deg,rgba(183,123,72,.10),rgba(0,0,0,.02))}
.divar-hero h2{margin:4px 0 8px;font-size:26px;letter-spacing:-.01em;color:#111315}
.divar-hero p{margin:0;color:rgb(0 0 0 / .62);max-width:720px;line-height:1.9;font-size:.86rem}
.divar-hero-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;align-items:center}
.divar-hero-actions select{min-height:46px;padding:0 12px;border-radius:12px;border:1px solid rgb(0 0 0 / .14);background:#fff;color:#111315;font:inherit}
.divar-stat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(186px,1fr));gap:12px}
.divar-stat{display:flex;gap:12px;align-items:flex-start;padding:16px;border-radius:16px;border:1px solid rgb(0 0 0 / .1);background:#fff}
.divar-stat-icon{display:grid;place-items:center;width:38px;height:38px;flex:0 0 auto;border-radius:12px;background:rgb(0 0 0 / .05)}
.divar-stat small{display:block;color:rgb(0 0 0 / .58);margin-bottom:6px;font-size:.74rem}
.divar-stat strong{font-size:24px;line-height:1.2;font-weight:800;color:#111315}
.divar-stat.is-text strong{font-size:13px;line-height:1.7;font-weight:750}
.divar-stat.accepted .divar-stat-icon{color:#7a5220;background:rgba(183,123,72,.16)}
.divar-stat.imported .divar-stat-icon{color:#17603f;background:rgba(24,122,88,.14)}
.divar-stat.rejected .divar-stat-icon{color:#8f3232;background:rgba(190,70,70,.13)}
.divar-stat.synced .divar-stat-icon{color:#2f3d63;background:rgba(60,80,140,.12)}
.divar-stat.seen .divar-stat-icon{color:#4a4f55;background:rgb(0 0 0 / .06)}
.divar-history{border:1px solid rgb(0 0 0 / .1);border-radius:16px;background:#fff;overflow:hidden}
.divar-history-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;cursor:pointer;border:0;background:transparent;width:100%;font:inherit;text-align:right}
.divar-history-head strong{display:flex;align-items:center;gap:8px;color:#111315;font-size:.9rem}
.divar-history-head small{color:rgb(0 0 0 / .55);font-size:.74rem;line-height:1.8}
.divar-history-body{display:flex;flex-direction:column;gap:8px;padding:0 18px 16px}
.divar-history-empty{margin:0;color:rgb(0 0 0 / .55);font-size:.76rem;line-height:1.9}
.divar-history-row{display:grid;grid-template-columns:104px minmax(0,1fr);gap:12px;align-items:center;padding:11px 13px;border:1px solid rgb(0 0 0 / .09);border-radius:12px;background:rgb(0 0 0 / .02)}
.divar-history-row.is-failed{border-color:#ecd0d0;background:#fff7f7}
.divar-history-row p{margin:2px 0 0;color:rgb(0 0 0 / .6);font-size:.74rem;line-height:1.8}
.divar-history-row strong{display:block;color:#111315;font-size:.78rem}
.divar-history-row time{display:block;margin-top:4px;color:rgb(0 0 0 / .45);font-size:.68rem}
.divar-history-badge{display:inline-flex;align-items:center;justify-content:center;gap:5px;border-radius:999px;padding:5px 10px;font-size:.7rem;font-weight:800}
.divar-history-badge.completed{background:rgba(24,122,88,.13);color:#17603f}
.divar-history-badge.failed{background:rgba(190,70,70,.13);color:#8f3232}
.divar-history-badge.running{background:rgba(60,80,140,.12);color:#2f3d63}
.divar-history-badge.partial{background:rgba(180,112,22,.14);color:#80500d}
.divar-history-row.is-partial{border-color:#ead8bd;background:#fffaf2}
.divar-thumb-fallback{display:grid;place-items:center;width:100%;height:100%;min-height:36px;color:#7b8794;background:#edf1f4}
.divar-toolbar{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;padding:16px 20px;border-bottom:1px solid rgb(0 0 0 / .08)}
.divar-tabs{display:flex;gap:6px;flex-wrap:wrap}
.divar-tab{display:inline-flex;align-items:center;gap:6px;border:1px solid rgb(0 0 0 / .12);background:#fff;color:#111315;border-radius:12px;padding:10px 14px;cursor:pointer;font:inherit;font-size:.82rem;transition:border-color .15s,background .15s,color .15s}
.divar-tab:hover{border-color:rgba(183,123,72,.5)}
.divar-tab.is-active{background:#111315;border-color:#111315;color:#f7f5ef}
.divar-tab b{font-weight:800;color:inherit}
.divar-smart-toolbar{display:flex;gap:12px;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;padding:16px 20px;border-bottom:1px solid rgb(0 0 0 / .08)}
.divar-search-box{display:flex;align-items:center;gap:9px;flex:1 1 260px;min-width:0;min-height:46px;padding:0 14px;border:1px solid rgb(0 0 0 / .14);border-radius:14px;background:#fff;color:rgb(0 0 0 / .55)}
.divar-search-box:focus-within{border-color:#111315}
.divar-search-box input{flex:1;min-width:0;border:0;background:transparent;color:#111315;font:inherit;outline:none}
.divar-search-clear{display:grid;place-items:center;width:30px;height:30px;border:0;border-radius:9px;background:transparent;color:inherit;cursor:pointer}
.divar-search-clear:hover{background:rgb(0 0 0 / .06)}
.divar-filter-group{display:flex;gap:10px;flex-wrap:wrap}
.divar-select-field{display:flex;flex-direction:column;gap:5px}
.divar-select-field>span{color:rgb(0 0 0 / .62);font-size:.68rem}
.divar-select-field select{min-height:44px;max-width:190px;padding:0 10px;border-radius:12px;border:1px solid rgb(0 0 0 / .14);background:#fff;color:#111315;font:inherit;font-size:.82rem}
.divar-toggle{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 14px;border:1px solid rgb(0 0 0 / .14);border-radius:12px;background:#fff;color:#111315;font-size:.82rem;cursor:pointer}
.divar-toggle input{accent-color:#111315}
.divar-toolbar-result{display:flex;align-items:center;gap:7px;flex-wrap:wrap;color:rgb(0 0 0 / .6);font-size:.8rem}
.divar-toolbar-result strong{color:#111315}
.divar-toolbar-result button{min-height:40px;padding:0 8px;border-radius:9px;border:0;background:transparent;color:#7a5220;cursor:pointer;font:inherit;font-size:.78rem;text-decoration:underline}
.divar-toolbar-result button:hover{background:rgb(0 0 0 / .04)}
.divar-toolbar-result button:focus-visible{outline:3px solid rgba(192,138,42,.32);outline-offset:2px}
.divar-bulkbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:12px 20px;border-bottom:1px solid rgba(183,123,72,.3);background:rgba(183,123,72,.08)}
.divar-bulkbar strong{font-size:.82rem;color:#111315}
.divar-bulk-actions{display:flex;gap:8px;flex-wrap:wrap}
.divar-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;padding:18px 20px}
.divar-card{position:relative;display:flex;flex-direction:column;border:1px solid rgb(0 0 0 / .1);border-radius:18px;overflow:hidden;background:#fff;transition:border-color .18s,box-shadow .18s}
.divar-card:hover{border-color:rgba(183,123,72,.45)}
.divar-card.is-selected{border-color:rgba(183,123,72,.55);box-shadow:0 0 0 2px rgba(183,123,72,.22)}
.divar-select{position:absolute;top:12px;inset-inline-start:12px;z-index:2;display:grid;place-items:center;width:32px;height:32px;border:1px solid rgba(255,255,255,.35);border-radius:10px;background:rgba(8,10,12,.72);color:#f4efe4;cursor:pointer}
.divar-select.is-on{background:#e8cd8f;border-color:#e8cd8f;color:#231a08}
.divar-image{position:relative;aspect-ratio:16/10;background:#0f1114;overflow:hidden}
.divar-image img{width:100%;height:100%;object-fit:cover;display:block}
.divar-image-fallback{position:absolute;inset:0;display:grid;place-items:center;color:#6f7276}
.divar-gallery-strip{position:absolute;inset-inline:0;bottom:0;display:flex;gap:6px;padding:8px;background:linear-gradient(to top,rgba(8,10,12,.82),transparent)}
.divar-gallery-thumb{width:44px;height:34px;border-radius:8px;overflow:hidden;border:1px solid rgba(255,255,255,.22);background:#15181c;padding:0;cursor:pointer;opacity:.7;transition:opacity .15s,border-color .15s}
.divar-gallery-thumb:hover{opacity:1}
.divar-gallery-thumb.is-active{opacity:1;border-color:#e8cd8f}
.divar-gallery-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.divar-gallery-more{display:grid;place-items:center;min-width:44px;height:34px;padding:0 8px;border-radius:8px;border:1px dashed rgba(255,255,255,.25);color:#f0e6d4;font-size:.7rem;background:rgba(8,10,12,.6)}
.divar-status{position:absolute;top:10px;inset-inline-end:10px;display:inline-flex;align-items:center;gap:5px;border-radius:999px;padding:6px 10px;background:rgba(8,10,12,.76);font-size:.7rem;font-weight:700}
.divar-status.imported{color:#9fe0b6}
.divar-status.accepted{color:#e8cd8f}
.divar-status.rejected{color:#ffb4b4}
.divar-media-badge{position:absolute;bottom:52px;inset-inline-start:10px;display:inline-flex;align-items:center;gap:5px;border-radius:999px;padding:6px 10px;background:rgba(8,10,12,.76);font-size:.7rem;color:#e7e3da}
.divar-body{display:flex;flex-direction:column;gap:11px;padding:16px}
.divar-title{margin:0;font-size:17px;line-height:1.7;color:#111315}
.divar-meta{display:flex;gap:8px;flex-wrap:wrap;align-items:center;color:rgb(0 0 0 / .62);font-size:.78rem}
.divar-chip{display:inline-flex;align-items:center;gap:4px;border:1px solid rgb(0 0 0 / .12);background:rgb(0 0 0 / .03);border-radius:999px;padding:4px 9px}
.divar-price{display:flex;gap:12px;flex-wrap:wrap;font-size:.84rem;font-weight:800;color:#7a5220}
.divar-features{display:flex;gap:6px;flex-wrap:wrap}
.divar-feature{font-size:.72rem;color:rgb(0 0 0 / .68);background:rgb(0 0 0 / .05);border-radius:8px;padding:4px 8px}
.divar-description{margin:0;color:rgb(0 0 0 / .58);line-height:1.9;font-size:.8rem;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.divar-mini{display:flex;align-items:center;gap:6px;color:rgb(0 0 0 / .5);font-size:.72rem}
.divar-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:2px}
.divar-progress{display:flex;flex-direction:column;gap:7px;padding:11px 13px;border-radius:12px;background:rgb(0 0 0 / .04);border:1px solid rgb(0 0 0 / .09)}
.divar-progress-bar{height:5px;border-radius:999px;background:rgb(0 0 0 / .1);overflow:hidden}
.divar-progress-bar span{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#111315,#4a4f55);transition:width .3s ease}
.divar-progress small{color:rgb(0 0 0 / .68);font-size:.74rem}
.divar-progress-bar.is-indeterminate span{width:35%;animation:divar-indeterminate 1.2s ease-in-out infinite}
@keyframes divar-indeterminate{0%{margin-inline-start:-35%}100%{margin-inline-start:100%}}
.divar-note,.divar-warning,.divar-error{padding:13px 15px;border-radius:14px;line-height:1.9;font-size:.8rem}
.divar-note{background:rgba(24,122,88,.07);border:1px solid rgba(24,122,88,.18);color:#14503a}
.divar-warning{background:rgba(154,99,47,.08);border:1px solid rgba(154,99,47,.2);color:#6f4318}
.divar-error{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;background:rgba(190,70,70,.08);border:1px solid rgba(190,70,70,.24);color:#8f3232}
.divar-error-text{display:flex;align-items:center;gap:8px;min-width:0}
.divar-hosted-badge{display:inline-flex;align-items:center;gap:5px;border-radius:999px;padding:3px 8px;font-size:.68rem;font-weight:700;background:rgba(24,122,88,.11);color:#17603f}
.divar-remote-badge{display:inline-flex;align-items:center;gap:5px;border-radius:999px;padding:3px 8px;font-size:.68rem;font-weight:700;background:#fff5e7;color:#8a5e14;border:1px solid #edd5b3}
.divar-override-badge{display:inline-flex;align-items:center;gap:5px;border-radius:999px;padding:3px 8px;font-size:.68rem;font-weight:700;background:rgba(60,80,140,.12);color:#2f3d63}
.divar-toggle-warning{border-color:#edd5b3!important;background:#fffaf2!important;color:#8a5e14!important}
.divar-gallery-health{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border:1px solid #dce6ee;border-radius:10px;background:#f8fafc;color:#57646e;font-size:.72rem}
.divar-gallery-health strong{color:#17603f;font-variant-numeric:tabular-nums}
.divar-gallery-health.is-partial,.divar-gallery-health.is-missing{border-color:#ecd0d0;background:#fff7f7}
.divar-gallery-health.is-partial strong,.divar-gallery-health.is-missing strong{color:#8f3232}
.divar-gallery-health.is-empty{border-color:#e3e8ee;background:#f8fafc}
.divar-gallery-health.is-empty strong{color:#66717d}
.divar-score{display:flex;flex-direction:column;gap:7px;padding:10px 12px;border:1px solid rgb(0 0 0 / .09);border-radius:12px;background:rgb(0 0 0 / .02)}
.divar-score-top{display:flex;align-items:center;justify-content:space-between;gap:10px;color:rgb(0 0 0 / .6);font-size:.72rem}
.divar-score-top strong{color:#111315;font-size:.86rem;font-variant-numeric:tabular-nums}
.divar-score-bar{height:6px;border-radius:999px;background:rgb(0 0 0 / .1);overflow:hidden}
.divar-score-bar span{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#a8761f,#e2c48c)}
.divar-score.is-good .divar-score-bar span{background:linear-gradient(90deg,#17603f,#6fbf95)}
.divar-score-missing{margin:0;color:rgb(0 0 0 / .55);font-size:.7rem;line-height:1.8}
.divar-specs{display:grid;grid-template-columns:repeat(auto-fit,minmax(112px,1fr));gap:6px}
.divar-spec{display:flex;flex-direction:column;gap:2px;padding:7px 9px;border-radius:10px;background:rgb(0 0 0 / .035)}
.divar-spec span{color:rgb(0 0 0 / .52);font-size:.66rem}
.divar-spec b{color:#111315;font-size:.76rem;font-weight:750}
.divar-reject-reason{display:flex;align-items:flex-start;gap:7px;width:100%;padding:9px 11px;border:1px solid #ecd0d0;border-radius:10px;background:#fff7f7;color:#8f3232;font-size:.75rem;line-height:1.8}
.divar-loadmore{display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;padding:16px 20px 20px;border-top:1px dashed rgb(0 0 0 / .1)}
.divar-loadmore small{color:rgb(0 0 0 / .55);font-size:.74rem;text-align:center}
@media (max-width:1080px){.divar-grid{grid-template-columns:1fr}}
@media (max-width:760px){.divar-hero{flex-direction:column}.divar-hero-actions{justify-content:flex-start}.divar-hero h2{font-size:22px}.divar-history-row{grid-template-columns:1fr}.divar-media-badge{bottom:50px}}
@media (max-width:560px){.divar-grid{padding:14px}.divar-smart-toolbar,.divar-toolbar,.divar-bulkbar,.divar-history-head,.divar-history-body{padding:14px}.divar-select-field select{max-width:none;width:100%}.divar-filter-group{width:100%}.divar-select-field{flex:1 1 140px}}

/* Admin 3.0 theme override */
.divar-wrap{color:#122333!important}.divar-wrap .kicker{color:#8a5e14!important}
.divar-hero{background:linear-gradient(135deg,#fffaf2,#fff)!important;border-color:#ead8bd!important}
.divar-hero h2,.divar-title,.divar-score-top strong{color:#122333!important}.divar-hero p,.divar-description,.divar-meta,.divar-mini{color:#66717d!important}
.divar-hero-actions select,.divar-select-field select,.divar-search-box,.divar-toggle,.divar-tab,.divar-card,.divar-stat,.divar-history{background:#fff!important;color:#344054!important;border-color:#d5dde5!important}
.divar-history-head,.divar-history-head strong{background:transparent!important;color:#344054!important}
.divar-tab.is-active{background:#122333!important;color:#fff!important;border-color:#122333!important}
.divar-stat-icon{background:#f7efe2!important;color:#8a5e14!important}
.divar-stat small,.divar-progress small,.divar-history-empty,.divar-loadmore small{color:#66717d!important}.divar-stat strong{color:#122333!important}
.divar-toolbar,.divar-smart-toolbar,.divar-card,.divar-history-row,.divar-bulkbar{border-color:#e1e7ed!important}
.divar-bulkbar{background:#fffaf2!important}.divar-bulkbar strong{color:#122333!important}
.divar-history-row{background:#fbfcfd!important}.divar-history-row strong{color:#122333!important}.divar-history-row p,.divar-history-row time{color:#66717d!important}
.divar-history-row.is-failed{background:#fff7f7!important;border-color:#ecd0d0!important}
.divar-chip,.divar-feature,.divar-spec{background:#f7f9fb!important;color:#475467!important;border-color:#dfe5eb!important}
.divar-spec b{color:#122333!important}.divar-spec span{color:#66717d!important}
.divar-price{color:#8a5e14!important}.divar-progress{background:#f8fafc!important;border-color:#e0e6eb!important}.divar-progress-bar{background:#e8edf2!important}.divar-progress-bar span{background:linear-gradient(90deg,#8a5e14,#c08a2a)!important}
.divar-note{color:#17603f!important}.divar-warning{color:#6f4318!important}.divar-error{color:#8f3232!important}
.divar-score{background:#f8fafc!important;border-color:#e3e8ee!important}.divar-score-bar{background:#e8edf2!important}.divar-score-top{color:#66717d!important}.divar-score-missing{color:#66717d!important}
.divar-image{background:var(--navy-100)!important}
.divar-gallery-strip{background:linear-gradient(to top,rgba(8,19,32,.78),transparent)!important}
.divar-tab.is-active{background:var(--navy-900)!important;border-color:var(--navy-900)!important}
.divar-tab:focus-visible,.divar-actions a:focus-visible,.divar-actions button:focus-visible,.divar-select:focus-visible,.divar-search-clear:focus-visible,.divar-history-head:focus-visible,.divar-loadmore button:focus-visible{outline:3px solid rgba(192,138,42,.32);outline-offset:2px}
.divar-actions .btn-gold{background:linear-gradient(135deg,#8a5e14,#c08a2a)!important;color:#fff!important}
@media(max-width:560px){.divar-grid{padding:11px!important}.divar-body{padding:13px!important}.divar-actions>*{flex:1 1 100%!important}}
`;

/** Grid image with the same fallback chain used on the public site. */
export function DivarImage({
  src,
  className,
  onFailed,
}: {
  src: string;
  className?: string;
  onFailed?: () => void;
}) {
  const candidates = useMemo(() => mediaSourceCandidates(src), [src]);
  const [attempt, setAttempt] = useState(0);
  const current = candidates[Math.min(attempt, Math.max(candidates.length - 1, 0))] ?? src;

  useEffect(() => {
    setAttempt(0);
  }, [src]);

  return (
    <img
      src={current}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      className={className}
      onError={() => {
        if (attempt < candidates.length - 1) setAttempt((value) => value + 1);
        else onFailed?.();
      }}
    />
  );
}

/** Primary image plus a thumbnail strip so every imported photo is visible. */
export function DivarGallery({
  images,
  badge,
}: {
  images: string[];
  badge: DivarFile["filterStatus"];
}) {
  const [active, setActive] = useState(0);
  const [broken, setBroken] = useState<Record<number, boolean>>({});
  const [brokenThumbs, setBrokenThumbs] = useState<Record<number, boolean>>({});
  const list = images.slice(0, 8);

  useEffect(() => {
    setActive(0);
    setBroken({});
    setBrokenThumbs({});
  }, [images]);

  const primary = list[Math.min(active, Math.max(list.length - 1, 0))] ?? "";
  const extra = Math.max(0, images.length - list.length);

  return (
    <div className="divar-image">
      {primary && !broken[active] ? (
        <DivarImage
          src={primary}
          onFailed={() => setBroken((prev) => ({ ...prev, [active]: true }))}
        />
      ) : (
        <div className="divar-image-fallback">
          <ImageIcon size={40} />
        </div>
      )}

      <span className="divar-media-badge">
        <Images size={12} />
        {images.length ? `${fa(images.length)} تصویر` : "بدون تصویر"}
      </span>

      <span className={`divar-status ${badge}`}>
        {badge === "imported" ? (
          <>
            <BadgeCheck size={12} /> منتشرشده
          </>
        ) : badge === "rejected" ? (
          <>
            <ShieldCheck size={12} /> ردشده
          </>
        ) : (
          <>
            <Sparkles size={12} /> آماده انتشار
          </>
        )}
      </span>

      {list.length > 1 ? (
        <div className="divar-gallery-strip">
          {list.map((image, imageIndex) => (
            <button
              key={`${image}-${imageIndex}`}
              type="button"
              className={
                imageIndex === active ? "divar-gallery-thumb is-active" : "divar-gallery-thumb"
              }
              onClick={() => setActive(imageIndex)}
              aria-label={`تصویر ${imageIndex + 1}`}
              title={`تصویر ${imageIndex + 1}`}
            >
              {brokenThumbs[imageIndex] ? (
                <span className="divar-thumb-fallback" aria-label="تصویر بارگذاری نشد">
                  <ImageIcon size={14} />
                </span>
              ) : (
                <DivarImage
                  src={image}
                  onFailed={() =>
                    setBrokenThumbs((prev) => ({ ...prev, [imageIndex]: true }))
                  }
                />
              )}
            </button>
          ))}
          {extra > 0 ? <span className="divar-gallery-more">+{fa(extra)}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
