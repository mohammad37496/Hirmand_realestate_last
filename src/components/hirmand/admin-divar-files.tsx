import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  CheckSquare,
  Clock3,
  Download,
  ExternalLink,
  Eye,
  Filter,
  Gauge,
  History,
  Image as ImageIcon,
  Import,
  Loader2,
  MapPin,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Square,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { propertyPath } from "@/lib/property-path";
import {
  getDivarStats,
  importDivarFile,
  listDivarFiles,
  syncDivarFiles,
  type DivarFile,
  type DivarStats,
} from "@/lib/divar";
import { approveDivarFile, deleteDivarFiles, revokeDivarOverride } from "@/lib/divar-review";
import {
  DIVAR_MAX_PUBLISHED_IMAGES,
  DIVAR_ORIENTATION_LABELS,
  EMPTY_DIVAR_FILTERS,
  divarCompleteness,
  divarFilesToCsv,
  divarGalleryHealth,
  divarNeighborhoodOptions,
  fa,
  featureSummary,
  filterDivarFiles,
  formatDateTime,
  formatDuration,
  formatMoney,
  propertyLabel,
  sortDivarFiles,
  syncRunBadge,
  transactionLabel,
  type DivarFilters,
  type DivarSortKey,
} from "@/lib/divar-status";
import { DIVAR_CSS, DivarGallery } from "@/components/hirmand/divar-admin-ui";

type Tab = "accepted" | "imported" | "rejected";

const TAB_LIMIT_STEP = 24;
const TAB_LIMIT_MAX = 20_000;
const LIST_PAGE_MAX = 100;
const EMPTY_LISTS: Record<Tab, DivarFile[]> = { accepted: [], imported: [], rejected: [] };
const EMPTY_STATS: DivarStats = {
  accepted: 0,
  imported: 0,
  rejected: 0,
  totalSeen: 0,
  lastSyncAt: null,
  syncRuns: [],
};

const TAB_LABELS: Record<Tab, string> = {
  accepted: "فایل‌های قابل انتشار",
  imported: "فایل‌های واردشده به هیرمند",
  rejected: "فایل‌های ردشده",
};

/**
 * Divar panel: crawl, review, publish.
 *
 * The three tabs are three review queues over the same table. The agency filter
 * is aggressive, so every queue has an escape hatch — publish, repair the
 * gallery, approve by hand, or purge — and each one confirms or is reversible.
 */
export function AdminDivarFiles({ staffMode = false }: { staffMode?: boolean } = {}) {
  const [lists, setLists] = useState<Record<Tab, DivarFile[]>>(EMPTY_LISTS);
  const [stats, setStats] = useState<DivarStats>(EMPTY_STATS);
  const [tab, setTab] = useState<Tab>("accepted");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  /** How many ads the next crawl should pull from Divar. */
  const [crawlLimit, setCrawlLimit] = useState(24);
  /** How many rows per status have been loaded, fetched in server-safe pages. */
  const [loadedCounts, setLoadedCounts] = useState<Record<Tab, number>>({
    accepted: TAB_LIMIT_STEP,
    imported: TAB_LIMIT_STEP,
    rejected: TAB_LIMIT_STEP,
  });
  const [filters, setFilters] = useState<DivarFilters>(EMPTY_DIVAR_FILTERS);
  const [sortBy, setSortBy] = useState<DivarSortKey>("newest");
  const [selection, setSelection] = useState<string[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyStage, setBusyStage] = useState("");
  const [progress, setProgress] = useState(0);
  const [bulk, setBulk] = useState<{ label: string; done: number; total: number } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const cancelBulk = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const fetchRows = async (status: Tab, requestedCount: number) => {
        const rows: DivarFile[] = [];
        while (rows.length < requestedCount && rows.length < TAB_LIMIT_MAX) {
          const limit = Math.min(LIST_PAGE_MAX, requestedCount - rows.length);
          const page = await listDivarFiles({
            data: { status, limit, offset: rows.length },
          });
          rows.push(...page);
          if (page.length < limit) break;
        }
        return rows;
      };

      const [acceptedRows, importedRows, rejectedRows, nextStats] = await Promise.all([
        fetchRows("accepted", loadedCounts.accepted),
        fetchRows("imported", loadedCounts.imported),
        fetchRows("rejected", loadedCounts.rejected),
        getDivarStats({ data: {} }),
      ]);
      setLists({ accepted: acceptedRows, imported: importedRows, rejected: rejectedRows });
      setStats(nextStats);
      setError(null);
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : "بارگذاری فایل‌های دیوار انجام نشد.";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [loadedCounts]);

  useEffect(() => {
    void load();
  }, [load]);

  // A selection must not survive a tab change — the bulk actions differ per tab.
  useEffect(() => {
    setSelection([]);
  }, [tab]);

  async function sync() {
    if (syncing || bulk || loading) return;
    setSyncing(true);
    try {
      const result = await syncDivarFiles({ data: { limit: crawlLimit } });
      if (result.inspected === 0) {
        toast.info("دیوار در این بررسی آگهی تازه‌ای برنگرداند.");
      } else {
        const summary =
          `${fa(result.inspected)} آگهی بررسی شد؛ ${fa(result.visible)} فایل شخصی آماده انتشار و ${fa(result.rejected)} مورد مشاور/آژانس کنار گذاشته شد (${formatDuration(result.durationMs)}).`;
        if (result.detailFailures > 0) {
          toast.warning(
            `${summary} دریافت جزئیات ${fa(result.detailFailures)} آگهی ناموفق بود؛ گزارش اجرا را ببینید و دوباره بررسی کنید.`,
          );
        } else {
          toast.success(summary);
        }
      }
      await load();
      setTab("accepted");
    } catch (syncError) {
      toast.error(
        syncError instanceof Error ? syncError.message : "دریافت فایل‌ها از دیوار انجام نشد.",
      );
    } finally {
      setSyncing(false);
    }
  }

  /**
   * Publishes one ad on the site. `quiet` is used by bulk runs, which drive
   * their own progress bar and report a single summary at the end.
   */
  async function publishOne(
    file: DivarFile,
    options: { repair?: boolean; quiet?: boolean } = {},
  ): Promise<boolean> {
    const repair = options.repair === true;
    const quiet = options.quiet === true;
    let ticker = 0;

    if (!quiet) {
      setBusyId(file.id);
      setBusyStage("بررسی فایل دیوار…");
      setProgress(8);
      // The import downloads a whole gallery, so the bar advances on a timer and
      // snaps to 100% when the server answers.
      ticker = window.setInterval(() => {
        setProgress((value) => Math.min(92, value + Math.max(2, (92 - value) * 0.12)));
        setBusyStage((stage) =>
          stage === "بررسی فایل دیوار…" ? "دریافت و ذخیره تصاویر…" : stage,
        );
      }, 600);
    }

    try {
      const result = await importDivarFile({ data: { id: file.id, repair } });
      if (!quiet) {
        setProgress(100);
        setBusyStage(staffMode ? "ثبت پیش‌نویس در هیرمند…" : "انتشار در سایت…");
        const total = Number(result.imageCount) || 0;
        if (staffMode) {
          toast.success(`فایل به‌صورت پیش‌نویس ثبت شد؛ ${fa(total)} تصویر پیدا شد و انتشار نیاز به تأیید مدیر دارد.`);
        } else if (result.imageFailures > 0) {
          toast.warning(
            `فایل منتشر شد؛ ${fa(Number(result.hostedImageCount) || 0)} تصویر روی فضای سایت ذخیره شد و ${fa(result.imageFailures)} تصویر با منبع اصلی نمایش داده می‌شود.`,
          );
        } else if (total > 0) {
          toast.success(
            result.alreadyImported
              ? `تصاویر تکمیل شد؛ مجموعه کامل ${fa(total)} تصویر روی سایت منتشر است.`
              : `فایل در سایت منتشر شد و ${fa(total)} تصویر ذخیره شد.`,
          );
        } else {
          toast.info("فایل در سایت منتشر شد، اما آگهی دیوار تصویری نداشت.");
        }
      }
      return true;
    } catch (importError) {
      if (!quiet) {
        toast.error(
          importError instanceof Error ? importError.message : "ورود فایل به سایت انجام نشد.",
        );
      }
      return false;
    } finally {
      if (ticker) window.clearInterval(ticker);
      if (!quiet) {
        setBusyId(null);
        setBusyStage("");
        setProgress(0);
      }
    }
  }

  async function publish(file: DivarFile, options: { repair?: boolean } = {}) {
    if (syncing || bulk || loading) return;
    const ok = await publishOne(file, options);
    if (!ok) return;
    await load();
    setTab("imported");
  }

  async function approve(file: DivarFile, force = false) {
    if (syncing || bulk || loading) return;
    setBusyId(file.id);
    setBusyStage(force ? "تأیید دستی و بازخوانی آگهی…" : "بررسی دوباره آگهی…");
    try {
      const result = await approveDivarFile({ data: { id: file.id, force } });
      toast.success(
        result.refetched
          ? `«${file.title}» تأیید دستی شد و ${fa(result.imageCount)} تصویر آگهی بازخوانی شد.`
          : "فایل به فهرست آماده انتشار منتقل شد، اما بازخوانی آگهی از دیوار ممکن نشد.",
      );
      await load();
      setTab("accepted");
    } catch (approveError) {
      const message =
        approveError instanceof Error ? approveError.message : "تأیید دستی انجام نشد.";
      // The server refuses the first pass on purpose, so overriding the agency
      // filter is a conscious decision rather than a silent one.
      if (!force && message.includes("نشانه مشاور/آژانس")) {
        if (window.confirm(message + "\n\nبه عنوان مدیر با وجود این نشانه‌ها تأیید می‌کنید؟")) {
          await approve(file, true);
        }
        return;
      }
      toast.error(message);
    } finally {
      setBusyId(null);
      setBusyStage("");
    }
  }

  async function revoke(file: DivarFile) {
    if (syncing || bulk || loading) return;
    if (!window.confirm(`تأیید دستی «${file.title}» لغو شود و فایل به فهرست ردشده‌ها بازگردد؟`)) {
      return;
    }
    setBusyId(file.id);
    setBusyStage("لغو تأیید دستی…");
    try {
      await revokeDivarOverride({ data: { id: file.id } });
      toast.success("تأیید دستی لغو شد؛ فایل دوباره توسط فیلتر مشاور/آژانس بررسی می‌شود.");
      await load();
    } catch (revokeError) {
      toast.error(
        revokeError instanceof Error ? revokeError.message : "لغو تأیید دستی انجام نشد.",
      );
    } finally {
      setBusyId(null);
      setBusyStage("");
    }
  }

  async function removeFiles(ids: string[], confirmMessage: string) {
    if (!ids.length || syncing || bulk || loading) return;
    if (!window.confirm(confirmMessage)) return;
    try {
      const result = await deleteDivarFiles({ data: { ids } });
      toast.success(
        `${fa(result.deleted)} فایل حذف شد.` +
          (result.skipped > 0
            ? ` ${fa(result.skipped)} فایل منتشرشده محفوظ ماند؛ ابتدا آن‌ها را از فهرست فایل‌های سایت حذف کنید.`
            : ""),
      );
      setSelection((prev) => prev.filter((id) => !ids.includes(id)));
      await load();
    } catch (removeError) {
      toast.error(removeError instanceof Error ? removeError.message : "حذف فایل‌ها انجام نشد.");
    }
  }

  /** Every bulk run walks the selection and reports one summary at the end. */
  async function bulkPublish() {
    if (syncing || bulk || loading) return;
    const targets = visible.filter((file) => selection.includes(file.id));
    if (!targets.length) return;
    if (
      !window.confirm(
        staffMode
          ? `افزودن ${fa(targets.length)} آگهی به‌صورت پیش‌نویس؟ انتشار نهایی پس از بررسی مدیر انجام می‌شود.`
          : `انتشار ${fa(targets.length)} فایل روی سایت؟ تصاویر همه آگهی‌ها روی فضای سایت ذخیره می‌شود و این کار ممکن است چند دقیقه طول بکشد.`,
      )
    ) {
      return;
    }

    cancelBulk.current = false;
    setBulk({ label: "آماده‌سازی…", done: 0, total: targets.length });
    let published = 0;
    let failed = 0;

    for (const file of targets) {
      if (cancelBulk.current) break;
      setBulk({ label: file.title.slice(0, 60), done: published + failed, total: targets.length });
      if (await publishOne(file, { quiet: true })) published += 1;
      else failed += 1;
    }

    const cancelled = cancelBulk.current;
    setBulk(null);
    setSelection([]);
    await load();
    if (published) setTab("imported");

    const summary = staffMode
      ? `${fa(published)} پیش‌نویس ثبت شد${failed ? ` و ${fa(failed)} مورد ناموفق بود` : ""}${cancelled ? " (پیش از پایان متوقف شد)" : ""}.`
      : `${fa(published)} فایل منتشر شد${failed ? ` و ${fa(failed)} مورد ناموفق بود` : ""}${cancelled ? " (پیش از پایان متوقف شد)" : ""}.`;
    if (failed > 0) toast.warning(summary);
    else if (cancelled) toast.info(summary);
    else toast.success(summary);
  }

  async function bulkRepair() {
    if (syncing || bulk || loading) return;
    const targets = visible.filter((file) => selection.includes(file.id));
    if (!targets.length) return;
    cancelBulk.current = false;
    setBulk({ label: "تکمیل تصاویر…", done: 0, total: targets.length });
    let repaired = 0;
    let failed = 0;

    for (const file of targets) {
      if (cancelBulk.current) break;
      setBulk({ label: file.title.slice(0, 60), done: repaired + failed, total: targets.length });
      if (await publishOne(file, { repair: true, quiet: true })) repaired += 1;
      else failed += 1;
    }

    setBulk(null);
    setSelection([]);
    await load();

    const summary = `گالری ${fa(repaired)} فایل تکمیل شد${failed ? ` و ${fa(failed)} مورد ناموفق بود` : ""}.`;
    if (failed > 0) toast.warning(summary);
    else toast.success(summary);
  }

  async function bulkApprove() {
    if (syncing || bulk || loading) return;
    const targets = visible.filter((file) => selection.includes(file.id));
    if (!targets.length) return;
    if (
      !window.confirm(
        `تأیید دستی ${fa(targets.length)} فایل؟ مواردی که فیلتر مشاور/آژانس هنوز رد می‌کند هم تأیید می‌شوند و روی فضای شما منتشر خواهند شد.`,
      )
    ) {
      return;
    }

    cancelBulk.current = false;
    setBulk({ label: "تأیید دستی…", done: 0, total: targets.length });
    let approved = 0;
    let failed = 0;

    for (const file of targets) {
      if (cancelBulk.current) break;
      setBulk({ label: file.title.slice(0, 60), done: approved + failed, total: targets.length });
      try {
        await approveDivarFile({ data: { id: file.id, force: true } });
        approved += 1;
      } catch {
        failed += 1;
      }
    }

    setBulk(null);
    setSelection([]);
    await load();
    setTab("accepted");

    const summary = `${fa(approved)} فایل تأیید دستی شد${failed ? ` و ${fa(failed)} مورد ناموفق بود` : ""}.`;
    if (failed > 0) toast.warning(summary);
    else toast.success(summary);
  }

  const sourceVisible = lists[tab];

  const visible = useMemo(
    () => sortDivarFiles(filterDivarFiles(sourceVisible, filters), sortBy),
    [filters, sortBy, sourceVisible],
  );

  const neighborhoodOptions = useMemo(
    () => divarNeighborhoodOptions([...lists.accepted, ...lists.imported, ...lists.rejected]),
    [lists],
  );

  const allVisibleSelected =
    visible.length > 0 && visible.every((file) => selection.includes(file.id));

  const hasFilters =
    filters.search.trim().length > 0 ||
    filters.transaction !== "all" ||
    filters.propertyType !== "all" ||
    filters.neighborhood !== "all" ||
    filters.onlyWithImages ||
    filters.onlyNeedsRepair ||
    filters.minScore > 0 ||
    sortBy !== "newest";

  const withImages = sourceVisible.filter(
    (file) => file.sourceImageCount > 0 || file.images.length > 0,
  ).length;
  const totalImages = sourceVisible.reduce((sum, file) => sum + file.sourceImageCount, 0);
  const needsRepairCount = sourceVisible.filter(
    (file) => divarGalleryHealth(file).needsRepair,
  ).length;
  const remoteImageCount = sourceVisible.reduce(
    (sum, file) => sum + file.publishedRemoteImageCount,
    0,
  );
  const averageScore = sourceVisible.length
    ? Math.round(
        sourceVisible.reduce((sum, file) => sum + divarCompleteness(file).score, 0) /
          sourceVisible.length,
      )
    : 0;

  const emptyText =
    tab === "accepted"
      ? "هنوز فایل شخصی جدیدی دریافت نشده. روی «دریافت فایل‌های دیوار» بزنید."
      : tab === "imported"
        ? "هنوز فایل دیواری به سایت شما وارد نشده است."
        : "فعلاً فایل ردشده‌ای در سابقه فیلتر وجود ندارد.";

  const lastRun = stats.syncRuns.find((run) => run.finishedAt);
  const atPageLimit = loadedCounts[tab] >= TAB_LIMIT_MAX;
  const canLoadMore = !atPageLimit && sourceVisible.length >= loadedCounts[tab];

  function loadMore() {
    if (!canLoadMore || loading || syncing || bulk) return;
    setLoadedCounts((prev) => ({
      ...prev,
      [tab]: Math.min(TAB_LIMIT_MAX, prev[tab] + TAB_LIMIT_STEP),
    }));
  }

  function exportCsv() {
    if (!visible.length) {
      toast.info("فهرست فعلی خالی است؛ چیزی برای خروجی گرفتن نیست.");
      return;
    }
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    const csv = "\ufeff" + divarFilesToCsv(visible, origin);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `hirmand-divar-${tab}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`${fa(visible.length)} مورد در فایل CSV ذخیره شد.`);
  }

  return (
    <section className="divar-wrap">
      <style>{DIVAR_CSS}</style>

      <div className="divar-hero">
        <div>
          <span className="kicker">منبع فایل · Divar</span>
          <h2>فایل‌های دیوار</h2>
          <p>
            فایل‌های شخصی اصفهان از دیوار جمع‌آوری می‌شوند، فیلتر مشاور/آژانس روی آن‌ها اجرا
            می‌شود و بعد از تأیید، تمام تصاویر آگهی روی فضای سایت منتشر می‌شوند. تصویری که CDN
            دیوار ندهد با منبع اصلی و پروکسی اختصاصی سایت نمایش داده می‌شود تا هیچ گالری‌ای ناقص
            نماند. هر آگهی ردشده را می‌توانید دستی بررسی و در صورت نیاز تأیید کنید و هر گالری
            ناقص را با «تکمیل تصاویر» ترمیم کنید.
          </p>
        </div>
        <div className="divar-hero-actions">
          <label className="divar-select-field">
            <span>حجم هر بررسی</span>
            <select
              value={crawlLimit}
              onChange={(event) => setCrawlLimit(Number(event.target.value))}
              disabled={syncing || Boolean(bulk) || loading}
              aria-label="تعداد فایل در هر بررسی دیوار"
            >
              <option value={12}>۱۲ فایل</option>
              <option value={24}>۲۴ فایل</option>
              <option value={36}>۳۶ فایل</option>
              <option value={48}>۴۸ فایل</option>
            </select>
          </label>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => void load()}
            disabled={loading || syncing || Boolean(bulk)}
            title="فقط فهرست و آمار فعلی را تازه کن"
          >
            <RefreshCw size={16} className={loading ? "admin-spin" : ""} />
            تازه‌سازی
          </button>
          <button type="button" className="btn-gold" onClick={() => void sync()} disabled={syncing || Boolean(bulk) || loading}>
            {syncing ? <Loader2 size={16} className="admin-spin" /> : <RefreshCw size={16} />}
            {syncing ? "در حال بررسی دیوار…" : "دریافت فایل‌های دیوار"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="divar-error">
          <span className="divar-error-text">
            <AlertTriangle size={16} />
            {error}
          </span>
          <button type="button" className="btn-ghost" onClick={() => void load()}>
            <RefreshCw size={15} /> تلاش دوباره
          </button>
        </div>
      ) : null}

      <div className="divar-stat-grid">
        <div className="divar-stat accepted">
          <span className="divar-stat-icon">
            <Sparkles size={17} />
          </span>
          <div>
            <small>آماده انتشار</small>
            <strong>{fa(stats.accepted)}</strong>
          </div>
        </div>
        <div className="divar-stat imported">
          <span className="divar-stat-icon">
            <CheckCircle2 size={17} />
          </span>
          <div>
            <small>منتشرشده در سایت</small>
            <strong>{fa(stats.imported)}</strong>
          </div>
        </div>
        <div className="divar-stat rejected">
          <span className="divar-stat-icon">
            <ShieldCheck size={17} />
          </span>
          <div>
            <small>ردشده (مشاور/آژانس)</small>
            <strong>{fa(stats.rejected)}</strong>
          </div>
        </div>
        <div className="divar-stat seen">
          <span className="divar-stat-icon">
            <Eye size={17} />
          </span>
          <div>
            <small>کل آگهی بررسی‌شده</small>
            <strong>{fa(stats.totalSeen)}</strong>
          </div>
        </div>
        <div className="divar-stat synced is-text">
          <span className="divar-stat-icon">
            <Clock3 size={17} />
          </span>
          <div>
            <small>آخرین بررسی</small>
            <strong>{formatDateTime(stats.lastSyncAt)}</strong>
          </div>
        </div>
      </div>

      <div className="divar-history">
        <button
          type="button"
          className={historyOpen ? "divar-history-head is-open" : "divar-history-head"}
          onClick={() => setHistoryOpen((open) => !open)}
          aria-expanded={historyOpen}
        >
          <strong>
            <History size={16} /> گزارش همگام‌سازی‌ها
          </strong>
          <small>
            {lastRun
              ? `آخرین اجرا: ${syncRunBadge(lastRun).label} · ${formatDuration(lastRun.durationMs)} · ${fa(lastRun.inspected)} آگهی بررسی‌شده`
              : "هنوز همگام‌سازی‌ای ثبت نشده"}
          </small>
        </button>
        {historyOpen ? (
          <div className="divar-history-body">
            {stats.syncRuns.length === 0 ? (
              <p className="divar-history-empty">
                سابقه‌ای برای نمایش نیست. با «دریافت فایل‌های دیوار» نخستین گزارش ساخته می‌شود.
              </p>
            ) : (
              stats.syncRuns.map((run) => {
                const badge = syncRunBadge(run);
                return (
                  <div
                    className={
                      run.status === "failed"
                        ? "divar-history-row is-failed"
                        : run.detailFailures > 0
                          ? "divar-history-row is-partial"
                          : "divar-history-row"
                    }
                    key={run.id}
                  >
                    <div>
                      <span className={`divar-history-badge ${badge.className}`}>{badge.label}</span>
                      <time>{formatDateTime(run.finishedAt ?? run.startedAt)}</time>
                    </div>
                    <div>
                      <strong>
                        {fa(run.inspected)} آگهی بررسی شد · {fa(run.newlyVisible)} آماده ·{" "}
                        {fa(run.rejected)} رد شد
                        {run.detailFailures > 0
                          ? ` · جزئیات ${fa(run.detailFailures)} آگهی ناموفق`
                          : ""}
                      </strong>
                      <p>
                        هدف {fa(run.requestedLimit)} فایل · {fa(run.requests)} درخواست به دیوار ·
                        {" "}
                        مدت {formatDuration(run.durationMs)}
                      </p>
                      {run.error ? (
                        <p>
                          <AlertTriangle size={13} style={{ verticalAlign: "middle" }} /> {run.error}
                        </p>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : null}
      </div>

      <div className="divar-note">
        <ImageIcon size={15} style={{ verticalAlign: "middle", marginInlineEnd: 6 }} />
        در این فهرست {fa(withImages)} فایل تصویر دارد و مجموعاً {fa(totalImages)} تصویر منبع وجود
        دارد. میانگین کامل‌بودن اطلاعات {fa(averageScore)}٪ است.
        {tab === "imported" ? (
          <>
            {" "}
            {fa(needsRepairCount)} گالری ناقص است
            {remoteImageCount > 0
              ? ` و ${fa(remoteImageCount)} تصویر از CDN دیوار نمایش داده می‌شود`
              : ""}
            ؛ با «تکمیل تصاویر» می‌توانید گالری‌های ناقص را دوباره از دیوار بخوانید.
          </>
        ) : (
          <> با «تکمیل تصاویر» می‌توان گالری‌های ناقص را دوباره از دیوار خواند.</>
        )}
      </div>

      <div className="admin-panel">
        <div className="divar-toolbar">
          <div>
            <span className="kicker">فهرست</span>
            <h2 style={{ margin: 0, fontSize: 20 }}>{TAB_LABELS[tab]}</h2>
          </div>
          <div className="divar-tabs">
            <button
              type="button"
              className={`divar-tab${tab === "accepted" ? " is-active" : ""}`}
              onClick={() => setTab("accepted")}
            >
              <Filter size={14} /> آماده انتشار <b>{fa(stats.accepted)}</b>
            </button>
            <button
              type="button"
              className={`divar-tab${tab === "imported" ? " is-active" : ""}`}
              onClick={() => setTab("imported")}
            >
              <CheckCircle2 size={14} /> {staffMode ? "واردشده / پیش‌نویس" : "منتشرشده"} <b>{fa(stats.imported)}</b>
            </button>
            <button
              type="button"
              className={`divar-tab${tab === "rejected" ? " is-active" : ""}`}
              onClick={() => setTab("rejected")}
            >
              <ShieldCheck size={14} /> ردشده <b>{fa(stats.rejected)}</b>
            </button>
          </div>
        </div>

        <div className="divar-smart-toolbar">
          <label className="divar-search-box">
            <Search size={17} />
            <input
              value={filters.search}
              onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
              placeholder="جستجو در عنوان، محله، توضیحات، امکانات و لینک آگهی…"
              aria-label="جستجو در فایل‌های دیوار"
            />
            {filters.search ? (
              <button
                type="button"
                className="divar-search-clear"
                onClick={() => setFilters((prev) => ({ ...prev, search: "" }))}
                aria-label="پاک کردن جستجو"
              >
                <X size={15} />
              </button>
            ) : null}
          </label>

          <div className="divar-filter-group">
            <label className="divar-select-field">
              <span>معامله</span>
              <select
                value={filters.transaction}
                onChange={(event) =>
                  setFilters((prev) => ({
                    ...prev,
                    transaction: event.target.value as DivarFilters["transaction"],
                  }))
                }
              >
                <option value="all">همه</option>
                <option value="sell">فروش</option>
                <option value="rent">رهن و اجاره</option>
              </select>
            </label>
            <label className="divar-select-field">
              <span>نوع ملک</span>
              <select
                value={filters.propertyType}
                onChange={(event) =>
                  setFilters((prev) => ({
                    ...prev,
                    propertyType: event.target.value as DivarFilters["propertyType"],
                  }))
                }
              >
                <option value="all">همه</option>
                <option value="apartment">آپارتمان</option>
                <option value="villa">ویلا</option>
              </select>
            </label>
            <label className="divar-select-field">
              <span>محله</span>
              <select
                value={filters.neighborhood}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, neighborhood: event.target.value }))
                }
              >
                <option value="all">همه محله‌ها</option>
                {neighborhoodOptions.map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.value} ({option.count.toLocaleString("fa-IR")})
                  </option>
                ))}
              </select>
            </label>
            <label className="divar-select-field">
              <span>مرتب‌سازی</span>
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value as DivarSortKey)}
              >
                <option value="newest">جدیدترین</option>
                <option value="oldest">قدیمی‌ترین</option>
                <option value="priceAsc">ارزان‌ترین</option>
                <option value="priceDesc">گران‌ترین</option>
                <option value="areaDesc">متراژ بیشتر</option>
                <option value="areaAsc">متراژ کمتر</option>
                <option value="scoreDesc">کامل‌ترین اطلاعات</option>
              </select>
            </label>
            <label className="divar-select-field">
              <span>کامل‌بودن</span>
              <select
                value={filters.minScore}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, minScore: Number(event.target.value) }))
                }
              >
                <option value={0}>بدون محدودیت</option>
                <option value={50}>بالای ۵۰٪</option>
                <option value={75}>بالای ۷۵٪</option>
                <option value={90}>بالای ۹۰٪</option>
              </select>
            </label>
          </div>

          <label className="divar-toggle">
            <input
              type="checkbox"
              checked={filters.onlyWithImages}
              onChange={(event) =>
                setFilters((prev) => ({ ...prev, onlyWithImages: event.target.checked }))
              }
            />
            <span>
              <ImageIcon size={14} /> فقط دارای تصویر
            </span>
          </label>

          {tab === "imported" ? (
            <label className="divar-toggle divar-toggle-warning">
              <input
                type="checkbox"
                checked={filters.onlyNeedsRepair}
                onChange={(event) =>
                  setFilters((prev) => ({ ...prev, onlyNeedsRepair: event.target.checked }))
                }
              />
              <span>
                <RefreshCw size={14} /> فقط گالری‌های نیازمند تکمیل
              </span>
            </label>
          ) : null}

          <div className="divar-toolbar-result">
            <SlidersHorizontal size={14} />
            <strong>{fa(visible.length)}</strong>
            <span>مورد نمایش</span>
            {hasFilters ? (
              <button type="button" onClick={() => setFilters(EMPTY_DIVAR_FILTERS)}>
                پاک کردن فیلترها
              </button>
            ) : null}
            <button type="button" onClick={exportCsv}>
              خروجی CSV
            </button>
          </div>
        </div>

        {bulk ? (
          <div className="divar-bulkbar" role="status">
            <div className="divar-progress" style={{ flex: "1 1 260px", minWidth: 0 }}>
              <div className="divar-progress-bar">
                <span style={{ width: Math.round((bulk.done / bulk.total) * 100) + "%" }} />
              </div>
              <small>
                {fa(bulk.done)} از {fa(bulk.total)} · {bulk.label}
              </small>
            </div>
            <div className="divar-bulk-actions">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  cancelBulk.current = true;
                }}
              >
                <X size={15} /> توقف
              </button>
            </div>
          </div>
        ) : selection.length > 0 ? (
          <div className="divar-bulkbar">
            <strong>
              <CheckSquare size={15} style={{ verticalAlign: "middle", marginInlineEnd: 6 }} />
              {fa(selection.length)} فایل انتخاب شده
            </strong>
            <div className="divar-bulk-actions">
              {tab === "accepted" ? (
                <button type="button" className="btn-gold" onClick={() => void bulkPublish()} disabled={syncing || loading || Boolean(bulk)}>
                  <UploadCloud size={15} /> {staffMode ? "ثبت گروهی پیش‌نویس" : "انتشار گروهی"}
                </button>
              ) : null}
{!staffMode && tab === "imported" ? (
                <button type="button" className="btn-gold" onClick={() => void bulkRepair()} disabled={syncing || loading || Boolean(bulk)}>
                  <RefreshCw size={15} /> تکمیل تصاویر گروهی
                </button>
              ) : null}
{!staffMode && tab === "rejected" ? (
                <button type="button" className="btn-gold" onClick={() => void bulkApprove()} disabled={syncing || loading || Boolean(bulk)}>
                  <ShieldCheck size={15} /> تأیید دستی گروهی
                </button>
              ) : null}
{!staffMode && tab !== "imported" ? (
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={syncing || loading || Boolean(bulk)}
                  onClick={() =>
                    void removeFiles(
                      selection,
                      `حذف ${fa(selection.length)} فایل انتخاب‌شده؟ این عمل قابل بازگشت نیست.`,
                    )
                  }
                >
                  <Trash2 size={15} /> حذف
                </button>
              ) : null}
              <button type="button" className="btn-ghost" disabled={syncing || loading || Boolean(bulk)} onClick={() => setSelection([])}>
                <X size={15} /> لغو انتخاب
              </button>
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="admin-empty">
            <Loader2 size={26} className="admin-spin" />
            <strong>در حال بارگذاری فهرست دیوار…</strong>
          </div>
        ) : visible.length === 0 ? (
          <div className="admin-empty">
            <Sparkles size={28} />
            <strong>{hasFilters ? "چیزی با این فیلترها پیدا نشد." : emptyText}</strong>
            <p>
              {hasFilters
                ? "فیلترها را پاک کنید یا عبارت جستجو را تغییر دهید."
                : "فایل‌های شخصی در اینجا می‌آیند؛ فایل‌های مشاور/آژانس از فهرست حذف می‌شوند."}
            </p>
            {hasFilters ? (
              <>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setFilters(EMPTY_DIVAR_FILTERS)}
                >
                  <RotateCcw size={16} /> پاک کردن فیلترها
                </button>
                {canLoadMore ? (
                  <button type="button" className="btn-ghost" onClick={loadMore}>
                    <Download size={15} /> جستجو در آگهی‌های بعدی
                  </button>
                ) : null}
              </>
            ) : (
              <button
                type="button"
                className="btn-gold"
                onClick={() => void sync()}
                disabled={syncing || Boolean(bulk) || loading}
              >
                <RefreshCw size={16} />
                {syncing ? "در حال بررسی…" : "بررسی دوباره"}
              </button>
            )}
          </div>
        ) : (
          <div className="divar-grid">
            {visible.map((file) => {
              const features = featureSummary(file);
              const health = divarGalleryHealth(file);
              const completeness = divarCompleteness(file);
              const busy = busyId === file.id;
              const selected = selection.includes(file.id);

              return (
                <article
                  className={selected ? "divar-card is-selected" : "divar-card"}
                  key={file.id}
                >
                  <button
                    type="button"
                    className={selected ? "divar-select is-on" : "divar-select"}
                    disabled={syncing || Boolean(bulk)}
                    onClick={() =>
                      setSelection((prev) =>
                        prev.includes(file.id)
                          ? prev.filter((id) => id !== file.id)
                          : [...prev, file.id],
                      )
                    }
                    aria-pressed={selected}
                    aria-label={selected ? `حذف ${file.title} از انتخاب` : `انتخاب ${file.title}`}
                    title={selected ? "حذف از انتخاب" : "انتخاب برای عملیات گروهی"}
                  >
                    {selected ? <CheckSquare size={16} /> : <Square size={16} />}
                  </button>

                  <DivarGallery images={file.images} badge={file.filterStatus} />

                  <div className="divar-body">
                    <h3 className="divar-title">{file.title}</h3>

                    <div className="divar-meta">
                      <span className="divar-chip">{transactionLabel(file)}</span>
                      <span className="divar-chip">{propertyLabel(file)}</span>
                      <span className="divar-chip">
                        <MapPin size={12} /> {file.neighborhood || "اصفهان"}
                      </span>
                      {file.areaM2 ? (
                        <span className="divar-chip">{fa(file.areaM2)} متر</span>
                      ) : null}
                      {file.bedrooms ? (
                        <span className="divar-chip">{fa(file.bedrooms)} خواب</span>
                      ) : null}
                      {file.manualOverride ? (
                        <span className="divar-override-badge">
                          <BadgeCheck size={12} /> تأیید دستی مدیر
                        </span>
                      ) : null}
                    </div>

                    <div className="divar-price">
                      {file.transactionType === "rent" ? (
                        <>
                          {file.deposit ? <span>رهن: {formatMoney(file.deposit)}</span> : null}
                          {file.rent ? <span>اجاره: {formatMoney(file.rent)}</span> : null}
                        </>
                      ) : (
                        <span>قیمت: {formatMoney(file.price)}</span>
                      )}
                    </div>

                    <div className={`divar-gallery-health is-${health.level}`}>
                      <span>
                        <ImageIcon size={13} /> سلامت گالری
                      </span>
                      <strong>{health.label}</strong>
                    </div>

                    <div
                      className={completeness.score >= 75 ? "divar-score is-good" : "divar-score"}
                    >
                      <div className="divar-score-top">
                        <span>
                          <Gauge size={13} style={{ verticalAlign: "middle", marginInlineEnd: 5 }} />
                          کامل‌بودن اطلاعات
                        </span>
                        <strong>{fa(completeness.score)}٪</strong>
                      </div>
                      <div className="divar-score-bar">
                        <span style={{ width: completeness.score + "%" }} />
                      </div>
                      <p className="divar-score-missing">
                        {completeness.missing.length
                          ? `کمبود: ${completeness.missing.join("، ")}`
                          : "همه فیلدهای کلیدی کامل است."}
                      </p>
                    </div>

                    <div className="divar-specs">
                      {file.builtYear ? (
                        <div className="divar-spec">
                          <span>سال ساخت</span>
                          <b>{fa(file.builtYear)}</b>
                        </div>
                      ) : null}
                      <div className="divar-spec">
                        <span>طبقه</span>
                        <b>
                          {file.floorLabel === "suite"
                            ? "سوئیت"
                            : file.floor == null
                              ? "—"
                              : `${fa(file.floor)}${file.totalFloors ? ` از ${fa(file.totalFloors)}` : ""}`}
                        </b>
                      </div>
                      <div className="divar-spec">
                        <span>سرویس</span>
                        <b>{file.bathrooms == null ? "—" : fa(file.bathrooms)}</b>
                      </div>
                      <div className="divar-spec">
                        <span>جهت</span>
                        <b>{file.orientation ? DIVAR_ORIENTATION_LABELS[file.orientation] : "—"}</b>
                      </div>
                      <div className="divar-spec">
                        <span>املاک‌کننده</span>
                        <b>{file.sellerName ?? "نامشخص"}</b>
                      </div>
                      <div className="divar-spec">
                        <span>سطح آگهی</span>
                        <b>
                          {file.manualOverride
                            ? "تأیید دستی"
                            : file.sellerType === "مشاور املاک" || file.sellerType === "business"
                              ? "مشاور/آژانس"
                              : "شخصی"}
                        </b>
                      </div>
                    </div>

                    {features.length ? (
                      <div className="divar-features">
                        {features.map((feature) => (
                          <span key={feature} className="divar-feature">
                            {feature}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    <p className="divar-description">
                      {file.description ||
                        "توضیحی برای این آگهی ذخیره نشده؛ با «تأیید دستی» اطلاعات دوباره از دیوار خوانده می‌شود."}
                    </p>

                    <div className="divar-meta">
                      <span className="divar-mini">
                        <Clock3 size={13} /> آخرین مشاهده:{" "}
                        {new Date(file.lastSeenAt).toLocaleDateString("fa-IR")}
                      </span>
                      {file.filterStatus === "imported" && file.publishedImageCount > 0 ? (
                        <span className="divar-hosted-badge">
                          <BadgeCheck size={12} /> {fa(file.publishedHostedImageCount)} تصویر
                          میزبانی‌شده
                        </span>
                      ) : null}
                      {file.publishedRemoteImageCount > 0 ? (
                        <span className="divar-remote-badge">
                          {fa(file.publishedRemoteImageCount)} تصویر با منبع دیوار
                        </span>
                      ) : null}
                      {file.sourceImageCount > DIVAR_MAX_PUBLISHED_IMAGES ? (
                        <span className="divar-mini">
                          {fa(DIVAR_MAX_PUBLISHED_IMAGES)} تصویر نخست منتشر می‌شود
                        </span>
                      ) : null}
                    </div>

                    {busy ? (
                      <div className="divar-progress" role="status">
                        {progress > 0 ? (
                          <div
                            className={
                              progress >= 92
                                ? "divar-progress-bar is-indeterminate"
                                : "divar-progress-bar"
                            }
                          >
                            <span style={progress >= 92 ? undefined : { width: progress + "%" }} />
                          </div>
                        ) : null}
                        <small>
                          {progress === 0 ? (
                            <Loader2
                              size={13}
                              className="admin-spin"
                              style={{ verticalAlign: "middle", marginInlineEnd: 5 }}
                            />
                          ) : null}
                          {busyStage || "در حال پردازش…"}
                        </small>
                      </div>
                    ) : null}

                    <div className="divar-actions">
                      <a className="btn-ghost" href={file.sourceUrl} target="_blank" rel="noreferrer">
                        <ExternalLink size={15} /> مشاهده در دیوار
                      </a>
                      {file.latitude != null && file.longitude != null ? (
                        <a
                          className="btn-ghost"
                          href={`https://www.google.com/maps?q=${file.latitude},${file.longitude}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <MapPin size={15} /> نقشه
                        </a>
                      ) : null}

                      {!staffMode && tab === "rejected" ? (
                        <button
                          type="button"
                          className="btn-gold"
                          disabled={busy || syncing || Boolean(bulk)}
                          onClick={() => void approve(file)}
                        >
                          {busy ? (
                            <Loader2 size={15} className="admin-spin" />
                          ) : (
                            <BadgeCheck size={15} />
                          )}
                          {busy ? "در حال بررسی…" : "تأیید دستی"}
                        </button>
                      ) : tab === "accepted" ? (
                        <button
                          type="button"
                          className="btn-gold"
                          disabled={busy || syncing || Boolean(bulk)}
                          onClick={() => void publish(file)}
                        >
                          {busy ? (
                            <Loader2 size={15} className="admin-spin" />
                          ) : (
                            <UploadCloud size={15} />
                          )}
                          {busy ? (staffMode ? "در حال ثبت…" : "در حال انتشار…") : (staffMode ? "ثبت پیش‌نویس در هیرمند" : "انتشار در سایت")}
                        </button>
                      ) : staffMode ? null : (
                        <button
                          type="button"
                          className="btn-gold"
                          disabled={busy || syncing || Boolean(bulk)}
                          onClick={() => void publish(file, { repair: true })}
                        >
                          {busy ? (
                            <Loader2 size={15} className="admin-spin" />
                          ) : (
                            <UploadCloud size={15} />
                          )}
                          {busy
                            ? "در حال تکمیل تصاویر…"
                            : health.needsRepair
                              ? "تکمیل تصاویر"
                              : "بازبینی و تکمیل گالری"}
                        </button>
                      )}

                      {file.importedPropertyId ? (
                        <a
                          className="btn-ghost"
                          href={propertyPath({
                            id: file.importedPropertyId,
                            slug: file.propertySlug ?? "",
                          })}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Import size={15} /> مشاهده فایل سایت
                        </a>
                      ) : null}

                      {!staffMode && file.manualOverride ? (
                        <button
                          type="button"
                          className="btn-ghost"
                          disabled={busy || syncing || Boolean(bulk)}
                          onClick={() => void revoke(file)}
                        >
                          <RotateCcw size={15} /> لغو تأیید دستی
                        </button>
                      ) : null}

                      {!staffMode && file.filterStatus !== "imported" ? (
                        <button
                          type="button"
                          className="btn-ghost"
                          disabled={busy || syncing || Boolean(bulk)}
                          onClick={() =>
                            void removeFiles([file.id], `حذف «${file.title}» از فهرست دیوار؟`)
                          }
                          title="حذف از فهرست دیوار"
                          aria-label="حذف از فهرست دیوار"
                        >
                          <Trash2 size={15} />
                        </button>
                      ) : null}
                    </div>

                    {tab === "rejected" && file.rejectReason ? (
                      <span className="divar-reject-reason">
                        <ShieldCheck size={14} /> {file.rejectReason}
                      </span>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {!loading && visible.length > 0 ? (
          <div className="divar-loadmore">
            <button
              type="button"
              className="btn-ghost"
              onClick={() =>
                setSelection((prev) => {
                  const ids = visible.map((file) => file.id);
                  if (ids.every((id) => prev.includes(id))) {
                    return prev.filter((id) => !ids.includes(id));
                  }
                  return [...new Set([...prev, ...ids])];
                })
              }
            >
              <CheckSquare size={15} />
              {allVisibleSelected
                ? "لغو انتخاب این فهرست"
                : `انتخاب همه ${fa(visible.length)} مورد`}
            </button>
            {canLoadMore ? (
              <button
                type="button"
                className="btn-ghost"
                onClick={loadMore}
              >
                <Download size={15} /> نمایش بیشتر
              </button>
            ) : null}
            <small>
              {fa(visible.length)} مورد نمایش‌داده‌شده
              {atPageLimit
                ? " · سقف پیمایش ۲۰٬۰۰۰ مورد در هر تب است."
                : canLoadMore
                  ? " · برای دیدن موارد بعدی «نمایش بیشتر» را بزنید."
                  : " · همه موارد بارگذاری شده است."}
            </small>
          </div>
        ) : null}
      </div>

      <div className="divar-warning">
        <ShieldCheck size={15} style={{ verticalAlign: "middle", marginInlineEnd: 6 }} />
        فیلتر مشاور عمداً سخت‌گیرانه است: نوع «مشاور املاک» از داده دیوار رد می‌شود و متن‌هایی مثل
        «مشاور املاک تماس نگیرد»، «املاک ...» و «آژانس ...» هم حذف می‌شوند. فایل ردشده وارد سایت یا
        رسانه‌های شما نمی‌شود؛ اما اگر مطمئنید آگهی شخصی است، با «تأیید دستی» اطلاعات همان آگهی دوباره
        از دیوار خوانده و فایل به فهرست آماده انتشار منتقل می‌شود. این تصمیم تا زمانی که خودتان لغو
        نکنید در همگام‌سازی‌های بعدی حفظ می‌شود.
      </div>
    </section>
  );
}
