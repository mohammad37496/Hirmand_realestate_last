import { useEffect, useMemo, useState } from "react";
import { BriefcaseBusiness, CalendarClock, FileText, MessageCircle, UserRound, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { formatToman } from "@/lib/money";

type Lead = { id: string; name: string; phone: string; deal: string; neighborhood: string; consultant: string };
type Customer = Lead & {
  job: string; propertyType: string; floorPreference: string; requestedBedrooms: number | null; requestedAmenities: string[];
  status: string; source: string; followUpAt: string | null; lastContactedAt: string | null; note: string; leaseDeadline: string | null;
  budgets: { deposit: number | null; rent: number | null; purchase: number | null; sale: number | null; depositMin: number | null; depositMax: number | null; rentMin: number | null; rentMax: number | null; purchaseMin: number | null; purchaseMax: number | null; saleMin: number | null; saleMax: number | null };
  matchCount: number; propertyId: string | null; propertyTitle: string | null; propertySlug: string | null; createdAt: string;
};
type Payload = {
  customer: Customer | null;
  activities: Array<{ id: number; type: string; title: string; note: string; createdAt: string }>;
  deals: Array<{ id: string; title: string; dealType: string; status: string; amount: number | null; commission: number | null; consultant: string; contractNumber: string; notes: string }>;
  settlements: Array<{ id: string; dealId: string; consultant: string; commissionAmount: number; consultantShare: number; officeShare: number; status: string; paidAt: string | null; note: string }>;
  documents: Array<{ id: string; dealId: string; type: string; status: string; fileUrl: string; note: string }>;
};
const statusLabel = (value: string) => ({ new: "جدید", contacted: "تماس گرفته شد", follow_up: "پیگیری", visited: "بازدید", contract: "قرارداد", closed: "بسته‌شده", spam: "اسپم" } as Record<string, string>)[value] ?? value;
const docLabel = (value: string) => ({ pending: "در انتظار", received: "دریافت شد", verified: "تأیید شد", rejected: "رد شد" } as Record<string, string>)[value] ?? value;
const dateLabel = (value: string | null) => value ? new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";

export function AdminLead360({ leads }: { leads: Lead[] }) {
  const [leadId, setLeadId] = useState("");
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);

  async function load(id: string) {
    setLeadId(id);
    if (!id) { setPayload(null); return; }
    setLoading(true);
    try {
      const response = await fetch("/api/admin-lead-360", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
      const data = (await response.json()) as Payload & { statusMessage?: string };
      if (!response.ok) throw new Error(data.statusMessage || "پرونده مشتری بارگذاری نشد.");
      setPayload(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "پرونده مشتری بارگذاری نشد.");
    } finally { setLoading(false); }
  }

  const c = payload?.customer;
  const totalVolume = useMemo(() => (payload?.deals ?? []).reduce((sum, deal) => sum + (deal.amount ?? 0), 0), [payload]);
  const due = useMemo(() => (payload?.settlements ?? []).filter((x) => ["pending", "approved"].includes(x.status)).reduce((sum, x) => sum + x.consultantShare, 0), [payload]);

  return (
    <section className="admin-panel admin-customer-360" dir="rtl">
      <div className="admin-panel-head">
        <div><span className="kicker">CRM حرفه‌ای</span><h2><UserRound size={18} /> پرونده ۳۶۰ درجه مشتری</h2><p>پیگیری‌ها، نیاز، فایل مرتبط، معاملات، مدارک و کمیسیون مشتری را یکجا ببینید.</p></div>
        <label className="field admin-360-select"><span>مشتری</span><select value={leadId} onChange={(e) => void load(e.target.value)}><option value="">انتخاب مشتری</option>{leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.name} · {lead.phone}</option>)}</select></label>
      </div>

      {!c && !loading ? <div className="admin-empty-state"><UserRound size={24} /><strong>یک مشتری را انتخاب کنید.</strong></div> : null}
      {loading ? <div className="admin-empty">در حال دریافت پرونده…</div> : null}

      {c ? <>
        <div className="admin-360-summary">
          <div><span>مشتری</span><strong>{c.name}</strong><small dir="ltr">{c.phone}</small></div>
          <div><span>وضعیت</span><strong>{statusLabel(c.status)}</strong><small>{c.deal} · {c.neighborhood || "بدون محله"}</small></div>
          <div><span>مشاور</span><strong>{c.consultant || "—"}</strong><small>{c.source || "—"}</small></div>
          <div><span>فایل مرتبط</span><strong>{c.propertyTitle || "بدون فایل"}</strong><small>{c.matchCount.toLocaleString("fa-IR")} فایل پیشنهادی</small></div>
        </div>

        <div className="admin-360-grid">
          <section className="admin-360-card"><h3><CalendarClock size={16} /> پیگیری و نیاز</h3><p>{c.note || "یادداشت ثبت نشده است."}</p><div className="admin-360-meta"><span>آخرین تماس: {dateLabel(c.lastContactedAt)}</span><span>پیگیری بعدی: {dateLabel(c.followUpAt)}</span><span>ثبت درخواست: {dateLabel(c.createdAt)}</span></div>{c.propertySlug ? <a className="text-link" href={"/properties/" + c.propertySlug} target="_blank" rel="noreferrer">مشاهده فایل مرتبط</a> : null}</section>
          <section className="admin-360-card"><h3><WalletCards size={16} /> بودجه</h3><div className="admin-360-budget">{([["رهن", c.budgets.deposit], ["اجاره", c.budgets.rent], ["خرید", c.budgets.purchase], ["فروش", c.budgets.sale]] as Array<[string, number | null]>).filter(([, value]) => value != null).map(([label, value]) => <div key={label}><span>{label}</span><strong>{formatToman(value!)}</strong></div>)}{!Object.values(c.budgets).some((value) => value != null) ? <span>بودجه ثبت نشده است.</span> : null}</div></section>
          <section className="admin-360-card"><h3><MessageCircle size={16} /> فعالیت‌ها</h3><div className="admin-360-timeline">{payload?.activities.slice(0, 12).map((item) => <article key={item.id}><strong>{item.title || item.type}</strong><small>{dateLabel(item.createdAt)}</small>{item.note ? <p>{item.note}</p> : null}</article>)}{!payload?.activities.length ? <span>هنوز فعالیتی ثبت نشده است.</span> : null}</div></section>
          <section className="admin-360-card"><h3><BriefcaseBusiness size={16} /> معاملات</h3><div className="admin-360-list">{payload?.deals.map((deal) => <article key={deal.id}><div><strong>{deal.title}</strong><small>{deal.dealType} · {deal.status}{deal.contractNumber ? " · قرارداد " + deal.contractNumber : ""}</small></div><b>{deal.amount == null ? "—" : formatToman(deal.amount)}</b></article>)}{!payload?.deals.length ? <span>هنوز معامله‌ای متصل نیست.</span> : null}</div>{payload?.deals.length ? <small className="admin-360-total">حجم کل: {formatToman(totalVolume)}</small> : null}</section>
          <section className="admin-360-card"><h3><FileText size={16} /> مدارک قرارداد</h3><div className="admin-360-list">{payload?.documents.map((doc) => <article key={doc.id}><div><strong>{doc.type}</strong><small>{docLabel(doc.status)}{doc.note ? " · " + doc.note : ""}</small></div>{doc.fileUrl ? <a className="text-link" href={doc.fileUrl} target="_blank" rel="noreferrer">فایل</a> : null}</article>)}{!payload?.documents.length ? <span>مدرک مرتبط ثبت نشده است.</span> : null}</div></section>
          <section className="admin-360-card"><h3><WalletCards size={16} /> کمیسیون</h3><div className="admin-360-list">{payload?.settlements.map((item) => <article key={item.id}><div><strong>{item.consultant}</strong><small>{item.status} · کمیسیون {formatToman(item.commissionAmount)}</small></div><b>{formatToman(item.consultantShare)}</b></article>)}{!payload?.settlements.length ? <span>تسویه‌ای ثبت نشده است.</span> : null}</div>{payload?.settlements.length ? <small className="admin-360-total">سهم باز مشاور: {formatToman(due)}</small> : null}</section>
        </div>
      </> : null}
    </section>
  );
}
