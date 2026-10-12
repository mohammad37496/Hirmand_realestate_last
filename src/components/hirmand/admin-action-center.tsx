import { AlertTriangle, ArrowLeft, Check, Clock3, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

type ActionItem = {
  id: string;
  kind: "task" | "lead" | "visit" | "property" | "featured";
  priority: "urgent" | "high" | "normal";
  title: string;
  description: string;
  createdAt: string;
  dueAt: string | null;
  entityId: string | null;
  target: "productivity" | "leads" | "properties";
};

type Props = {
  onOpenProperties: () => void;
  onOpenLeads: () => void;
  onOpenProductivity: () => void;
};

const PRIORITY_LABEL = {
  urgent: "فوری",
  high: "مهم",
  normal: "عادی",
} as const;

function formatAge(value: string) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "";
  const hours = Math.max(0, Math.floor((Date.now() - time) / 3_600_000));
  if (hours < 1) return "کمتر از یک ساعت";
  if (hours < 24) return hours.toLocaleString("fa-IR") + " ساعت پیش";
  return Math.floor(hours / 24).toLocaleString("fa-IR") + " روز پیش";
}

export function AdminActionCenter({ onOpenProperties, onOpenLeads, onOpenProductivity }: Props) {
  const [items, setItems] = useState<ActionItem[]>([]);
  const [summary, setSummary] = useState({ urgent: 0, high: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin-action-center", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "list" }),
      });
      if (!response.ok) throw new Error("action center unavailable");
      const result = (await response.json()) as {
        summary?: { urgent?: number; high?: number; total?: number };
        items?: ActionItem[];
      };
      setSummary({
        urgent: Number(result.summary?.urgent) || 0,
        high: Number(result.summary?.high) || 0,
        total: Number(result.summary?.total) || 0,
      });
      setItems(Array.isArray(result.items) ? result.items : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openTarget = (target: ActionItem["target"]) => {
    if (target === "leads") onOpenLeads();
    else if (target === "properties") onOpenProperties();
    else onOpenProductivity();
  };

  const completeTask = async (item: ActionItem) => {
    if (item.kind !== "task" || busyId) return;
    setBusyId(item.id);
    try {
      const response = await fetch("/api/admin-action-center", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "completeTask", id: item.entityId }),
      });
      if (!response.ok) throw new Error("complete failed");
      setItems((prev) => prev.filter((current) => current.id !== item.id));
      setSummary((prev) => ({ ...prev, total: Math.max(0, prev.total - 1) }));
      toast.success("وظیفه انجام‌شده علامت‌گذاری شد.");
    } catch {
      toast.error("بستن وظیفه انجام نشد.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="admin-panel" style={{ marginTop: 18 }}>
      <div className="admin-panel-head">
        <div>
          <span className="kicker">مرکز اقدام امروز</span>
          <h2>چیزهایی که الان باید پیگیری شوند</h2>
        </div>
        <button type="button" className="btn-ghost" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={15} />
          بروزرسانی
        </button>
      </div>

      <div className="admin-dashboard-mini-grid">
        <div><span>فوری</span><strong>{summary.urgent.toLocaleString("fa-IR")}</strong></div>
        <div><span>مهم</span><strong>{summary.high.toLocaleString("fa-IR")}</strong></div>
        <div><span>کل صف</span><strong>{summary.total.toLocaleString("fa-IR")}</strong></div>
      </div>

      <div className="admin-breakdown">
        {loading && !items.length ? (
          <div className="admin-empty"><Clock3 size={24} /><strong>در حال جمع‌کردن کارهای امروز…</strong></div>
        ) : items.length === 0 ? (
          <div className="admin-empty"><Check size={24} /><strong>فعلاً اقدام بحرانی در صف نیست.</strong></div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="admin-breakdown-row">
              <div style={{ minWidth: 0 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  {item.priority === "urgent" ? <AlertTriangle size={14} /> : null}
                  {item.title}
                </span>
                <strong>{PRIORITY_LABEL[item.priority]} · {formatAge(item.createdAt)}</strong>
              </div>

              <small>{item.description || "نیازمند بررسی"}</small>

              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                {item.kind === "task" ? (
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => void completeTask(item)}
                    disabled={busyId === item.id}
                    aria-label={"انجام شد: " + item.title}
                  >
                    <Check size={14} />
                    انجام شد
                  </button>
                ) : null}
                <button type="button" className="text-link" onClick={() => openTarget(item.target)}>
                  باز کردن
                  <ArrowLeft size={13} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
