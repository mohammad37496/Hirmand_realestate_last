import { Link2, Copy, Check, ExternalLink, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

const SOURCE_OPTIONS = [
  ["instagram", "اینستاگرام"],
  ["whatsapp", "واتساپ"],
  ["telegram", "تلگرام"],
  ["eitaa", "ایتا"],
  ["divar", "دیوار"],
  ["google", "گوگل"],
  ["partner", "همکار"],
];

const MEDIUM_OPTIONS = [
  ["social", "شبکه اجتماعی"],
  ["story", "استوری"],
  ["status", "وضعیت / استاتوس"],
  ["bio", "بیو"],
  ["listing", "آگهی"],
  ["search", "جست‌وجو"],
  ["referral", "ارجاع"],
];

function buildCampaignUrl(path: string, source: string, medium: string, campaign: string, content: string) {
  const normalizedPath = path.trim() || "/properties";
  const baseUrl = typeof window === "undefined" ? "https://www.hirmandrealestate.ir" : window.location.origin;
  const url = new URL(normalizedPath.startsWith("/") ? normalizedPath : "/" + normalizedPath, baseUrl);
  url.searchParams.set("utm_source", source);
  url.searchParams.set("utm_medium", medium);
  if (campaign.trim()) url.searchParams.set("utm_campaign", campaign.trim());
  if (content.trim()) url.searchParams.set("utm_content", content.trim());
  return url.toString();
}

export function AdminCampaignLinkBuilder() {
  const [path, setPath] = useState("/properties");
  const [source, setSource] = useState("instagram");
  const [medium, setMedium] = useState("story");
  const [campaign, setCampaign] = useState("files-website");
  const [content, setContent] = useState("story-1");
  const [copied, setCopied] = useState(false);

  const url = useMemo(
    () => buildCampaignUrl(path, source, medium, campaign, content),
    [path, source, medium, campaign, content],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className="admin-panel">
      <div className="admin-panel-head">
        <div>
          <span className="kicker">بازاریابی قابل اندازه‌گیری</span>
          <h2>لینک‌ساز کمپین</h2>
        </div>
        <Sparkles size={18} />
      </div>

      <div style={{ padding: "16px 20px 20px" }}>
        <p className="admin-dashboard-summary" style={{ margin: "0 0 14px" }}>
          برای هر استوری، آگهی، وضعیت یا همکاری یک لینک اختصاصی بسازید تا منبع ورود بازدیدکننده و کمپین در گزارش‌ها و لید CRM ثبت شود.
        </p>

        <div className="admin-form-grid">
          <label className="field">
            <span>صفحه مقصد</span>
            <input
              value={path}
              onChange={(event) => setPath(event.target.value)}
              placeholder="/properties"
              dir="ltr"
            />
          </label>

          <label className="field">
            <span>منبع</span>
            <select value={source} onChange={(event) => setSource(event.target.value)}>
              {SOURCE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>

          <label className="field">
            <span>نوع انتشار</span>
            <select value={medium} onChange={(event) => setMedium(event.target.value)}>
              {MEDIUM_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>

          <label className="field">
            <span>نام کمپین</span>
            <input
              value={campaign}
              onChange={(event) => setCampaign(event.target.value)}
              placeholder="مثلاً فایل-بهارستان"
              dir="ltr"
            />
          </label>

          <label className="field admin-span-2">
            <span>شناسه محتوا</span>
            <input
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="مثلاً story-1 یا advisor-sheikh"
              dir="ltr"
            />
          </label>
        </div>

        <div
          style={{
            marginTop: 14,
            padding: "13px 14px",
            border: "1px solid rgb(8 19 32)",
            borderRadius: 14,
            background: "rgb(11 26 43)",
          }}
        >
          <span style={{ display: "block", color: "rgb(247 245 239 / .55)", fontSize: ".73rem", marginBottom: 6 }}>
            لینک آماده انتشار
          </span>
          <div
            dir="ltr"
            style={{
              wordBreak: "break-all",
              color: "#f7f5ef",
              fontSize: ".82rem",
              lineHeight: 1.8,
              fontFamily: "ui-monospace,SFMono-Regular,Consolas,monospace",
            }}
          >
            {url}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <button type="button" className="btn-gold" onClick={() => void copy()}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? "کپی شد" : "کپی لینک"}
          </button>
          <a className="btn-ghost" href={url} target="_blank" rel="noreferrer">
            <ExternalLink size={16} />
            تست لینک
          </a>
          <span className="admin-dashboard-summary" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Link2 size={14} />
            UTM فعال
          </span>
        </div>
      </div>
    </section>
  );
}
