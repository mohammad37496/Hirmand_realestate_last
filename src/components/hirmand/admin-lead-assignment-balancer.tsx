import { useCallback, useEffect, useState } from "react";
import { Gauge, RefreshCw, UserRound, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { adminErrorMessage } from "@/components/hirmand/admin-ui-utils";

type ConsultantLoad = {
  name: string;
  phone: string;
  activeLeads: number;
  overdue: number;
  viewingRequests: number;
  score: number;
};
type Recommendation = {
  lead: { id: string; name: string; phone: string; deal: string; propertyType: string; neighborhood: string; createdAt: string };
  suggested: { name: string; phone: string; score: number } | null;
  alternatives: Array<{ name: string; phone: string; score: number }>;
};

export function AdminLeadAssignmentBalancer() {
  const [consultants, setConsultants] = useState<ConsultantLoad[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin-lead-assignment", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "recommend" }),
      });
      const data = await response.json() as { consultants?: ConsultantLoad[]; recommendations?: Recommendation[]; statusMessage?: string };
      if (!response.ok) throw new Error(data.statusMessage || "تعادل بار لیدها در دسترس نیست.");
      setConsultants(Array.isArray(data.consultants) ? data.consultants : []);
      setRecommendations(Array.isArray(data.recommendations) ? data.recommendations : []);
    } catch (error) {
      toast.error(adminErrorMessage(error, "پیشنهاد تخصیص مشاور بارگذاری نشد."));
      setConsultants([]);
      setRecommendations([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function assign(leadId: string, consultant: string) {
    if (busy) return;
    setBusy(leadId);
    try {
      const response = await fetch("/api/admin-lead-assignment", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "assign", leadId, consultant }),
      });
      const data = await response.json() as { statusMessage?: string };
      if (!response.ok) throw new Error(data.statusMessage || "تخصیص انجام نشد.");
      toast.success("لید به «" + consultant + "» واگذار شد.");
      await load();
    } catch (error) {
      toast.error(adminErrorMessage(error, "تخصیص لید انجام نشد."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <details className="admin-panel" style={{ marginTop: 14 }}>
      <summary style={{ cursor: "pointer", fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Gauge size={17} />
          مرکز تعادل بار مشاوران
          <span className="admin-lead-status" style={{ marginInlineStart: 4 }}>{recommendations.length.toLocaleString("fa-IR")} لید بدون مشاور</span>
        </span>
        <button type="button" className="btn-ghost" onClick={(event) => { event.preventDefault(); void load(); }} disabled={loading}>
          <RefreshCw size={14} className={loading ? "admin-spin" : ""} /> بروزرسانی
        </button>
      </summary>
      <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 8 }}>
          {consultants.map((item) => (
            <div key={item.phone || item.name} style={{ border: "1px solid var(--line)", borderRadius: 11, padding: 10, background: "var(--surface-2,#f7f5f0)" }}>
              <strong style={{ display: "block", fontSize: ".72rem" }}><UserRound size={13} style={{ verticalAlign: "middle", marginInlineEnd: 4 }} />{item.name}</strong>
              <small style={{ display: "block", marginTop: 5, color: "var(--muted)" }}>فعال {item.activeLeads.toLocaleString("fa-IR")} · عقب‌افتاده {item.overdue.toLocaleString("fa-IR")}</small>
              <small style={{ display: "block", marginTop: 3, color: "var(--subtle)" }}>بازدیدها {item.viewingRequests.toLocaleString("fa-IR")} · امتیاز بار {item.score.toLocaleString("fa-IR")}</small>
            </div>
          ))}
        </div>
        {!loading && !recommendations.length ? <div className="admin-empty"><UsersRound size={22} />همه لیدهای فعال مشاور دارند.</div> : null}
        {loading ? <div className="admin-empty"><RefreshCw size={22} className="admin-spin" />در حال محاسبه بار مشاوران…</div> : null}
        {!loading ? recommendations.slice(0, 12).map((item) => (
          <div key={item.lead.id} style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 10, display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 10, alignItems: "center" }}>
            <div>
              <strong>{item.lead.name || "بدون نام"}</strong>
              <small style={{ display: "block", color: "var(--muted)", marginTop: 4 }}>{item.lead.deal} · {item.lead.propertyType || "نوع نامشخص"}{item.lead.neighborhood ? " · " + item.lead.neighborhood : ""}</small>
              <small style={{ display: "block", color: "var(--subtle)", marginTop: 3 }}>پیشنهاد: {item.suggested?.name || "مشاوری در دسترس نیست"}{item.alternatives.length ? " · جایگزین: " + item.alternatives.map((x) => x.name).join("، ") : ""}</small>
            </div>
            {item.suggested ? <button type="button" className="btn-gold" onClick={() => void assign(item.lead.id, item.suggested!.name)} disabled={busy === item.lead.id}>
              {busy === item.lead.id ? "در حال ثبت…" : "تخصیص پیشنهادی"}
            </button> : null}
          </div>
        )) : null}
      </div>
    </details>
  );
}
