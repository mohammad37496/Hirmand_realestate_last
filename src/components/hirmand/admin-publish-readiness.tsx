import { CheckCircle2, CircleAlert, ShieldCheck, XCircle } from "lucide-react";
import { getPublishReadiness, type PublishReadinessInput } from "@/lib/property-publish-readiness";

type Props = PublishReadinessInput & {
  compact?: boolean;
};

export function AdminPublishReadiness(props: Props) {
  const readiness = getPublishReadiness(props);
  return (
    <section className={"admin-publish-readiness" + (readiness.ready ? " is-ready" : " is-blocked")} aria-label="بررسی آمادگی انتشار">
      <style>{`
        .admin-publish-readiness{margin-top:14px;padding:13px 14px;border:1px solid var(--line);border-radius:14px;background:var(--card,#fff);display:grid;gap:10px}
        .admin-publish-readiness.is-ready{border-color:rgb(43 107 74 / 24%);background:#f8fbf8}
        .admin-publish-readiness.is-blocked{border-color:rgb(163 49 39 / 22%);background:var(--danger-bg,#fff4f2)}
        .admin-publish-readiness-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
        .admin-publish-readiness-title{display:flex;align-items:center;gap:8px;color:var(--navy-900)}
        .admin-publish-readiness-title strong{font-size:.78rem}
        .admin-publish-readiness-badge{display:inline-flex;align-items:center;gap:5px;padding:4px 8px;border-radius:999px;font-size:.62rem;font-weight:800}
        .admin-publish-readiness-badge.is-ok{color:#2b6b4a;background:#edf6ef}
        .admin-publish-readiness-badge.is-blocked{color:var(--danger);background:#fff0ed}
        .admin-publish-readiness-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px}
        .admin-publish-readiness-item{display:flex;align-items:center;gap:6px;padding:7px 8px;border:1px solid var(--line);border-radius:9px;background:var(--card,#fff);color:var(--muted);font-size:.62rem}
        .admin-publish-readiness-item[data-state="ok"]{color:#2b6b4a}
        .admin-publish-readiness-item[data-state="warning"]{color:var(--brass-700);background:var(--brass-50,#fbf7ef)}
        .admin-publish-readiness-item[data-state="blocker"]{color:var(--danger);background:#fff2f0}
        .admin-publish-readiness-list{display:grid;gap:5px}
        .admin-publish-readiness-list p{margin:0;padding:6px 0;color:var(--muted);font-size:.65rem;line-height:1.7}
        .admin-publish-readiness-list p.is-blocker{color:var(--danger)}
        .admin-publish-readiness-list p.is-warning{color:var(--brass-700)}
        @media(max-width:850px){.admin-publish-readiness-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media(max-width:480px){.admin-publish-readiness-grid{grid-template-columns:1fr}.admin-publish-readiness{padding:11px}}
      `}</style>
      <div className="admin-publish-readiness-head">
        <div className="admin-publish-readiness-title">
          <ShieldCheck size={17} />
          <strong>{props.compact ? "آمادگی انتشار" : "گیت کیفیت انتشار"}</strong>
        </div>
        <span className={"admin-publish-readiness-badge " + (readiness.ready ? "is-ok" : "is-blocked")}>
          {readiness.ready ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
          {readiness.ready ? "قابل انتشار" : "انتشار متوقف است"}
        </span>
      </div>
      <div className="admin-publish-readiness-grid">
        {readiness.checks.map((item) => (
          <div key={item.key} className="admin-publish-readiness-item" data-state={item.state}>
            {item.state === "ok" ? <CheckCircle2 size={12} /> : <CircleAlert size={12} />}
            <span>{item.label}</span>
          </div>
        ))}
      </div>
      {!props.compact && (readiness.blockers.length || readiness.warnings.length) ? (
        <div className="admin-publish-readiness-list">
          {readiness.blockers.map((item) => <p className="is-blocker" key={"b-" + item}>⛔ {item}</p>)}
          {readiness.warnings.map((item) => <p className="is-warning" key={"w-" + item}>⚠️ {item}</p>)}
        </div>
      ) : null}
    </section>
  );
}
