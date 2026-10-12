import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CheckCircle2, Download, ExternalLink, Eye, Film, History, ImageIcon, ListChecks, MapPin, Phone, Pencil, RefreshCw, Save, Search, Star, Timer, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { TEAM } from "@/lib/site";
import { formatToman } from "@/lib/money";
import { isVideoUrl } from "@/lib/media";
import { getPublishReadiness } from "@/lib/property-publish-readiness";
import "./admin-customer-property-submissions.css";

type Submission = {
  id: string;
  leadId: string | null;
  trackingToken: string;
  status: string;
  ownerName: string;
  ownerPhone: string;
  propertyData: Record<string, unknown>;
  reviewNote: string;
  propertyId: string | null;
  createdAt: string;
  reviewedAt: string | null;
  possibleDuplicate?: boolean;
  priority?: "low" | "normal" | "high";
  updatedAt?: string | null;
  ageHours?: number;
  assignedConsultantName?: string | null;
  assignedConsultantPhone?: string | null;
};

function faDate(value: string) {
  try {
    return new Intl.DateTimeFormat("fa-IR", { dateStyle:"short", timeStyle:"short", timeZone:"Asia/Tehran" }).format(new Date(value));
  } catch { return value; }
}

function priceText(data: Record<string, unknown>) {
  const tx = String(data.transactionType ?? "");
  const price = data.price ? formatToman(Number(data.price)) : "";
  const deposit = data.deposit ? formatToman(Number(data.deposit)) : "";
  const rent = data.rent ? formatToman(Number(data.rent)) : "";
  if (tx === "sell" && price) return "قیمت: " + price + " تومان";
  if (tx === "rent") return ["رهن: " + (deposit || "—") + " تومان", "اجاره: " + (rent || "—") + " تومان"].join(" · ");
  if (tx === "mortgage" && deposit) return "رهن: " + deposit + " تومان";
  return price || deposit || rent || "قیمت ثبت نشده";
}

function labelTransaction(value: unknown) {
  return ({ buy:"خرید", sell:"فروش", rent:"اجاره", mortgage:"رهن" } as Record<string,string>)[String(value ?? "")] ?? String(value ?? "—");
}

function labelType(value: unknown) {
  return ({ apartment:"آپارتمان", villa:"ویلا و باغ", office:"اداری", heritage:"خانه اصیل", land:"زمین", commercial:"تجاری" } as Record<string,string>)[String(value ?? "")] ?? String(value ?? "—");
}

function mediaItems(data: Record<string, unknown>) {
  return Array.isArray(data.images) ? data.images.filter((v): v is string => typeof v === "string") : [];
}

export function AdminCustomerPropertySubmissions() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [consultant, setConsultant] = useState<(typeof TEAM)[number]>(TEAM[0]);
  const [selected, setSelected] = useState<Submission | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "rejected">("pending");
  const [searchQuery, setSearchQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [counts, setCounts] = useState({ pending: 0, approved: 0, rejected: 0 });
  const [queueFilter, setQueueFilter] = useState<"all"|"overdue"|"unassigned"|"high">("all");
  const [queueStats, setQueueStats] = useState({ overdue: 0, highPriority: 0, unassigned: 0, averageAgeHours: 0, consultants: [] as Array<{name:string;phone:string;count:number}> });
  const [editDraft, setEditDraft] = useState<Record<string, unknown> | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyEvents, setHistoryEvents] = useState<Array<{ id:string; action:string; note:string; createdAt:string }>>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin-customer-property-submissions", {
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({ action:"list", status:statusFilter, query:appliedQuery, fromDate, toDate, page, pageSize, queueFilter }),
      });
      const data = await response.json().catch(() => null) as { submissions?:Submission[]; total?:number; page?:number; pageSize?:number; counts?:{pending:number;approved:number;rejected:number}; queueStats?:{overdue:number;highPriority:number;unassigned:number;averageAgeHours:number;consultants:Array<{name:string;phone:string;count:number}>}; statusMessage?:string } | null;
      if (!response.ok) throw new Error(data?.statusMessage || "صف ثبت ملک مشتری بارگذاری نشد.");
      setSubmissions(Array.isArray(data?.submissions) ? data.submissions : []);
      setTotal(Number(data?.total) || 0);
      setCounts({
        pending: Number(data?.counts?.pending) || 0,
        approved: Number(data?.counts?.approved) || 0,
        rejected: Number(data?.counts?.rejected) || 0,
      });
      setQueueStats({
        overdue: Number(data?.queueStats?.overdue) || 0,
        highPriority: Number(data?.queueStats?.highPriority) || 0,
        unassigned: Number(data?.queueStats?.unassigned) || 0,
        averageAgeHours: Number(data?.queueStats?.averageAgeHours) || 0,
        consultants: Array.isArray(data?.queueStats?.consultants) ? data.queueStats!.consultants : [],
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "بارگذاری درخواست‌ها انجام نشد.");
    } finally {
      setLoading(false);
    }
  }, [appliedQuery, statusFilter, fromDate, toDate, page, pageSize, queueFilter]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [load]);

  function openSubmission(submission: Submission) {
    setSelected(selected?.id === submission.id ? null : submission);
    setReviewNote(submission.reviewNote || "");
    setEditDraft({ ...submission.propertyData });
  }

  function patchDraft(key: string, value: unknown) {
    setEditDraft((current) => ({ ...(current || {}), [key]: value }));
  }

  function mediaDraftItems() {
    if (!editDraft) return [];
    return Array.isArray(editDraft.images) ? editDraft.images.filter((v): v is string => typeof v === "string") : [];
  }

  function moveMedia(index: number, delta: -1 | 1) {
    const items = mediaDraftItems();
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    if (target === 0 && isVideoUrl(items[index]!)) return;
    const next = [...items];
    [next[index], next[target]] = [next[target]!, next[index]!];
    setEditDraft((current) => ({ ...(current || {}), images: next }));
  }

  function removeMedia(index: number) {
    const items = mediaDraftItems();
    const next = items.filter((_, itemIndex) => itemIndex !== index);
    setEditDraft((current) => ({ ...(current || {}), images: next }));
  }

  function toggleSelection(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAllCurrentPage() {
    setSelectedIds((current) => {
      const next = new Set(current);
      const allSelected = submissions.length > 0 && submissions.every((item) => next.has(item.id));
      if (allSelected) submissions.forEach((item) => next.delete(item.id));
      else submissions.forEach((item) => next.add(item.id));
      return next;
    });
  }

  async function bulkSetPriority(priority: "low" | "normal" | "high") {
    if (!selectedIds.size || statusFilter !== "pending") return;
    try {
      const response = await fetch("/api/admin-customer-property-submissions", {
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({ action:"bulk_set_priority", ids:[...selectedIds], priority }),
      });
      const data = await response.json().catch(() => null) as { success?:boolean; updatedCount?:number; statusMessage?:string } | null;
      if (!response.ok || !data?.success) throw new Error(data?.statusMessage || "تغییر گروهی اولویت انجام نشد.");
      toast.success((Number(data.updatedCount) || 0).toLocaleString("fa-IR") + " پرونده بروزرسانی شد.");
      setSelectedIds(new Set());
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تغییر گروهی اولویت انجام نشد.");
    }
  }

  async function bulkReject() {
    if (!selectedIds.size || statusFilter !== "pending") return;
    const note = window.prompt("یادداشت رد برای پرونده‌های انتخاب‌شده (اختیاری):", reviewNote.trim()) ?? "";
    if (!window.confirm("برای " + selectedIds.size.toLocaleString("fa-IR") + " پرونده درخواست رد ثبت شود؟")) return;
    try {
      const response = await fetch("/api/admin-customer-property-submissions", {
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({ action:"bulk_reject", ids:[...selectedIds], reviewNote:note }),
      });
      const data = await response.json().catch(() => null) as { success?:boolean; updatedCount?:number; statusMessage?:string } | null;
      if (!response.ok || !data?.success) throw new Error(data?.statusMessage || "رد گروهی انجام نشد.");
      toast.success((Number(data.updatedCount) || 0).toLocaleString("fa-IR") + " پرونده رد شد.");
      setSelectedIds(new Set());
      setSelected(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "رد گروهی انجام نشد.");
    }
  }

  async function exportCsv() {
    try {
      const response = await fetch("/api/admin-customer-property-submissions", {
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({ action:"export", status:statusFilter, query:appliedQuery, fromDate, toDate, queueFilter }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null) as { statusMessage?:string } | null;
        throw new Error(data?.statusMessage || "خروجی CSV آماده نشد.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "hirmand-customer-submissions.csv";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success("خروجی CSV دانلود شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "خروجی CSV آماده نشد.");
    }
  }

  async function assignConsultant(submission: Submission, value: string) {
    const found = TEAM.find((person) => person.phone === value);
    try {
      const response = await fetch("/api/admin-customer-property-submissions", {
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({ action:"assign_consultant", id:submission.id, assignedConsultantName:found?.name ?? "", assignedConsultantPhone:found?.phone ?? "" }),
      });
      const data = await response.json().catch(() => null) as { success?:boolean; assignedConsultantName?:string|null; assignedConsultantPhone?:string|null; statusMessage?:string } | null;
      if (!response.ok || !data?.success) throw new Error(data?.statusMessage || "تخصیص مشاور انجام نشد.");
      setSubmissions((items) => items.map((item) => item.id === submission.id ? { ...item, assignedConsultantName:data.assignedConsultantName ?? null, assignedConsultantPhone:data.assignedConsultantPhone ?? null } : item));
      toast.success(found ? "مشاور پرونده مشخص شد." : "مسئول پرونده برداشته شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تخصیص مشاور انجام نشد.");
    }
  }

  async function setPriority(submission: Submission, priority: "low" | "normal" | "high") {
    try {
      const response = await fetch("/api/admin-customer-property-submissions", {
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({ action:"set_priority", id:submission.id, priority }),
      });
      const data = await response.json().catch(() => null) as { success?:boolean; statusMessage?:string } | null;
      if (!response.ok || !data?.success) throw new Error(data?.statusMessage || "تغییر اولویت انجام نشد.");
      setSubmissions((items) => items.map((item) => item.id === submission.id ? { ...item, priority } : item));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تغییر اولویت انجام نشد.");
    }
  }

  async function openHistory(submission: Submission) {
    setHistoryOpen(true);
    setHistoryLoading(true);
    try {
      const response = await fetch("/api/admin-customer-property-submissions", {
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({ action:"history", id:submission.id }),
      });
      const data = await response.json().catch(() => null) as { success?:boolean; events?:Array<{id:string;action:string;note:string;createdAt:string}>; statusMessage?:string } | null;
      if (!response.ok || !data?.success) throw new Error(data?.statusMessage || "تاریخچه پرونده بارگذاری نشد.");
      setHistoryEvents(Array.isArray(data.events) ? data.events : []);
    } catch (error) {
      setHistoryEvents([]);
      toast.error(error instanceof Error ? error.message : "تاریخچه پرونده بارگذاری نشد.");
    } finally {
      setHistoryLoading(false);
    }
  }

  function priorityLabel(priority: Submission["priority"]) {
    return priority === "high" ? "فوری" : priority === "low" ? "کم" : "عادی";
  }

  function ageLabel(ageHours: number | undefined) {
    if (ageHours == null) return "";
    if (ageHours < 1) return "کمتر از ۱ ساعت";
    if (ageHours < 24) return Math.floor(ageHours).toLocaleString("fa-IR") + " ساعت در صف";
    return Math.floor(ageHours / 24).toLocaleString("fa-IR") + " روز در صف";
  }

  async function saveDraft() {
    if (!selected || !editDraft || savingDraft) return;
    setSavingDraft(true);
    try {
      const digitize = (value: string) => value.replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit))).replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
      const numeric = (key: string) => {
        const value = digitize(String(editDraft[key] ?? "").trim()).replace(/[٬،,\s]/g, "");
        if (!value) return null;
        const parsed = Number(value);
        return Number.isFinite(parsed) && Number.isInteger(parsed) ? parsed : value;
      };
      const moneyValue = (key: string) => {
        const value = digitize(String(editDraft[key] ?? "")).replace(/[^0-9]/g, "");
        return value || null;
      };
      const featuresValue = String(editDraft.featuresText ?? String(editDraft.features ?? "")).split(/[،,\n]/).map((v) => v.trim()).filter(Boolean).slice(0,20);
      const patch = {
        title: String(editDraft.title ?? "").trim(),
        transactionType: String(editDraft.transactionType ?? ""),
        propertyType: String(editDraft.propertyType ?? ""),
        neighborhood: String(editDraft.neighborhood ?? "").trim(),
        address: String(editDraft.address ?? "").trim(),
        areaM2: numeric("areaM2"),
        bedrooms: numeric("bedrooms"),
        bathrooms: numeric("bathrooms"),
        floor: numeric("floor"),
        totalFloors: numeric("totalFloors"),
        builtYear: numeric("builtYear"),
        orientation: String(editDraft.orientation ?? "") || null,
        price: moneyValue("price"),
        deposit: moneyValue("deposit"),
        rent: moneyValue("rent"),
        description: String(editDraft.description ?? "").trim(),
        features: featuresValue,
        images: mediaDraftItems(),
      };
      const response = await fetch("/api/admin-customer-property-submissions", {
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({ action:"update", id:selected.id, patch }),
      });
      const data = await response.json().catch(() => null) as { success?:boolean; submission?:Submission; statusMessage?:string } | null;
      if (!response.ok || !data?.success || !data.submission) throw new Error(data?.statusMessage || "ذخیره ویرایش انجام نشد.");
      setSubmissions((items) => items.map((item) => item.id === selected.id ? data.submission! : item));
      setSelected(data.submission);
      setEditDraft({ ...data.submission.propertyData });
      toast.success("ویرایش قبل از انتشار ذخیره شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ذخیره ویرایش انجام نشد.");
    } finally {
      setSavingDraft(false);
    }
  }

  async function act(action: "approve" | "reject", submission: Submission) {
    if (busyId) return;
    const assigned = TEAM.find((person) => person.name === submission.assignedConsultantName && person.phone === submission.assignedConsultantPhone);
    const effectiveConsultant = assigned ?? consultant;
    if (action === "approve") {
      const ok = window.confirm("این ملک با مشاور «" + effectiveConsultant.name + "» منتشر شود؟ پس از تأیید وارد فایل‌های عمومی خواهد شد.");
      if (!ok) return;
    } else {
      const ok = window.confirm("این درخواست ثبت ملک رد شود؟");
      if (!ok) return;
    }
    setBusyId(submission.id);
    try {
      const response = await fetch("/api/admin-customer-property-submissions", {
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({ action, id:submission.id, consultantName:effectiveConsultant.name, consultantPhone:effectiveConsultant.phone, reviewNote:reviewNote.trim() }),
      });
      const data = await response.json().catch(() => null) as { success?:boolean; slug?:string; statusMessage?:string } | null;
      if (!response.ok || !data?.success) throw new Error(data?.statusMessage || "عملیات انجام نشد.");
      toast.success(action === "approve" ? "ملک تأیید و منتشر شد." : "درخواست رد شد.");
      setSelected(null);
      setReviewNote("");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "عملیات انجام نشد.");
    } finally {
      setBusyId(null);
    }
  }

  const pendingLabel = useMemo(() => counts.pending.toLocaleString("fa-IR") + " در انتظار بررسی", [counts.pending]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const allCurrentPageSelected = submissions.length > 0 && submissions.every((item) => selectedIds.has(item.id));
  const quickFilterLabel = queueFilter === "overdue" ? "فقط overdue" : queueFilter === "unassigned" ? "بدون مسئول" : queueFilter === "high" ? "فقط فوری" : "همه پرونده‌ها";

  return (
    <section className="admin-customer-submissions admin-panel">
      <div className="admin-panel-head">
        <div>
          <span className="kicker">ثبت ملک مشتری</span>
          <h2>صف بررسی و انتشار فایل</h2>
          <p className="admin-customer-submissions-subtitle">{pendingLabel} · هیچ فایل قبل از تأیید در لیست عمومی منتشر نمی‌شود.</p>
        </div>
        <button type="button" className="btn-ghost" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={15} className={loading ? "admin-spin" : undefined}/> بروزرسانی
        </button>
      </div>

      <div className="admin-customer-submission-summary">
        <div><span>کل ورودی</span><strong>{(counts.pending + counts.approved + counts.rejected).toLocaleString("fa-IR")}</strong></div>
        <div><span>در صف</span><strong>{counts.pending.toLocaleString("fa-IR")}</strong></div>
        <div><span>تأیید شده</span><strong>{counts.approved.toLocaleString("fa-IR")}</strong></div>
        <div><span>رد شده</span><strong>{counts.rejected.toLocaleString("fa-IR")}</strong></div>
        <div><span>نرخ تأیید</span><strong>{(counts.approved + counts.rejected) ? ((counts.approved / (counts.approved + counts.rejected)) * 100).toFixed(0) + "٪" : "—"}</strong></div>
      </div>

      <div className="admin-customer-queue-stats">
        <button type="button" className={"admin-customer-queue-stat" + (queueFilter==="overdue" ? " is-active" : "")} onClick={()=>{setStatusFilter("pending");setQueueFilter("overdue");setPage(1);setSelectedIds(new Set());}}><Timer size={15}/><span><small>overdue +۲۴ساعت</small><strong>{queueStats.overdue.toLocaleString("fa-IR")}</strong></span></button>
        <button type="button" className={"admin-customer-queue-stat" + (queueFilter==="high" ? " is-active" : "")} onClick={()=>{setStatusFilter("pending");setQueueFilter("high");setPage(1);setSelectedIds(new Set());}}><Star size={15}/><span><small>فوری</small><strong>{queueStats.highPriority.toLocaleString("fa-IR")}</strong></span></button>
        <button type="button" className={"admin-customer-queue-stat" + (queueFilter==="unassigned" ? " is-active" : "")} onClick={()=>{setStatusFilter("pending");setQueueFilter("unassigned");setPage(1);setSelectedIds(new Set());}}><Pencil size={15}/><span><small>بدون مسئول</small><strong>{queueStats.unassigned.toLocaleString("fa-IR")}</strong></span></button>
        <div className="admin-customer-queue-stat is-passive"><Timer size={15}/><span><small>میانگین انتظار</small><strong>{queueStats.averageAgeHours < 1 ? "کمتر از ۱ ساعت" : Math.floor(queueStats.averageAgeHours).toLocaleString("fa-IR") + " ساعت"}</strong></span></div>
      </div>
      <div className="admin-customer-queue-toolbar"><span>نمای فعلی: <strong>{quickFilterLabel}</strong></span>{queueFilter !== "all" ? <button type="button" className="btn-ghost" onClick={()=>{setQueueFilter("all");setPage(1);setSelectedIds(new Set());}}>نمایش همه</button> : null}</div>

      <div className="admin-customer-consultant-workload">
        <span className="admin-customer-consultant-workload-label">بار کاری در صف:</span>
        {queueStats.consultants.map((person)=><span key={person.phone} className="admin-customer-consultant-workload-item"><span>{person.name}</span><strong>{person.count.toLocaleString("fa-IR")}</strong></span>)}
      </div>

      <div className="admin-customer-submissions-status-tabs">
        {([
          ["pending","در انتظار",counts.pending],
          ["approved","تأییدشده",counts.approved],
          ["rejected","ردشده",counts.rejected],
        ] as const).map(([value,label,count]) => (
          <button type="button" key={value} className={statusFilter===value ? "is-active" : ""} onClick={()=>{setStatusFilter(value);setQueueFilter("all");setSelected(null);setEditDraft(null);setSelectedIds(new Set());setPage(1);}}>
            <span>{label}</span><strong>{count.toLocaleString("fa-IR")}</strong>
          </button>
        ))}
      </div>

      <div className="admin-customer-submissions-toolbar">
        <label className="field admin-customer-search">
          <span>جست‌وجو</span>
          <div className="admin-customer-search-input">
            <Search size={15}/>
            <input value={searchQuery} onChange={(e)=>setSearchQuery(e.target.value)} onKeyDown={(e)=>{if(e.key==="Enter"){e.preventDefault();setAppliedQuery(searchQuery.trim());}}} placeholder="عنوان، محله، نام، موبایل یا کد رهگیری"/>
          </div>
        </label>
        <button type="button" className="btn-ghost" onClick={()=>{setAppliedQuery(searchQuery.trim());setPage(1);setSelectedIds(new Set());}}><Search size={15}/> جست‌وجو</button>
        <label className="field">
          <span>از تاریخ</span>
          <input type="date" value={fromDate} max={toDate || undefined} onChange={(e)=>{setFromDate(e.target.value);setPage(1);setSelectedIds(new Set());}} />
        </label>
        <label className="field">
          <span>تا تاریخ</span>
          <input type="date" value={toDate} min={fromDate || undefined} onChange={(e)=>{setToDate(e.target.value);setPage(1);setSelectedIds(new Set());}} />
        </label>
        <label className="field">
          <span>تعداد در صفحه</span>
          <select value={pageSize} onChange={(e)=>{setPageSize(Number(e.target.value));setPage(1);setSelectedIds(new Set());}}>
            <option value={10}>۱۰</option>
            <option value={20}>۲۰</option>
            <option value={40}>۴۰</option>
          </select>
        </label>
        <label className="field">
          <span>مشاور انتشار</span>
          <select value={consultant.phone} onChange={(e) => {
            const found = TEAM.find((person) => person.phone === e.target.value);
            if (found) setConsultant(found);
          }}>
            {TEAM.map((person) => <option key={person.phone} value={person.phone}>{person.name} · {person.role}</option>)}
          </select>
        </label>
        <button type="button" className="btn-ghost" onClick={()=>void exportCsv()}><Download size={15}/> خروجی CSV</button>
        <div className="admin-customer-submissions-note">فیلترهای جست‌وجو و تاریخ روی خروجی CSV هم اعمال می‌شوند.</div>
        <div className="admin-customer-bulk-toolbar">
          <button type="button" className="btn-ghost" onClick={toggleAllCurrentPage} disabled={!submissions.length}><ListChecks size={15}/>{allCurrentPageSelected ? "لغو انتخاب صفحه" : "انتخاب همه این صفحه"}</button>
          {selectedIds.size && statusFilter === "pending" ? <><select aria-label="اولویت گروهی" defaultValue="" onChange={(e)=>{if(e.target.value) void bulkSetPriority(e.target.value as "low"|"normal"|"high");e.currentTarget.value="";}}><option value="" disabled>اولویت گروهی…</option><option value="high">فوری</option><option value="normal">عادی</option><option value="low">کم</option></select><button type="button" className="btn-ghost danger" onClick={()=>void bulkReject()}><XCircle size={15}/> رد {selectedIds.size.toLocaleString("fa-IR")}</button></> : null}
        </div>
      </div>

      {loading && !submissions.length ? <div className="admin-customer-submissions-empty">در حال دریافت درخواست‌های مشتری…</div> :
       !submissions.length ? <div className="admin-customer-submissions-empty"><CheckCircle2 size={22}/><strong>صف بررسی خالی است.</strong><span>فعلاً ثبت ملک جدیدی منتظر تأیید نیست.</span></div> :
       <div className="admin-customer-submissions-list">
        {submissions.map((submission) => {
          const data = submission.propertyData;
          const media = mediaItems(data);
          const firstImage = media.find((src) => !isVideoUrl(src)) || "";
          const selectedOpen = selected?.id === submission.id;
          return (
            <article key={submission.id} className={"admin-customer-submission-card" + (selectedOpen ? " is-open" : "") + (selectedIds.has(submission.id) ? " is-selected" : "")}>
              <label className="admin-customer-submission-checkbox" title="انتخاب پرونده">
                <input type="checkbox" checked={selectedIds.has(submission.id)} onChange={()=>toggleSelection(submission.id)} />
              </label>
              <div className="admin-customer-submission-main">
                <div className="admin-customer-submission-cover">
                  {firstImage ? <img src={firstImage} alt="" loading="lazy"/> : <ImageIcon size={25}/>}
                  <span>{media.length.toLocaleString("fa-IR")} رسانه</span>
                </div>
                <div className="admin-customer-submission-copy">
                  <div className="admin-customer-submission-head">
                    <div><strong>{String(data.title ?? "بدون عنوان")}</strong><span>{labelTransaction(data.transactionType)} · {labelType(data.propertyType)}</span></div>
                    <small>{faDate(submission.createdAt)}</small>
                  </div>
                  <p>{String(data.neighborhood ?? "—")} · {String(data.areaM2 ?? "—")} متر · {priceText(data)}</p>
                  <div className="admin-customer-submission-owner"><strong>{submission.ownerName}</strong><a href={"tel:"+submission.ownerPhone}><Phone size={14}/>{submission.ownerPhone}</a><span dir="ltr">{submission.trackingToken}</span>{submission.possibleDuplicate?<span className="admin-customer-duplicate-badge">احتمال تکراری</span>:null}{submission.status==="pending"&&submission.ageHours!=null?<span className={"admin-customer-age-badge"+(submission.ageHours>=24?" is-overdue":"")}><Timer size={12}/>{ageLabel(submission.ageHours)}</span>:null}</div>
                  {submission.status === "pending" ? <div className="admin-customer-queue-controls">
                     <label><span>مسئول</span><select value={submission.assignedConsultantPhone ?? ""} onChange={(e)=>void assignConsultant(submission,e.target.value)}>
                       <option value="">بدون مسئول</option>
                       {TEAM.map((person) => <option key={person.phone} value={person.phone}>{person.name} · {person.role}</option>)}
                     </select></label>
                    <label><span>اولویت</span><select value={submission.priority || "normal"} onChange={(e)=>void setPriority(submission,e.target.value as "low"|"normal"|"high")}><option value="high">فوری</option><option value="normal">عادی</option><option value="low">کم</option></select></label>
                    <span className={"admin-customer-priority-badge priority-"+(submission.priority || "normal")}>{priorityLabel(submission.priority)}</span>
                  </div> : null}
                  <div className="admin-customer-submission-actions">
                    <button type="button" className="btn-ghost" onClick={()=>openSubmission(submission)}>{selectedOpen ? "بستن جزئیات" : "جزئیات و رسانه‌ها"}</button>
                    {selectedOpen && editDraft ? <button type="button" className="btn-ghost" onClick={()=>setPreviewOpen((value)=>!value)}><Eye size={15}/> {previewOpen ? "بستن پیش‌نمایش" : "پیش‌نمایش نهایی"}</button> : null}
                    {selectedOpen ? <button type="button" className="btn-ghost" onClick={()=>void openHistory(submission)}><History size={15}/> تاریخچه</button> : null}
                    {submission.status === "pending" ? <>
                      <button type="button" className="btn-gold" disabled={busyId===submission.id} onClick={()=>void act("approve",submission)}><CheckCircle2 size={15}/> تأیید و انتشار</button>
                      <button type="button" className="btn-ghost danger" disabled={busyId===submission.id} onClick={()=>void act("reject",submission)}><XCircle size={15}/> رد</button>
                    </> : null}
                  </div>
                </div>
              </div>
              {selectedOpen ? (
                <div className="admin-customer-submission-detail">
                  {previewOpen && editDraft ? (
                    <div className="admin-customer-final-preview">
                      <div className="admin-customer-final-preview-head"><div><span className="kicker">پیش‌نمایش نهایی</span><strong>نمایی که قبل از انتشار بررسی می‌کنی</strong></div><button type="button" className="btn-ghost" onClick={()=>setPreviewOpen(false)}>بستن</button></div>
                      <div className="admin-customer-final-preview-card">
                        <div className="admin-customer-final-preview-media">
                          {mediaDraftItems().length ? mediaDraftItems().map((src,index)=> index===0 ? (isVideoUrl(src) ? <video key={src} src={src} controls muted preload="metadata"/> : <img key={src} src={src} alt="" />) : null) : <ImageIcon size={32}/>}
                        </div>
                        <div className="admin-customer-final-preview-copy">
                          <div className="admin-customer-preview-tags"><span>{labelTransaction(editDraft.transactionType)}</span><span>{labelType(editDraft.propertyType)}</span><span>{String(editDraft.neighborhood || "محله نامشخص")}</span></div>
                          <h3>{String(editDraft.title || "بدون عنوان")}</h3>
                          <p>{String(editDraft.areaM2 || "—")} متر · {String(editDraft.bedrooms ?? "—")} خواب · {priceText(editDraft)}</p>
                          <p className="preview-description">{String(editDraft.description || "توضیحات ثبت نشده است.")}</p>
                          <div className="admin-customer-preview-feature-list">{(Array.isArray(editDraft.features)?editDraft.features:[]).slice(0,8).map((item)=><span key={String(item)}>{String(item)}</span>)}</div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  {statusFilter === "pending" && editDraft ? (
                    <div className="admin-customer-submission-edit">
                      <div className="admin-customer-submission-edit-head">
                        <div><span className="kicker"><Pencil size={13}/> ویرایش پیش از انتشار</span><strong>اصلاح اطلاعات فایل قبل از تأیید</strong></div>
                        <button type="button" className="btn-gold" onClick={()=>void saveDraft()} disabled={savingDraft}><Save size={15}/>{savingDraft ? "در حال ذخیره…" : "ذخیره ویرایش"}</button>
                      </div>
                      <div className="admin-customer-submission-edit-grid">
                        <label className="field wide"><span>عنوان</span><input value={String(editDraft.title ?? "")} onChange={(e)=>patchDraft("title",e.target.value)}/></label>
                        <label className="field"><span>نوع معامله</span><select value={String(editDraft.transactionType ?? "")} onChange={(e)=>patchDraft("transactionType",e.target.value)}><option value="sell">فروش</option><option value="buy">خرید</option><option value="rent">اجاره</option><option value="mortgage">رهن</option></select></label>
                        <label className="field"><span>نوع ملک</span><select value={String(editDraft.propertyType ?? "")} onChange={(e)=>patchDraft("propertyType",e.target.value)}><option value="apartment">آپارتمان</option><option value="villa">ویلا و باغ</option><option value="office">اداری</option><option value="heritage">خانه اصیل</option><option value="land">زمین</option><option value="commercial">تجاری</option></select></label>
                        <label className="field"><span>محله</span><input value={String(editDraft.neighborhood ?? "")} onChange={(e)=>patchDraft("neighborhood",e.target.value)}/></label>
                        <label className="field"><span>متراژ</span><input inputMode="numeric" value={String(editDraft.areaM2 ?? "")} onChange={(e)=>patchDraft("areaM2",e.target.value)}/></label>
                        <label className="field"><span>قیمت</span><input inputMode="numeric" value={String(editDraft.price ?? "")} onChange={(e)=>patchDraft("price",e.target.value)}/></label>
                        <label className="field"><span>رهن</span><input inputMode="numeric" value={String(editDraft.deposit ?? "")} onChange={(e)=>patchDraft("deposit",e.target.value)}/></label>
                        <label className="field"><span>اجاره</span><input inputMode="numeric" value={String(editDraft.rent ?? "")} onChange={(e)=>patchDraft("rent",e.target.value)}/></label>
                        <label className="field wide"><span>آدرس / توضیح موقعیت</span><input value={String(editDraft.address ?? "")} onChange={(e)=>patchDraft("address",e.target.value)}/></label>
                        <label className="field"><span>خواب</span><input inputMode="numeric" value={String(editDraft.bedrooms ?? "")} onChange={(e)=>patchDraft("bedrooms",e.target.value)}/></label>
                        <label className="field"><span>حمام</span><input inputMode="numeric" value={String(editDraft.bathrooms ?? "")} onChange={(e)=>patchDraft("bathrooms",e.target.value)}/></label>
                        <label className="field wide"><span>ویژگی‌ها</span><input value={String(editDraft.featuresText ?? (Array.isArray(editDraft.features) ? editDraft.features.join("، ") : ""))} onChange={(e)=>patchDraft("featuresText",e.target.value)}/></label>
                        <label className="field wide"><span>توضیحات</span><textarea rows={7} value={String(editDraft.description ?? "")} onChange={(e)=>patchDraft("description",e.target.value)}/></label>
                      </div>
                    </div>
                  ) : null}
                  {editDraft ? (() => {
                    const readiness = getPublishReadiness({
                      transactionType: String(editDraft.transactionType ?? "sell") as "sell"|"buy"|"rent"|"mortgage",
                      title: String(editDraft.title ?? ""),
                      neighborhood: String(editDraft.neighborhood ?? ""),
                      description: String(editDraft.description ?? ""),
                      contactName: consultant.name,
                      contactPhone: consultant.phone,
                      price: String(editDraft.price ?? ""),
                      deposit: String(editDraft.deposit ?? ""),
                      rent: String(editDraft.rent ?? ""),
                      imageCount: mediaDraftItems().filter((src) => !isVideoUrl(src)).length,
                      areaM2: String(editDraft.areaM2 ?? ""),
                      features: Array.isArray(editDraft.features) ? editDraft.features.join("\n") : String(editDraft.features ?? ""),
                      latitude: editDraft.latitude == null ? null : Number(editDraft.latitude),
                      longitude: editDraft.longitude == null ? null : Number(editDraft.longitude),
                    });
                    const okCount = readiness.checks.filter((item) => item.state === "ok").length;
                    return (
                      <div className="admin-customer-quality">
                        <div className="admin-customer-quality-head">
                          <div><span className="kicker">کنترل کیفیت</span><strong>آمادگی انتشار: {okCount.toLocaleString("fa-IR")} از {readiness.checks.length.toLocaleString("fa-IR")} مورد</strong></div>
                          <span className={readiness.ready ? "is-ready" : "is-blocked"}>{readiness.ready ? "آماده انتشار" : "نیازمند اصلاح"}</span>
                        </div>
                        <div className="admin-customer-quality-list">
                          {readiness.checks.map((check) => <span key={check.key} className={"quality-"+check.state}>{check.state==="ok" ? "✓" : check.state==="blocker" ? "!" : "•"} {check.label}</span>)}
                        </div>
                        {readiness.blockers.length ? <div className="admin-customer-quality-messages"><strong>موارد الزامی:</strong>{readiness.blockers.map((item)=><span key={item}>{item}</span>)}</div> : null}
                        {readiness.warnings.length ? <div className="admin-customer-quality-messages warnings"><strong>پیشنهاد:</strong>{readiness.warnings.map((item)=><span key={item}>{item}</span>)}</div> : null}
                      </div>
                    );
                  })() : null}
                  <div className="admin-customer-submission-detail-grid">
                    <div><span>آدرس</span><strong>{String(data.address || "ثبت نشده")}</strong>{data.latitude != null && data.longitude != null ? <a className="admin-customer-map-link" href={"https://www.google.com/maps?q="+encodeURIComponent(String(data.latitude)+","+String(data.longitude))} target="_blank" rel="noreferrer"><MapPin size={12}/> مشاهده روی نقشه</a> : null}</div>
                    <div><span>خواب / حمام</span><strong>{String(data.bedrooms ?? "—")} / {String(data.bathrooms ?? "—")}</strong></div>
                    <div><span>طبقه</span><strong>{String(data.floor ?? "—")} از {String(data.totalFloors ?? "—")}</strong></div>
                    <div><span>سال ساخت</span><strong>{String(data.builtYear ?? "—")}</strong></div>
                    <div className="wide"><span>توضیحات</span><p>{String(data.description ?? "—")}</p></div>
                  </div>
                  {mediaDraftItems().length ? (
                    <div className="admin-customer-media-manager">
                      <div className="admin-customer-media-manager-head"><span className="kicker">مدیریت رسانه</span><small>اولین تصویر، کاور فایل خواهد بود.</small></div>
                      <div className="admin-customer-submission-media">
                        {mediaDraftItems().map((src,index)=>(
                          <div key={src} className={index===0 && !isVideoUrl(src) ? "is-cover" : ""}>
                            {isVideoUrl(src)?<video src={src} controls preload="metadata"/>:<img src={src} alt="" loading="lazy"/>}
                            <div className="admin-customer-media-controls">
                              <button type="button" onClick={()=>moveMedia(index,-1)} disabled={index===0}><ArrowUp size={13}/></button>
                              <button type="button" onClick={()=>moveMedia(index,1)} disabled={index===mediaDraftItems().length-1}><ArrowDown size={13}/></button>
                              {index===0 && !isVideoUrl(src) ? <span title="کاور"><Star size={12}/></span> : null}
                              <button type="button" className="danger" onClick={()=>removeMedia(index)} disabled={mediaDraftItems().length<=1}><Trash2 size={13}/></button>
                            </div>
                            {index===0 && !isVideoUrl(src) ? <small><Star size={12}/> کاور</small> : isVideoUrl(src)?<small><Film size={12}/> ویدئو</small>:null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {statusFilter === "pending" ? (
                    <label className="field"><span>یادداشت بررسی (اختیاری)</span><textarea rows={3} value={reviewNote} onChange={(e)=>setReviewNote(e.target.value)} placeholder="مثلاً سند بررسی شد، قیمت نیاز به تأیید دارد…"/></label>
                  ) : submission.reviewNote ? (
                    <div className="admin-customer-review-note"><span>یادداشت بررسی</span><p>{submission.reviewNote}</p></div>
                  ) : null}
                  {historyOpen && selectedOpen ? (
                    <div className="admin-customer-history-panel">
                      <div className="admin-customer-history-head"><div><span className="kicker">تاریخچه بررسی</span><strong>رویدادهای این پرونده</strong></div><button type="button" className="btn-ghost" onClick={()=>setHistoryOpen(false)}>بستن</button></div>
                      {historyLoading ? <div className="admin-customer-history-empty">در حال دریافت تاریخچه…</div> : historyEvents.length ? <div className="admin-customer-history-list">{historyEvents.map((event)=><div key={event.id}><span>{faDate(event.createdAt)}</span><strong>{event.action==="approve"?"تأیید و انتشار":event.action==="reject"?"رد درخواست":event.action==="edit"?"ویرایش قبل از انتشار":event.action==="priority"?"تغییر اولویت":"رویداد پرونده"}</strong><p>{event.note || "بدون توضیح"}</p></div>)}</div> : <div className="admin-customer-history-empty">برای این پرونده هنوز رویداد ثبت‌شده‌ای وجود ندارد.</div>}
                    </div>
                  ) : null}
                  {submission.propertyId ? <a className="btn-ghost" href={"/properties/" + String(data.slug ?? "")} target="_blank" rel="noreferrer"><ExternalLink size={15}/> مشاهده فایل منتشرشده</a> : null}
                </div>
              ) : null}
            </article>
          );
        })}
       </div>}
       {submissions.length ? (
         <div className="admin-customer-pagination">
           <div className="admin-customer-pagination-meta">
             <strong>{total.toLocaleString("fa-IR")} پرونده</strong>
             <span>صفحه {page.toLocaleString("fa-IR")} از {totalPages.toLocaleString("fa-IR")}</span>
             {selectedIds.size ? <span>{selectedIds.size.toLocaleString("fa-IR")} انتخاب شده</span> : null}
           </div>
           <div className="admin-customer-pagination-actions">
             <button type="button" className="btn-ghost" onClick={()=>{setPage((value)=>Math.max(1,value-1));setSelectedIds(new Set());}} disabled={page<=1}><ArrowRight size={15}/> قبلی</button>
             <button type="button" className="btn-ghost" onClick={()=>{setPage((value)=>Math.min(totalPages,value+1));setSelectedIds(new Set());}} disabled={page>=totalPages}>بعدی <ArrowLeft size={15}/></button>
           </div>
         </div>
       ) : null}
    </section>
  );
}
