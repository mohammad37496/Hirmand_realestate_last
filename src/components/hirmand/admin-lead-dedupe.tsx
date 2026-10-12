import { useCallback, useEffect, useState } from "react";
import { GitMerge, RefreshCw, ShieldCheck, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { adminErrorMessage, useConfirmDialog } from "@/components/hirmand/admin-ui-utils";

type LeadRef = {
  id: string;
  name: string;
  phone: string;
  status: string;
  consultant: string;
  propertyId: string | null;
  createdAt: string;
};

type Group = {
  id: string;
  reason: string;
  leads: [LeadRef, LeadRef];
};

export function AdminLeadDedupe() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const { confirm, dialog } = useConfirmDialog();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin-lead-dedupe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "list" }),
      });
      const data = await response.json() as { groups?: Group[]; total?: number };
      if (!response.ok) throw new Error((data as { statusMessage?: string }).statusMessage || "موارد تکراری بارگذاری نشد.");
      setGroups(Array.isArray(data.groups) ? data.groups : []);
    } catch (error) {
      toast.error(adminErrorMessage(error, "بررسی لیدهای تکراری انجام نشد."));
      setGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function merge(canonical: LeadRef, duplicate: LeadRef) {
    const ok = await confirm({
      title: "پیش‌نمایش ادغام لید",
      description: "اطلاعات غیرخالی لید اصلی حفظ می‌شود، فیلدهای خالی از لید دوم تکمیل می‌شوند، فعالیت‌های CRM منتقل می‌شوند و رکورد دوم فقط بسته می‌شود؛ حذف فیزیکی انجام نمی‌شود.",
      items: [canonical.name + " · " + canonical.phone, duplicate.name + " · " + duplicate.phone],
      confirmLabel: "ادغام و حفظ رکورد اصلی",
      tone: "danger",
    });
    if (!ok || busy) return;

    setBusy(canonical.id + "::" + duplicate.id);
    try {
      const response = await fetch("/api/admin-lead-dedupe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "merge", canonicalId: canonical.id, duplicateId: duplicate.id }),
      });
      const data = await response.json() as { statusMessage?: string; movedActivities?: number };
      if (!response.ok) throw new Error(data.statusMessage || "ادغام انجام نشد.");
      toast.success("ادغام انجام شد؛ " + (data.movedActivities ?? 0).toLocaleString("fa-IR") + " فعالیت منتقل شد.");
      await load();
    } catch (error) {
      toast.error(adminErrorMessage(error, "ادغام لید انجام نشد."));
    } finally {
      setBusy(null);
    }
  }

  const status = (value: string) => ({
    new: "جدید",
    contacted: "تماس",
    follow_up: "پیگیری",
    visited: "بازدید",
    contract: "قرارداد",
    closed: "بسته",
    spam: "اسپم",
  }[value] ?? value);

  return (
    <details className="admin-panel" style={{ marginTop: 14 }} open={groups.length > 0}>
      {dialog}
      <summary style={{ cursor: "pointer", fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <ShieldCheck size={17} />
          پاک‌سازی لیدهای تکراری
          <span className="admin-lead-status" style={{ marginInlineStart: 4 }}>{groups.length.toLocaleString("fa-IR")} مورد</span>
        </span>
        <button type="button" className="btn-ghost" onClick={(event) => { event.preventDefault(); void load(); }} disabled={loading}>
          <RefreshCw size={14} className={loading ? "admin-spin" : ""} />
          بررسی مجدد
        </button>
      </summary>
      <div style={{ display: "grid", gap: 9, marginTop: 14 }}>
        {loading ? <div className="admin-empty"><RefreshCw size={22} className="admin-spin" />در حال بررسی شماره‌های تکراری…</div> : null}
        {!loading && !groups.length ? <div className="admin-empty"><UsersRound size={22} />مورد واضحی برای ادغام پیدا نشد.</div> : null}
        {groups.slice(0, 20).map((group) => (
          <div key={group.id} style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 10, display: "grid", gap: 8 }}>
            <small style={{ color: "var(--subtle)", fontWeight: 800 }}>{group.reason}</small>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8 }}>
              {group.leads.map((lead) => (
                <div key={lead.id} style={{ background: "var(--surface-2,#f7f5f0)", borderRadius: 10, padding: 10 }}>
                  <strong>{lead.name || "بدون نام"}</strong>
                  <div style={{ fontSize: ".7rem", color: "var(--muted)", marginTop: 4 }}>{lead.phone || "بدون تلفن"}</div>
                  <small style={{ display: "block", marginTop: 4, color: "var(--subtle)" }}>{status(lead.status)}{lead.consultant ? " · " + lead.consultant : " · بدون مشاور"}</small>
                  <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button type="button" className="btn-ghost" onClick={() => void merge(lead, group.leads[lead.id === group.leads[0].id ? 1 : 0])} disabled={Boolean(busy)}>
                      <GitMerge size={13} /> حفظ این رکورد
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}
