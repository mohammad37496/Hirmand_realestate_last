import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Download, File, Folder, FolderOpen, RefreshCw, Search, Smartphone } from "lucide-react";
import { listPhoneBridgeDevices } from "@/lib/admin-phone-bridge";
import {
  createPhoneBridgeRemoteCommand,
  getPhoneBridgeRemoteCommand,
  listPhoneBridgeFileEntries,
} from "@/lib/admin-phone-bridge-remote";

type Device = Awaited<ReturnType<typeof listPhoneBridgeDevices>>[number];
type FileEntry = Awaited<ReturnType<typeof listPhoneBridgeFileEntries>>["entries"][number];
const PAGE_SIZE = 100;

function messageOf(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value < 0) return "—";
  if (value < 1024) return value.toLocaleString("fa-IR") + " بایت";
  const units = ["کیلوبایت", "مگابایت", "گیگابایت"];
  let size = value / 1024;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return size.toLocaleString("fa-IR", { maximumFractionDigits: 1 }) + " " + units[index];
}

export function AdminPhoneBridgeFileManager() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [devicesLoading, setDevicesLoading] = useState(true);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [entriesError, setEntriesError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [busyAction, setBusyAction] = useState<"pick_folder" | string | null>(null);
  const [commandMessage, setCommandMessage] = useState("");
  const entriesRequestId = useRef(0);
  const mountedRef = useRef(false);
  const pollTimeoutRef = useRef<number | null>(null);
  const resolvePollRef = useRef<(() => void) | null>(null);

  const selectedDevice = useMemo(() => devices.find((device) => device.id === deviceId) ?? null, [devices, deviceId]);
  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const loadDevices = useCallback(async () => {
    setDevicesLoading(true);
    setError(null);
    try {
      const result = await listPhoneBridgeDevices({ data: { limit: 100 } });
      if (!mountedRef.current) return;
      setDevices(result);
      setDeviceId((current) => current && result.some((device) => device.id === current) ? current : result[0]?.id ?? "");
    } catch (loadError) {
      if (mountedRef.current) setError(messageOf(loadError, "فهرست دستگاه‌ها بارگذاری نشد."));
    } finally {
      if (mountedRef.current) setDevicesLoading(false);
    }
  }, []);

  const loadEntries = useCallback(async (targetPage = page, targetDeviceId = deviceId, targetSearch = search) => {
    const requestId = ++entriesRequestId.current;
    if (!targetDeviceId) {
      setEntries([]);
      setTotalCount(0);
      setEntriesError(null);
      setEntriesLoading(false);
      return;
    }
    setEntriesLoading(true);
    setEntriesError(null);
    try {
      const result = await listPhoneBridgeFileEntries({
        data: {
          deviceId: targetDeviceId,
          search: targetSearch,
          limit: PAGE_SIZE,
          offset: targetPage * PAGE_SIZE,
        },
      });
      if (requestId !== entriesRequestId.current) return;
      setEntries(result.entries);
      setTotalCount(result.totalCount);
    } catch (loadError) {
      if (requestId === entriesRequestId.current) setEntriesError(messageOf(loadError, "درخت فایل‌ها بارگذاری نشد."));
    } finally {
      if (requestId === entriesRequestId.current) setEntriesLoading(false);
    }
  }, [deviceId, page, search]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      entriesRequestId.current += 1;
      if (pollTimeoutRef.current !== null) window.clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
      resolvePollRef.current?.();
      resolvePollRef.current = null;
    };
  }, []);

  useEffect(() => {
    void loadDevices();
  }, [loadDevices]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  const waitForCommand = useCallback(async (commandId: string) => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const command = await getPhoneBridgeRemoteCommand({ data: { commandId } });
      if (!mountedRef.current) throw new Error("Phone Bridge command polling cancelled.");
      if (!command) throw new Error("فرمان Phone Bridge پیدا نشد.");
      setCommandMessage(
        command.status === "queued" ? "فرمان در صف دستگاه است…" :
        command.status === "running" ? "درخواست در حال اجرا روی دستگاه است…" :
        command.status === "succeeded" ? "عملیات با موفقیت انجام شد." :
        command.errorMessage || "عملیات روی دستگاه کامل نشد.",
      );
      if (command.status === "succeeded") return command;
      if (command.status === "failed" || command.status === "expired") {
        throw new Error(command.errorMessage || "فرمان ناموفق یا منقضی شد.");
      }
      await new Promise<void>((resolve) => {
        resolvePollRef.current = resolve;
        pollTimeoutRef.current = window.setTimeout(() => {
          pollTimeoutRef.current = null;
          resolvePollRef.current = null;
          resolve();
        }, 1500);
      });
      if (!mountedRef.current) throw new Error("Phone Bridge command polling cancelled.");
    }
    throw new Error("پاسخی از دستگاه دریافت نشد؛ وضعیت فرمان را دوباره بررسی کنید.");
  }, []);

  async function refreshTree() {
    if (!deviceId || busyAction) return;
    setBusyAction("pick_folder");
    setError(null);
    setCommandMessage("درخواست انتخاب پوشه به دستگاه ارسال می‌شود…");
    try {
      const created = await createPhoneBridgeRemoteCommand({
        data: { deviceId, action: "manage_files", operation: "pick_folder" },
      });
      if (!created.success || !created.commandId) throw new Error("فرمان انتخاب پوشه ایجاد نشد؛ وضعیت اتصال و مجوز دستگاه را بررسی کنید.");
      const command = await waitForCommand(created.commandId);
      if (!command.result?.rootUri) throw new Error("دستگاه پوشه‌ای را برای همگام‌سازی تأیید نکرد.");
      setPage(0);
      await loadEntries(0, deviceId, search);
    } catch (actionError) {
      if (mountedRef.current) setError(messageOf(actionError, "همگام‌سازی درخت فایل انجام نشد."));
    } finally {
      if (mountedRef.current) setBusyAction(null);
    }
  }

  async function downloadFile(entry: FileEntry) {
    if (!deviceId || entry.isDirectory || busyAction) return;
    setBusyAction(entry.uri);
    setError(null);
    setCommandMessage("درخواست دریافت فایل به دستگاه ارسال می‌شود…");
    try {
      const created = await createPhoneBridgeRemoteCommand({
        data: { deviceId, action: "manage_files", operation: "download", uri: entry.uri },
      });
      if (!created.success || !created.commandId) throw new Error("فرمان دریافت فایل ایجاد نشد.");
      const command = await waitForCommand(created.commandId);
      const fileId = command.result?.fileId;
      if (!fileId) throw new Error("دستگاه فایل را ارسال کرد اما شناسهٔ فایل در پاسخ موجود نیست.");
      window.location.assign("/api/admin/phone-bridge/files/" + encodeURIComponent(fileId));
    } catch (actionError) {
      if (mountedRef.current) setError(messageOf(actionError, "دریافت فایل انجام نشد."));
    } finally {
      if (mountedRef.current) setBusyAction(null);
    }
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(0);
    setSearch(searchInput.trim());
  }

  return (
    <section className="admin-panel" aria-labelledby="phone-bridge-files-title">
      <div className="admin-panel-head">
        <div>
          <span className="kicker">Phone Bridge · مدیریت امن فایل</span>
          <h2 id="phone-bridge-files-title">درخت فایل‌های انتخاب‌شده</h2>
          <p>فقط پوشه‌ای نمایش داده می‌شود که کاربر دستگاه از طریق انتخاب‌گر رسمی Android اجازهٔ دسترسی به آن را داده است.</p>
        </div>
        <button type="button" className="btn-ghost" onClick={() => void loadDevices()} disabled={devicesLoading || !!busyAction}>
          <RefreshCw size={15} aria-hidden="true" /> بروزرسانی دستگاه‌ها
        </button>
      </div>

      {error ? <div role="alert" className="admin-error-banner">{error}</div> : null}

      <div className="admin-list-toolbar" style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, flex: "1 1 260px" }}>
          <Smartphone size={17} aria-hidden="true" />
          <span className="sr-only">انتخاب دستگاه</span>
          <select
            value={deviceId}
            onChange={(event) => { setDeviceId(event.target.value); setPage(0); }}
            disabled={devicesLoading || devices.length === 0 || !!busyAction}
            style={{ width: "100%", minHeight: 42 }}
          >
            <option value="">{devicesLoading ? "در حال دریافت دستگاه‌ها…" : "انتخاب دستگاه"}</option>
            {devices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name} · {device.manufacturer} {device.model}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn-gold" onClick={() => void refreshTree()} disabled={!deviceId || !selectedDevice?.enabled || !!busyAction || devicesLoading}>
          <FolderOpen size={16} aria-hidden="true" /> انتخاب پوشه و همگام‌سازی
        </button>
      </div>

      {!devicesLoading && !error && devices.length === 0 ? (
        <div className="admin-empty-state" role="status">دستگاه Phone Bridge ثبت‌شده‌ای برای این حساب پیدا نشد.</div>
      ) : null}

      {selectedDevice ? (
        <p className="admin-dashboard-summary" style={{ margin: "12px 0" }}>
          دستگاه: <strong>{selectedDevice.name}</strong> · {selectedDevice.model || selectedDevice.manufacturer || "مدل نامشخص"} · {selectedDevice.enabled ? "فعال" : "غیرفعال"}
        </p>
      ) : null}

      {commandMessage ? <p role="status" aria-live="polite" style={{ margin: "10px 0" }}>{commandMessage}</p> : null}

      <form onSubmit={submitSearch} className="admin-list-toolbar" style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <label className="admin-search" style={{ flex: 1 }}>
          <Search size={16} aria-hidden="true" />
          <input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="جستجو در نام یا مسیر فایل…" aria-label="جستجوی درخت فایل" />
        </label>
        <button type="submit" className="btn-ghost" disabled={!deviceId || entriesLoading || !!busyAction}>
          <Search size={15} aria-hidden="true" /> جستجو
        </button>
      </form>

      {entriesError ? (
        <div role="alert" className="admin-error-banner">
          {entriesError}
          <button type="button" className="btn-ghost" onClick={() => void loadEntries()} disabled={entriesLoading}>تلاش دوباره</button>
        </div>
      ) : null}

      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", margin: "14px 0" }}>
        <strong>{totalCount.toLocaleString("fa-IR")} مورد</strong>
        <span>{entriesLoading ? "در حال بارگذاری…" : "صفحه " + (page + 1).toLocaleString("fa-IR") + " از " + pageCount.toLocaleString("fa-IR")}</span>
      </div>

      <div style={{ overflowX: "auto", width: "100%" }}>
        <table style={{ width: "100%", minWidth: 560, borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th scope="col" style={{ textAlign: "start", padding: 10 }}>نام و مسیر</th>
              <th scope="col" style={{ textAlign: "start", padding: 10 }}>اندازه</th>
              <th scope="col" style={{ textAlign: "start", padding: 10 }}>آخرین تغییر</th>
              <th scope="col" style={{ textAlign: "end", padding: 10 }}>عملیات</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const depth = Math.min(12, Math.max(0, entry.relativePath.split("/").length - 1));
              const modified = entry.modifiedAt > 0 ? new Date(entry.modifiedAt).toLocaleString("fa-IR") : "—";
              return (
                <tr key={entry.id}>
                  <td style={{ padding: 10, borderTop: "1px solid var(--border, #e5e7eb)" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 7, paddingInlineStart: depth * 14 }}>
                      {entry.isDirectory ? <Folder size={16} aria-hidden="true" /> : <File size={16} aria-hidden="true" />}
                      <span>{entry.name}</span>
                    </span>
                    <small style={{ display: "block", opacity: 0.7, paddingInlineStart: depth * 14 + 23 }}>{entry.relativePath}</small>
                  </td>
                  <td style={{ padding: 10, borderTop: "1px solid var(--border, #e5e7eb)" }}>{entry.isDirectory ? "پوشه" : formatBytes(entry.sizeBytes)}</td>
                  <td style={{ padding: 10, borderTop: "1px solid var(--border, #e5e7eb)" }}>{modified}</td>
                  <td style={{ padding: 10, borderTop: "1px solid var(--border, #e5e7eb)", textAlign: "end" }}>
                    {!entry.isDirectory ? (
                      <button type="button" className="btn-ghost" onClick={() => void downloadFile(entry)} disabled={!!busyAction || !selectedDevice?.enabled} aria-label={entry.name}>
                        <Download size={15} aria-hidden="true" /> دریافت
                      </button>
                    ) : <span>—</span>}
                  </td>
                </tr>
              );
            })}
            {!entriesLoading && !entriesError && entries.length === 0 ? (
              <tr><td colSpan={4} style={{ padding: 22, textAlign: "center" }}>فایلی در این پوشه پیدا نشد؛ ابتدا پوشه را انتخاب و همگام‌سازی کنید.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 16 }}>
        <button type="button" className="btn-ghost" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={page <= 0 || entriesLoading}>قبلی</button>
        <button type="button" className="btn-ghost" onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))} disabled={page >= pageCount - 1 || entriesLoading}>بعدی</button>
      </div>
    </section>
  );
}