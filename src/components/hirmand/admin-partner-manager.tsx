import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Check,
  CheckCircle2,
  Copy,
  Download,
  Gift,
  Handshake,
  History,
  KeyRound,
  Plus,
  Printer,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Ticket,
  UsersRound,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import type { PartnerContract, PartnerOverview, PartnerSummary } from "@/lib/partner-program.server";
import { partnerPortalUrl, partnerQrImageUrl } from "@/lib/partner-links";

type CreateForm = { agencyName: string; contactName: string; phone: string };
const EMPTY_FORM: CreateForm = { agencyName: "", contactName: "", phone: "" };

const TX_LABEL: Record<string, string> = {
  buy: "درخواست خرید",
  sell: "فروش",
  rent: "اجاره",
  mortgage: "رهن",
};
const STATUS_LABEL: Record<string, string> = { active: "فعال", suspended: "غیرفعال" };
const CONTRACT_STATUS_LABEL: Record<string, string> = {
  pending: "در انتظار تأیید",
  approved: "تأییدشده",
  rejected: "ردشده",
};

function faDate(value: string | null | undefined) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("fa-IR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Tehran",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function StampCard({ stamps, cardNumber }: { stamps: number; cardNumber: number }) {
  const nextStamp = stamps % 3 === 0 ? 3 : 3 - (stamps % 3);
  return (
    <div className="admin-partner-stamp-panel">
      <div className="admin-partner-stamp-head">
        <div>
          <span className="kicker">کارت همکاری</span>
          <strong>کارت شماره {cardNumber.toLocaleString("fa-IR")}</strong>
        </div>
        <span className="admin-partner-stamp-count">{stamps.toLocaleString("fa-IR")} / ۱۲ مهر</span>
      </div>
      <div className="admin-partner-stamp-grid" aria-label="کارت ۱۲ مهر">
        {Array.from({ length: 12 }, (_, index) => {
          const filled = index < stamps;
          return (
            <span key={index} className={"admin-partner-stamp" + (filled ? " is-filled" : "")}>
              {filled ? <Check size={15} strokeWidth={3} /> : index + 1}
            </span>
          );
        })}
      </div>
      <small>
        هر ۳ مهر = یک ثبت رایگان.{" "}
        {stamps >= 12
          ? "کارت کامل شده و آماده صدور کارت بعدی است."
          : String(nextStamp.toLocaleString("fa-IR")) + " قرارداد تا مهر/پاداش بعدی باقی مانده است."}
      </small>
    </div>
  );
}

const PARTNER_CSS = `
.admin-partners-wrap{display:flex;flex-direction:column;gap:16px;max-width:1380px;margin:0 auto}
.admin-partner-create .btn-gold{margin-top:14px}
.admin-partner-create p{margin:12px 2px 14px;line-height:1.9;font-size:.82rem;color:rgb(0 0 0 / .62)}
.admin-partner-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;padding:18px 20px}
.admin-partner-card{display:flex;flex-direction:column;gap:12px;border:1px solid rgb(0 0 0 / .1);border-radius:16px;background:rgb(0 0 0 / .02);padding:15px;transition:border-color .15s,background .15s}
.admin-partner-card:hover{border-color:#111315}
.admin-partner-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
.admin-partner-card-head h3{margin:5px 0 3px;font-size:.95rem;font-weight:700;color:#111315}
.admin-partner-card-head p{margin:0;font-size:.76rem;color:rgb(0 0 0 / .56)}
.admin-partner-code{display:inline-block;padding:2px 9px;border-radius:8px;background:#111315;color:#f7f5ef;font:700 .78rem ui-monospace,monospace;letter-spacing:.06em}
.admin-partner-status{display:inline-flex;align-items:center;flex-shrink:0;padding:3px 9px;border-radius:999px;font-size:.68rem;font-weight:700;border:1px solid rgb(0 0 0 / .12);background:rgb(0 0 0 / .05);color:#111315}
.admin-partner-status.status-suspended{background:rgba(150,50,50,.1);border-color:rgba(150,50,50,.3);color:#8f3232}
.admin-partner-status.status-rejected{background:rgba(150,50,50,.1);border-color:rgba(150,50,50,.3);color:#8f3232}
.admin-partner-status.status-approved{background:rgba(24,122,88,.1);border-color:rgba(24,122,88,.3);color:#17603f}
.admin-partner-status.status-pending{background:rgba(154,99,47,.1);border-color:rgba(154,99,47,.32);color:#6f4318}
.admin-partner-stamp-panel{border:1px solid rgb(0 0 0 / .1);border-radius:13px;background:rgb(0 0 0 / .02);padding:12px}
.admin-partner-stamp-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px}
.admin-partner-stamp-head .kicker{display:block;font-size:.64rem;color:#5f6b74;font-weight:700;letter-spacing:.06em;margin-bottom:2px}
.admin-partner-stamp-head strong{font-size:.82rem;color:#111315}
.admin-partner-stamp-count{font-size:.7rem;font-weight:700;color:#111315}
.admin-partner-stamp-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:7px}
.admin-partner-stamp{aspect-ratio:1;display:grid;place-items:center;border:1.5px dashed rgb(0 0 0 / .3);border-radius:10px;font-size:.68rem;font-weight:700;color:rgb(0 0 0 / .4)}
.admin-partner-stamp.is-filled{border-style:solid;border-color:#111315;background:#111315;color:#f7f5ef}
.admin-partner-stamp-panel small{display:block;margin-top:9px;font-size:.68rem;color:rgb(0 0 0 / .55);line-height:1.7}
.admin-partner-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
.admin-partner-metrics>div{padding:8px 10px;border-radius:10px;background:rgb(0 0 0 / .03)}
.admin-partner-metrics span{display:block;font-size:.64rem;color:rgb(0 0 0 / .5);margin-bottom:3px}
.admin-partner-metrics strong{font-size:.8rem;color:#111315}
.admin-partner-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:auto}
.admin-partner-credentials{margin-top:16px;border:1px solid rgba(24,122,88,.35);border-radius:14px;background:rgba(24,122,88,.07);padding:14px}
.admin-partner-credentials>div:first-child small{display:block;font-size:.68rem;color:rgb(0 0 0 / .55)}
.admin-partner-credentials>div:first-child strong{display:block;font-size:.92rem;margin-top:2px;color:#14503a}
.admin-partner-credential-grid{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:11px 0}
.admin-partner-credential-grid button{display:flex;align-items:center;justify-content:space-between;gap:8px;border:1px solid rgb(0 0 0 / .12);border-radius:12px;background:#fff;padding:10px 12px;cursor:pointer;font:inherit;text-align:right;transition:border-color .15s}
.admin-partner-credential-grid button:hover{border-color:#111315}
.admin-partner-credential-grid button span{display:flex;align-items:center;gap:5px;font-size:.68rem;color:rgb(0 0 0 / .56)}
.admin-partner-credential-grid button strong{font:700 .84rem ui-monospace,monospace;color:#111315}
.admin-partner-credential-grid button svg{color:rgb(0 0 0 / .4);flex-shrink:0}
.admin-partner-credentials p{margin:0;font-size:.68rem;color:rgb(0 0 0 / .55);line-height:1.7}
.admin-partner-contract-list{display:flex;flex-direction:column}
.admin-partner-contract{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 20px;border-bottom:1px solid rgb(0 0 0 / .07);flex-wrap:wrap}
.admin-partner-contract:last-child{border-bottom:0}
.admin-partner-contract-main{display:flex;flex-direction:column;gap:3px;min-width:220px}
.admin-partner-contract-main strong{font-size:.88rem;color:#111315}
.admin-partner-contract-main span{font-size:.78rem;color:rgb(0 0 0 / .6)}
.admin-partner-contract-main small{font-size:.7rem;color:rgb(0 0 0 / .48)}
.admin-partner-contract-code{display:inline-flex;align-items:center;gap:5px;width:max-content;padding:2px 8px;border-radius:8px;background:#111315;color:#f7f5ef;font:700 .72rem ui-monospace,monospace;letter-spacing:.05em}
.admin-partner-contract-actions{display:flex;gap:8px;flex-wrap:wrap}
.admin-partner-detail-head-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.admin-partner-digital-card{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);gap:16px;padding:18px 20px}
.admin-partner-qr{display:grid;grid-template-columns:minmax(0,1fr) 150px;gap:14px;align-items:center;border:1px solid rgb(0 0 0 / .1);border-radius:14px;background:rgb(0 0 0 / .02);padding:14px}
.admin-partner-qr h3{margin:4px 0 6px;font-size:.92rem;color:#111315}
.admin-partner-qr p{margin:0 0 10px;font-size:.74rem;line-height:1.8;color:rgb(0 0 0 / .58)}
.admin-partner-qr img{width:150px;height:150px;border-radius:12px;background:#fff;border:1px solid rgb(0 0 0 / .1);justify-self:center}
.admin-partner-history{border-top:1px solid rgb(0 0 0 / .08)}
.admin-partner-history .admin-panel-head{padding:14px 20px}
.admin-partner-history h3{margin:0;font-size:.92rem;font-weight:700}
.admin-partner-audit-list{display:flex;flex-direction:column;padding:4px 20px 14px}
.admin-partner-audit-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px dashed rgb(0 0 0 / .08);font-size:.78rem;flex-wrap:wrap}
.admin-partner-audit-row:last-child{border-bottom:0}
.admin-partner-audit-row strong{color:#111315;font-size:.78rem}
.admin-partner-audit-row span{color:rgb(0 0 0 / .55);font-size:.72rem}

/* Admin 3.0 module override */
.admin-partners-wrap{color:#122333!important}.admin-partner-create p,.admin-partner-card-head p,.admin-partner-stamp-panel small,.admin-partner-metrics span,.admin-partner-qr p,.admin-partner-audit-row span,.admin-partner-credentials p{color:#66717d!important}
.admin-partner-card,.admin-partner-stamp-panel,.admin-partner-qr{background:#fbfcfd!important;border-color:#dde4ea!important}
.admin-partner-card:hover{border-color:#c6b083!important;background:#fffdf9!important}
.admin-partner-code,.admin-partner-contract-code{background:#122333!important;color:#fff!important}
.admin-partner-status{background:#f2f4f7!important;color:#344054!important}
.admin-partner-stamp.is-filled{background:#c08a2a!important;color:#fff!important;border-color:#c08a2a!important}
.admin-partner-metrics>div{background:#f3f6f8!important}.admin-partner-credential-grid button{background:#fff!important;border-color:#d5dde5!important}
.admin-partner-actions .btn-gold{background:linear-gradient(135deg,#8a5e14,#c08a2a)!important;color:#fff!important}
@media(max-width:640px){.admin-partner-grid{grid-template-columns:1fr!important;padding:13px!important}.admin-partner-digital-card{grid-template-columns:1fr!important;padding:13px!important}.admin-partner-qr{grid-template-columns:1fr!important}.admin-partner-qr img{width:132px;height:132px}.admin-partner-credential-grid{grid-template-columns:1fr!important}.admin-partner-contract{padding:12px 13px!important}}
`;

export function AdminPartnerManager() {
  const [partners, setPartners] = useState<PartnerSummary[]>([]);
  const [pending, setPending] = useState<PartnerContract[]>([]);
  const [selected, setSelected] = useState<PartnerOverview | null>(null);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState("");
  const [credentials, setCredentials] = useState<{ code: string; pin: string; agency: string } | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "suspended">("all");
  const [selectedAudits, setSelectedAudits] = useState<Array<{
    id: string;
    action: string;
    actor: string;
    targetId: string | null;
    note: string;
    createdAt: string;
  }>>([]);

  async function api<T>(body: Record<string, unknown>): Promise<T> {
    const response = await fetch("/api/admin/partners", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    });
    const data = (await response.json().catch(() => null)) as { statusMessage?: string; message?: string } & T;
    if (!response.ok) throw new Error(data?.statusMessage || data?.message || "عملیات انجام نشد.");
    return data;
  }

  async function load(showSpinner = true) {
    if (showSpinner) setLoading(true);
    try {
      const data = await api<{ partners: PartnerSummary[]; pendingContracts: PartnerContract[] }>({ action: "list" });
      setPartners(data.partners);
      setPending(data.pendingContracts);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "بارگذاری همکاران انجام نشد.");
    } finally {
      setLoading(false);
    }
  }

  // The loader is intentionally called once on mount; its function identity changes with render state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return partners.filter((item) => {
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      const matchesSearch = !q || [item.agencyName, item.contactName, item.phone, item.partnerCode].join(" ").toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [partners, search, statusFilter]);

  async function createPartner() {
    if (!form.agencyName.trim() || !form.contactName.trim() || !form.phone.trim()) {
      toast.error("نام املاک، مسئول و شماره تماس را کامل کنید.");
      return;
    }
    setCreating(true);
    try {
      const data = await api<{ created: { summary: PartnerSummary; partnerCode: string; pin: string } }>({
        action: "create",
        ...form,
      });
      setCredentials({
        code: data.created.partnerCode,
        pin: data.created.pin,
        agency: data.created.summary.agencyName,
      });
      setForm(EMPTY_FORM);
      toast.success("حساب همکاری ساخته شد.");
      await load(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ساخت حساب انجام نشد.");
    } finally {
      setCreating(false);
    }
  }

  async function inspectPartner(id: string) {
    setBusy("details:" + id);
    try {
      const data = await api<{
        partner: PartnerOverview;
        contracts: PartnerContract[];
        audits: Array<{
          id: string;
          action: string;
          actor: string;
          targetId: string | null;
          note: string;
          createdAt: string;
        }>;
      }>({ action: "details", partnerId: id });
      setSelected({ ...data.partner, contracts: data.contracts });
      setSelectedAudits(data.audits ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "جزئیات همکار خوانده نشد.");
    } finally {
      setBusy("");
    }
  }

  async function approve(id: string) {
    setBusy(id);
    try {
      await api({ action: "approve", contractId: id });
      toast.success("قرارداد تأیید شد و مهر ثبت شد.");
      await load(false);
      if (selected) await inspectPartner(selected.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تأیید انجام نشد.");
    } finally {
      setBusy("");
    }
  }

  async function reject(id: string) {
    const note = window.prompt("دلیل رد قرارداد را وارد کنید:", "");
    if (note === null) return;
    setBusy(id);
    try {
      await api({ action: "reject", contractId: id, note });
      toast.success("قرارداد رد شد.");
      await load(false);
      if (selected) await inspectPartner(selected.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "رد قرارداد انجام نشد.");
    } finally {
      setBusy("");
    }
  }

  async function newCard() {
    if (!selected) return;
    setBusy("card:" + selected.id);
    try {
      await api<{ partner: PartnerOverview }>({ action: "new-card", partnerId: selected.id });
      await inspectPartner(selected.id);
      await load(false);
      toast.success("کارت جدید صادر شد و شمارنده کارت از صفر شروع شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "صدور کارت جدید انجام نشد.");
    } finally {
      setBusy("");
    }
  }

  async function claimRewardForSelected() {
    if (!selected) return;
    const note = window.prompt("توضیح مصرف پاداش (اختیاری):", "") ?? "";
    setBusy("reward:" + selected.id);
    try {
      await api<{ partner: PartnerOverview }>({
        action: "claim-reward",
        partnerId: selected.id,
        note,
      });
      await inspectPartner(selected.id);
      await load(false);
      toast.success("یک پاداش به‌عنوان مصرف‌شده ثبت شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "مصرف پاداش ثبت نشد.");
    } finally {
      setBusy("");
    }
  }

  async function claimRewardFor(id: string) {
    setBusy("reward:" + id);
    try {
      await api<{ partner: PartnerOverview }>({
        action: "claim-reward",
        partnerId: id,
        note: "ثبت مصرف از پنل مدیریت",
      });
      await inspectPartner(id);
      await load(false);
      toast.success("پاداش مصرف شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "مصرف پاداش انجام نشد.");
    } finally {
      setBusy("");
    }
  }

  async function toggleStatus(partner: PartnerSummary | PartnerOverview) {
    const next = partner.status === "active" ? "suspended" : "active";
    setBusy("status:" + partner.id);
    try {
      const data = await api<{ partner: PartnerOverview }>({ action: "status", partnerId: partner.id, status: next });
      setSelected(data.partner);
      await load(false);
      toast.success("حساب " + STATUS_LABEL[next] + " شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تغییر وضعیت انجام نشد.");
    } finally {
      setBusy("");
    }
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("کپی شد.");
    } catch {
      toast.error("کپی خودکار در این مرورگر در دسترس نیست.");
    }
  }
  function exportPartnersCsv() {
    const csvCell = (value: string | number) => `"${String(value).replaceAll('"', '""').replaceAll("\r", " ").replaceAll("\n", " ")}"`;
    const rows = [
      ["کد همکاری", "نام املاک", "مسئول", "تلفن", "وضعیت", "قرارداد تأییدشده", "پاداش آماده", "در انتظار", "کارت"],
      ...partners.map((item) => [
        item.partnerCode,
        item.agencyName,
        item.contactName,
        item.phone,
        STATUS_LABEL[item.status],
        item.contractCount,
        item.availableRewards,
        item.pendingContracts,
        `${item.cardNumber} / ۱۲ · ${item.cardStamps} مهر`,
      ]),
    ];
    const csv = "\uFEFF" + rows.map((row) => row.map((value) => csvCell(value)).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `hirmand-partners-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success("گزارش همکاران خروجی گرفته شد.");
  }

  function printPartnerCard(partner: PartnerSummary | PartnerOverview) {
    const portal = partnerPortalUrl(partner.partnerCode);
    const qr = partnerQrImageUrl(partner.partnerCode);
    const boxes = Array.from({ length: 12 }, (_, index) =>
      "<span class=\"stamp" + (index < partner.cardStamps ? " filled" : "") + "\">" +
      (index < partner.cardStamps ? "✓" : String(index + 1)) +
      "</span>"
    ).join("");
    const popup = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
    if (!popup) {
      toast.error("پنجره چاپ توسط مرورگر مسدود شد.");
      return;
    }
    popup.document.write(`
      <!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">
      <title>کارت همکاری ${partner.agencyName}</title>
      <style>
        *{box-sizing:border-box}body{margin:0;padding:28px;background:#eef2f5;color:#122333;font-family:Tahoma,Arial,sans-serif}
        .card{width:860px;max-width:100%;margin:auto;padding:28px;border:1px solid #d5dde5;border-radius:28px;background:linear-gradient(145deg,#fffaf2,#fff);box-shadow:0 20px 55px rgba(8,19,32,.12);page-break-inside:avoid}
        .top{display:flex;justify-content:space-between;gap:24px;align-items:flex-start}.brand{font-weight:800;font-size:24px;color:#122333}.muted{color:#66717d;font-size:13px;line-height:1.8}.code{font:700 16px ui-monospace,monospace;letter-spacing:.08em;color:#8a5e14}
        .qr{width:154px;height:154px;border-radius:18px;background:#fff;padding:8px;border:1px solid #d9e1e8}.grid{display:grid;grid-template-columns:repeat(12,1fr);gap:9px;margin:28px 0 12px}.stamp{aspect-ratio:1;display:grid;place-items:center;border:2px dashed #cbd5df;border-radius:12px;color:#66717d;font-weight:800}.stamp.filled{border-style:solid;background:#c08a2a;color:#fff;border-color:#c08a2a}
        .bottom{display:flex;justify-content:space-between;gap:18px;align-items:end;margin-top:16px}.rule{font-weight:700;color:#8a5e14}.url{font:12px ui-monospace,monospace;direction:ltr;word-break:break-all;color:#66717d}
        @media print{body{padding:0;background:#fff}.card{box-shadow:none;color:#122333;background:#fff;border-color:#cbd5df}.muted,.url{color:#475467}.code,.rule{color:#8a5e14}.stamp{border-color:#cbd5df;color:#66717d}.stamp.filled{background:#c08a2a;color:#fff;border-color:#c08a2a}}
      </style></head><body onload="setTimeout(()=>window.print(),250)">
      <div class="card">
        <div class="top"><div><div class="brand">گروه مشاورین املاک هیرمند</div><div class="muted">باشگاه همکاران · کارت ۱۲ مهر</div><div style="margin-top:18px" class="code">${partner.partnerCode}</div><div class="muted">${partner.agencyName} · ${partner.contactName}</div></div>
        <img class="qr" src="${qr}" alt="QR"></div>
        <div class="grid">${boxes}</div>
        <div class="bottom"><div><div class="rule">هر ۳ قرارداد تأییدشده = یک ثبت قرارداد رایگان</div><div class="muted" style="margin-top:6px">اسکن QR برای ورود به سامانه همکاری</div></div><div class="url">${portal}</div></div>
      </div></body></html>
    `);
    popup.document.close();
  }

  if (loading) {
    return (
      <section className="admin-panel">
        <div className="admin-empty">
          <RefreshCw size={25} className="admin-spin" />
          <strong>در حال بارگذاری باشگاه همکاران...</strong>
        </div>
      </section>
    );
  }

  return (
    <div className="admin-partners-wrap">
      <style>{PARTNER_CSS}</style>
      <div className="admin-dashboard-grid">
        <section className="admin-panel admin-partner-create">
          <div className="admin-panel-head">
            <div>
              <span className="kicker">همکار جدید</span>
              <h2>ساخت حساب املاک</h2>
            </div>
            <Handshake size={22} />
          </div>
          <p className="admin-dashboard-summary">
            برای هر دفتر یک کد همکاری و رمز ۶ رقمی ساخته می‌شود. این اطلاعات را امن به همکار بدهید و روی کارت او قرار دهید.
          </p>
          <div className="admin-form-grid">
            <label className="field">
              <span>نام املاک</span>
              <input value={form.agencyName} onChange={(e) => setForm({ ...form, agencyName: e.target.value })} />
            </label>
            <label className="field">
              <span>نام مسئول</span>
              <input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
            </label>
            <label className="field admin-span-2">
              <span>شماره تماس</span>
              <input inputMode="tel" dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </label>
          </div>
          <button type="button" className="btn-gold" onClick={() => void createPartner()} disabled={creating}>
            {creating ? <RefreshCw size={16} className="admin-spin" /> : <Plus size={16} />}
            ساخت حساب و تولید کد
          </button>

          {credentials ? (
            <div className="admin-partner-credentials">
              <div><small>حساب ساخته شد</small><strong>{credentials.agency}</strong></div>
              <div className="admin-partner-credential-grid">
                <button type="button" onClick={() => void copy(credentials.code)} title="کپی کد همکاری">
                  <span><KeyRound size={16} /> کد همکاری</span>
                  <strong dir="ltr">{credentials.code}</strong>
                  <Copy size={15} />
                </button>
                <button type="button" onClick={() => void copy(credentials.pin)} title="کپی رمز ورود">
                  <span><KeyRound size={16} /> رمز ۶ رقمی</span>
                  <strong dir="ltr">{credentials.pin}</strong>
                  <Copy size={15} />
                </button>
              </div>
              <p>رمز فقط هنگام ساخت حساب نمایش داده می‌شود؛ آن را امن تحویل همکار بدهید.</p>
            </div>
          ) : null}
        </section>

        <section className="admin-panel">
          <div className="admin-panel-head">
            <div>
              <span className="kicker">وضعیت همکاری</span>
              <h2>خلاصه باشگاه</h2>
            </div>
            <button type="button" className="btn-ghost" onClick={() => void load()} disabled={loading}>
              <RefreshCw size={15} /> تازه‌سازی
            </button>
          </div>
          <div className="admin-dashboard-mini-grid">
            <div><span>دفاتر همکار</span><strong>{partners.length.toLocaleString("fa-IR")}</strong></div>
            <div><span>فعال</span><strong>{partners.filter((p) => p.status === "active").length.toLocaleString("fa-IR")}</strong></div>
            <div><span>قرارداد در انتظار</span><strong>{pending.length.toLocaleString("fa-IR")}</strong></div>
            <div><span>پاداش آماده</span><strong>{partners.reduce((sum, p) => sum + p.availableRewards, 0).toLocaleString("fa-IR")}</strong></div>
          </div>
          <p className="admin-dashboard-summary">تأیید هر قرارداد = یک مهر. قرارداد سوم، ششم، نهم و دوازدهم، پاداش جدید ایجاد می‌کند.</p>
        </section>
      </div>

      <section className="admin-panel">
        <div className="admin-panel-head">
          <div><span className="kicker">دفاتر همکار</span><h2>{filtered.length.toLocaleString("fa-IR")} حساب</h2></div>
          <div className="admin-partner-toolbar">
  <label className="admin-search" style={{ maxWidth: 420 }}>
    <UsersRound size={16} />
    <input value={search} onChange={(e) => setSearch(e.target.value)} aria-label="جستجوی دفاتر همکار" placeholder="جستجوی نام املاک، مسئول، تلفن یا کد..." />
  </label>
  <select className="admin-partner-status-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "suspended")} aria-label="فیلتر وضعیت حساب">
    <option value="all">همه حساب‌ها</option>
    <option value="active">فعال</option>
    <option value="suspended">غیرفعال</option>
  </select>
  <button type="button" className="btn-ghost admin-partner-export" onClick={exportPartnersCsv} disabled={partners.length === 0}>
    <Download size={15} /> خروجی CSV
  </button>
</div>
        </div>

        {filtered.length === 0 ? (
          <div className="admin-empty"><Handshake size={26} /><strong>هنوز همکاری ثبت نشده</strong><p>اولین دفتر را از فرم بالا بسازید.</p></div>
        ) : (
          <div className="admin-partner-grid">
            {filtered.map((partner) => {
              const next = partner.contractCount % 3 === 0 ? 3 : 3 - (partner.contractCount % 3);
              return (
                <article key={partner.id} className="admin-partner-card" data-status={partner.status}>
                  <div className="admin-partner-card-head">
                    <div>
                      <span className="admin-partner-code" dir="ltr">{partner.partnerCode}</span>
                      <h3>{partner.agencyName}</h3>
                      <p>{partner.contactName} · {partner.phone}</p>
                    </div>
                    <span className={"admin-partner-status status-" + partner.status}>{STATUS_LABEL[partner.status]}</span>
                  </div>
                  <StampCard stamps={partner.cardStamps} cardNumber={partner.cardNumber} />
                  <div className="admin-partner-metrics">
                    <div><span>قرارداد تأییدشده</span><strong>{partner.contractCount.toLocaleString("fa-IR")}</strong></div>
                    <div><span>پاداش آماده</span><strong>{partner.availableRewards.toLocaleString("fa-IR")}</strong></div>
                    <div><span>در انتظار</span><strong>{partner.pendingContracts.toLocaleString("fa-IR")}</strong></div>
                    <div><span>تا پاداش بعدی</span><strong>{next.toLocaleString("fa-IR")} قرارداد</strong></div>
                  </div>
                  <div className="admin-partner-actions">
                    <button type="button" className="btn-ghost" onClick={() => void inspectPartner(partner.id)} disabled={busy === "details:" + partner.id}>
                      {busy === "details:" + partner.id ? <RefreshCw size={15} className="admin-spin" /> : <History size={15} />}
                      جزئیات
                    </button>
                    {partner.availableRewards > 0 ? (
                      <button type="button" className="btn-gold" onClick={() => void claimRewardFor(partner.id)} disabled={Boolean(busy)}>
                        <Gift size={15} /> ثبت مصرف رایگان
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="admin-panel">
        <div className="admin-panel-head">
          <div><span className="kicker">قراردادهای ورودی</span><h2>{pending.length.toLocaleString("fa-IR")} مورد در انتظار</h2></div>
          <span className="admin-dashboard-summary">تأیید = مهر روی کارت</span>
        </div>

        {pending.length === 0 ? (
          <div className="admin-empty"><BadgeCheck size={26} /><strong>قرارداد معوقی ندارید</strong><p>هر قرارداد جدید همکار در اینجا برای تأیید نمایش داده می‌شود.</p></div>
        ) : (
          <div className="admin-partner-contract-list">
            {pending.map((contract) => (
              <article key={contract.id} className="admin-partner-contract">
                <div className="admin-partner-contract-main">
                  <button type="button" className="admin-partner-contract-code" dir="ltr" onClick={() => void copy(contract.trackingCode)} title="کپی کد رهگیری"><Ticket size={15} /> {contract.trackingCode} <Copy size={13} /></button>
                  <strong>{contract.agencyName}</strong>
                  <span>{TX_LABEL[contract.transactionType]}{contract.contractReference ? " · " + contract.contractReference : ""}</span>
                  <small>{contract.clientName ? "مشتری: " + contract.clientName + " · " : ""}{faDate(contract.createdAt)}</small>
                </div>
                <div className="admin-partner-contract-actions">
                  <button type="button" className="btn-gold" onClick={() => void approve(contract.id)} disabled={Boolean(busy)}>
                    {busy === contract.id ? <RefreshCw size={15} className="admin-spin" /> : <CheckCircle2 size={15} />}
                    تأیید و مهر
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => void reject(contract.id)} disabled={Boolean(busy)}>
                    <XCircle size={15} /> رد
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {selected ? (
        <section className="admin-panel admin-partner-detail">
          <div className="admin-panel-head">
            <div>
              <span className="kicker">پرونده همکار</span>
              <h2>{selected.agencyName}</h2>
              <p>{selected.contactName} · {selected.phone} · {selected.partnerCode}</p>
            </div>
            <div className="admin-partner-detail-head-actions">
              <button type="button" className="btn-ghost" onClick={() => printPartnerCard(selected)}>
                <Printer size={15} /> چاپ کارت
              </button>
              <button type="button" className="btn-ghost" onClick={() => void toggleStatus(selected)} disabled={Boolean(busy)}>
                <ShieldCheck size={15} /> {selected.status === "active" ? "غیرفعال‌کردن" : "فعال‌کردن"}
              </button>
              {selected.cardStamps >= 12 ? (
                <button type="button" className="btn-gold" onClick={() => void newCard()} disabled={Boolean(busy)}>
                  <Plus size={15} /> صدور کارت جدید
                </button>
              ) : null}
              {selected.availableRewards > 0 ? (
                <button type="button" className="btn-gold" onClick={() => void claimRewardForSelected()} disabled={Boolean(busy)}>
                  <Gift size={15} /> ثبت مصرف پاداش
                </button>
              ) : null}
            </div>
          </div>

          <div className="admin-partner-digital-card">
            <StampCard stamps={selected.cardStamps} cardNumber={selected.cardNumber} />
            <div className="admin-partner-qr">
              <div>
                <span className="kicker">QR اختصاصی همکار</span>
                <h3>ورود سریع به سامانه</h3>
                <p>این QR را روی کارت ویزیت همان املاک چاپ کنید؛ با اسکن، کد همکاری به‌صورت خودکار وارد می‌شود.</p>
                <a href={partnerPortalUrl(selected.partnerCode)} target="_blank" rel="noreferrer" className="text-link">
                  <QrCode size={15} /> باز کردن لینک
                </a>
              </div>
              <img src={partnerQrImageUrl(selected.partnerCode)} alt={"QR ورود " + selected.agencyName} />
            </div>
          </div>

          <div className="admin-dashboard-mini-grid">
            <div><span>کل قرارداد تأییدشده</span><strong>{selected.contractCount.toLocaleString("fa-IR")}</strong></div>
            <div><span>پاداش کسب‌شده</span><strong>{selected.rewardsEarned.toLocaleString("fa-IR")}</strong></div>
            <div><span>پاداش قابل استفاده</span><strong>{selected.availableRewards.toLocaleString("fa-IR")}</strong></div>
            <div><span>آخرین ورود</span><strong>{selected.lastLoginAt ? faDate(selected.lastLoginAt) : "هنوز وارد نشده"}</strong></div>
          </div>

          <div className="admin-partner-history">
            <div className="admin-panel-head">
              <div><span className="kicker">لاگ مدیریتی</span><h3>تاریخچه عملیات</h3></div>
            </div>
            {selectedAudits.length === 0 ? (
              <div className="admin-empty"><History size={22} /><strong>هنوز عملیات مدیریتی ثبت نشده</strong></div>
            ) : (
              <div className="admin-partner-audit-list">
                {selectedAudits.slice(0, 20).map((audit) => {
                  const labels: Record<string, string> = {
                    account_created: "ساخت حساب",
                    contract_approved: "تأیید قرارداد و مهر",
                    contract_rejected: "رد قرارداد",
                    card_issued: "صدور کارت جدید",
                    reward_claimed: "مصرف پاداش",
                    account_activated: "فعال‌سازی حساب",
                    account_suspended: "غیرفعال‌سازی حساب",
                  };
                  return (
                    <div key={audit.id} className="admin-partner-audit-row">
                      <strong>{labels[audit.action] ?? audit.action}</strong>
                      <span>{audit.note || "بدون توضیح"} · {faDate(audit.createdAt)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="admin-partner-history">
            <div className="admin-panel-head"><div><span className="kicker">تاریخچه</span><h3>قراردادهای این همکار</h3></div></div>
            {selected.contracts.length === 0 ? (
              <div className="admin-empty"><History size={22} /><strong>هنوز قراردادی ثبت نشده</strong></div>
            ) : (
              <div className="admin-partner-contract-list">
                {selected.contracts.map((contract) => (
                  <article key={contract.id} className="admin-partner-contract">
                    <div className="admin-partner-contract-main">
                      <button type="button" className="admin-partner-contract-code" dir="ltr" onClick={() => void copy(contract.trackingCode)} title="کپی کد رهگیری"><Ticket size={15} /> {contract.trackingCode} <Copy size={13} /></button>
                      <strong>{CONTRACT_STATUS_LABEL[contract.status]}</strong>
                      <span>{TX_LABEL[contract.transactionType]}{contract.contractReference ? " · " + contract.contractReference : ""}</span>
                      <small>{contract.clientName || "بدون نام مشتری"} · {faDate(contract.createdAt)}</small>
                      {contract.decisionNote ? <small>یادداشت: {contract.decisionNote}</small> : null}
                    </div>
                    <span className={"admin-partner-status status-" + contract.status}>{CONTRACT_STATUS_LABEL[contract.status]}</span>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
