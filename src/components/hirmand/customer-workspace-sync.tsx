import { Cloud, RefreshCw, ShieldCheck } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { authEnabled, getBearerToken } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { chooseCustomerWorkspaceSync, mergeCustomerWorkspaceThreeWay } from "@/lib/customer-workspace-sync-plan.mjs";
import { clearWorkspaceForSignedOutUser, resetWorkspaceForAccountSwitch } from "@/lib/customer-workspace-account-switch.mjs";
import "@/customer-workspace-sync.css";

const FAVORITES_KEY = "hirmand-favorite-properties";
const FAVORITE_META_KEY = "hirmand-favorite-meta-v1";
const SAVED_SEARCHES_KEY = "hirmand-saved-searches";
const RECENT_KEY = "hirmand-recent-properties";
const WORKSPACE_OWNER_KEY = "hirmand-workspace-owner-v1";
const WORKSPACE_PENDING_KEY = "hirmand-workspace-pending-v1";
const WORKSPACE_BASE_KEY = "hirmand-workspace-base-v1:";

type SavedSearch = {
  id: string;
  name: string;
  params: string;
  alerts?: boolean;
  lastCheckedAt?: string;
};

type Workspace = {
  favorites: string[];
  favoriteMeta: Record<string, { tag?: string; note?: string }>;
  savedSearches: SavedSearch[];
  recentProperties: string[];
};

type WorkspaceBase = { ownerId: string; revision: string | null; workspace: Workspace };
type RemoteWorkspace = Workspace & { ownerId?: string; revision: string | null; updatedAt?: string | null };

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    const serialized = JSON.stringify(value);
    if (localStorage.getItem(key) !== serialized) localStorage.setItem(key, serialized);
  } catch {
    // Local storage remains an optional fallback.
  }
}

function normalizeWorkspace(value: unknown): Workspace {
  const workspace = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const favorites = workspace.favorites;
  const recentProperties = workspace.recentProperties;
  const savedSearches = workspace.savedSearches;
  const favoriteMeta = workspace.favoriteMeta;
  const validMeta = favoriteMeta && typeof favoriteMeta === "object" && !Array.isArray(favoriteMeta)
    ? Object.fromEntries(Object.entries(favoriteMeta)
      .filter(([slug, meta]) => Boolean(slug.trim() && slug.length <= 220 && meta && typeof meta === "object" && !Array.isArray(meta)))
      .slice(0, 200)
      .map(([slug, meta]) => {
        const item = meta as Record<string, unknown>;
        return [slug, {
          ...(typeof item.tag === "string" ? { tag: item.tag.slice(0, 40) } : {}),
          ...(typeof item.note === "string" ? { note: item.note.slice(0, 500) } : {}),
        }];
      }))
    : {};
  return {
    favorites: Array.isArray(favorites) ? favorites.filter((item): item is string => typeof item === "string" && item.trim().length > 0 && item.length <= 220).slice(0, 200) : [],
    recentProperties: Array.isArray(recentProperties) ? recentProperties.filter((item): item is string => typeof item === "string" && item.trim().length > 0 && item.length <= 220).slice(0, 20) : [],
    savedSearches: Array.isArray(savedSearches) ? savedSearches
      .filter((item): item is SavedSearch => Boolean(item && typeof item === "object" && typeof item.id === "string" && item.id.length <= 80 && typeof item.name === "string" && typeof item.params === "string" && item.name.length <= 120 && item.params.length <= 1500))
      .map((item) => ({
        id: item.id,
        name: item.name,
        params: item.params,
        ...(typeof item.alerts === "boolean" ? { alerts: item.alerts } : {}),
        ...(typeof item.lastCheckedAt === "string" ? { lastCheckedAt: item.lastCheckedAt.slice(0, 80) } : {}),
      })).slice(0, 10) : [],
    favoriteMeta: validMeta,
  };
}

function localWorkspace(): Workspace {
  return normalizeWorkspace({
    favorites: readJson<unknown>(FAVORITES_KEY, []),
    recentProperties: readJson<unknown>(RECENT_KEY, []),
    savedSearches: readJson<unknown>(SAVED_SEARCHES_KEY, []),
    favoriteMeta: readJson<unknown>(FAVORITE_META_KEY, {}),
  });
}

function persistWorkspace(workspace: Workspace) {
  writeJson(FAVORITES_KEY, workspace.favorites);
  writeJson(RECENT_KEY, workspace.recentProperties);
  writeJson(SAVED_SEARCHES_KEY, workspace.savedSearches);
  writeJson(FAVORITE_META_KEY, workspace.favoriteMeta);
}

function sameWorkspace(left: Workspace, right: Workspace) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function readBase(userId: string): WorkspaceBase | null {
  const value = readJson<unknown>(`${WORKSPACE_BASE_KEY}${encodeURIComponent(userId)}`, null);
  if (!value || typeof value !== "object") return null;
  const base = value as Record<string, unknown>;
  if (base.ownerId !== userId || !(base.revision === null || typeof base.revision === "string")) return null;
  return { ownerId: userId, revision: base.revision, workspace: normalizeWorkspace(base.workspace) };
}

function saveBase(userId: string, revision: string | null, workspace: Workspace) {
  writeJson(`${WORKSPACE_BASE_KEY}${encodeURIComponent(userId)}`, { ownerId: userId, revision, workspace });
}

type CustomerWorkspaceSyncState = {
  user: ReturnType<typeof useCurrentUserState>["user"];
  isPending: boolean;
  busy: boolean;
  status: string;
  retry: () => void;
};

const CustomerWorkspaceSyncContext = createContext<CustomerWorkspaceSyncState | null>(null);

export function CustomerWorkspaceSyncProvider({
  enabled = true,
  children,
}: { enabled?: boolean; children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  // useCurrentUserState normalizes a fresh user object on each render. Effects
  // that subscribe to workspace events must key off the stable account ID,
  // otherwise every sync state update tears down and re-adds their listeners.
  const userId = user?.id ?? null;
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const bootedUser = useRef<string | null>(null);
  const activeUserId = useRef<string | null>(userId);
  const syncInFlight = useRef(false);
  const syncQueued = useRef(false);
  const syncRef = useRef<() => void>(() => {});
  useEffect(() => {
    activeUserId.current = userId;
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    resetWorkspaceForAccountSwitch({ storage: localStorage, target: window, userId });
  }, [userId]);

  const sync = useCallback(async () => {
    if (!userId || !authEnabled) return;
    if (syncInFlight.current) {
      syncQueued.current = true;
      return;
    }
    syncInFlight.current = true;
    setBusy(true);
    setStatus("");
    let pendingMarker: string | null = null;
    let attemptedPush = false;
    try {
      const bearerToken = getBearerToken();
      const headers = {
        accept: "application/json",
        ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
      };
      const fetchRemote = async (): Promise<RemoteWorkspace> => {
        const response = await fetch("/api/customer-workspace", { credentials: "same-origin", headers });
        if (!response.ok) throw new Error("فضای شخصی هنوز آماده نیست.");
        const value = await response.json() as RemoteWorkspace;
        if (activeUserId.current !== userId) throw new Error("نشست حساب تغییر کرده است؛ صفحه را تازه‌سازی کنید.");
        if (value.ownerId !== userId) throw new Error("نشست حساب تغییر کرده است؛ صفحه را تازه‌سازی کنید.");
        if (!(value.revision === null || (typeof value.revision === "string" && /^[1-9][0-9]{0,18}$/.test(value.revision)))) {
          throw new Error("نسخه فضای شخصی نامعتبر است.");
        }
        return { ...normalizeWorkspace(value), ownerId: value.ownerId, revision: value.revision, updatedAt: value.updatedAt ?? null };
      };

      let remote = await fetchRemote();
      let storedOwner: string | null = null;
      try {
        storedOwner = localStorage.getItem(WORKSPACE_OWNER_KEY);
        pendingMarker = localStorage.getItem(WORKSPACE_PENDING_KEY);
      } catch {
        // Remote-only sync remains available without local storage.
      }
      const local = localWorkspace();
      const ownerMatches = storedOwner === userId;
      const baseRecord = ownerMatches ? readBase(userId) : null;
      const ownershipDecision = chooseCustomerWorkspaceSync({
        remote,
        local,
        ownerId: storedOwner,
        currentUserId: userId,
        pendingLocalChanges: Boolean(pendingMarker),
      });
      // A missing base is a first sync / upgrade path: treat both snapshots as
      // additions against empty state rather than silently discarding either.
      const base = baseRecord?.workspace ?? { favorites: [], favoriteMeta: {}, savedSearches: [], recentProperties: [] };
      let merged = ownershipDecision.direction === "pull" && storedOwner !== null && storedOwner !== userId
        ? remote
        : mergeCustomerWorkspaceThreeWay(base, local, remote);

      const ensurePendingMarker = (): boolean => {
        if (pendingMarker) return true;
        const marker = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        try {
          if (localStorage.getItem(WORKSPACE_PENDING_KEY) !== null) {
            syncQueued.current = true;
            return false;
          }
          localStorage.setItem(WORKSPACE_PENDING_KEY, marker);
          pendingMarker = marker;
        } catch {
          // Marker is a local safeguard, not a server-side requirement.
        }
        return true;
      };

      if (!sameWorkspace(merged, remote)) {
        if (!ensurePendingMarker()) return;
        attemptedPush = true;
        let savedRevision: string | null = null;
        let committedWorkspace: Workspace | null = null;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          if (activeUserId.current !== userId) return;
          const postResponse = await fetch("/api/customer-workspace", {
            method: "POST",
            credentials: "same-origin",
            headers: {
              "content-type": "application/json",
              ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
            },
            body: JSON.stringify({ ...merged, ownerId: userId, expectedRevision: remote.revision }),
          });
          const saved = await postResponse.json().catch(() => null) as { success?: boolean; revision?: string } | null;
          if (postResponse.ok && saved?.success && typeof saved.revision === "string") {
            savedRevision = saved.revision;
            committedWorkspace = merged;
            break;
          }
          if (postResponse.status !== 409 || attempt === 2) {
            throw new Error(postResponse.status === 409 ? "فضای شخصی روی دستگاه دیگری تغییر کرده است؛ دوباره تلاش کنید." : "ذخیره‌سازی فضای شخصی انجام نشد.");
          }
          remote = await fetchRemote();
          merged = mergeCustomerWorkspaceThreeWay(base, localWorkspace(), remote);
        }
        if (!committedWorkspace || savedRevision === null) {
          throw new Error("ذخیره‌سازی فضای شخصی پس از چند تلاش انجام نشد.");
        }
        const latestMarker = (() => {
          try { return localStorage.getItem(WORKSPACE_PENDING_KEY); } catch { return pendingMarker; }
        })();
        if (latestMarker === pendingMarker) persistWorkspace(committedWorkspace);
        else syncQueued.current = true;
        saveBase(userId, savedRevision, committedWorkspace);
        try {
          localStorage.setItem(WORKSPACE_OWNER_KEY, userId);
          if (pendingMarker && localStorage.getItem(WORKSPACE_PENDING_KEY) === pendingMarker) {
            localStorage.removeItem(WORKSPACE_PENDING_KEY);
          } else if (localStorage.getItem(WORKSPACE_PENDING_KEY) !== null) {
            syncQueued.current = true;
          }
        } catch {
          // The server and base revision are committed even if local bookkeeping fails.
        }
      } else {
        persistWorkspace(merged);
        saveBase(userId, remote.revision, merged);
        try {
          localStorage.setItem(WORKSPACE_OWNER_KEY, userId);
          if (pendingMarker && localStorage.getItem(WORKSPACE_PENDING_KEY) === pendingMarker) {
            localStorage.removeItem(WORKSPACE_PENDING_KEY);
          }
        } catch {
          // Remote state is authoritative even when local bookkeeping is unavailable.
        }
      }

      if (activeUserId.current !== userId) return;
      window.dispatchEvent(new CustomEvent("hirmand:workspace-synced"));
      setStatus("فضای شخصی شما بین دستگاه‌ها همگام شد.");
    } catch (error) {
      if (attemptedPush && !pendingMarker) {
        try {
          pendingMarker = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
          localStorage.setItem(WORKSPACE_PENDING_KEY, pendingMarker);
        } catch {
          // Keep visible error state even if browser storage is unavailable.
        }
      }
      setStatus(error instanceof Error ? error.message : "همگام‌سازی انجام نشد.");
    } finally {
      setBusy(false);
      syncInFlight.current = false;
      if (syncQueued.current) {
        syncQueued.current = false;
        syncRef.current();
      }
    }
  }, [userId]);

  useEffect(() => {
    syncRef.current = () => { void sync(); };
  }, [sync]);

  useEffect(() => {
    if (!enabled || isPending || !userId || !authEnabled || bootedUser.current === userId) return;
    bootedUser.current = userId;
    void sync();
  }, [enabled, isPending, userId, sync]);

  useEffect(() => {
    if (!enabled || isPending || !userId || !authEnabled) return;
    let timer: number | undefined;
    const queueSync = (markLocalChange: boolean) => {
      if (markLocalChange) {
        try {
          localStorage.setItem(WORKSPACE_PENDING_KEY, `${Date.now()}-${Math.random().toString(36).slice(2)}`);
        } catch {
          // Sync still runs; the pending marker only resolves cross-device conflicts.
        }
      }
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = undefined;
        void sync();
      }, 700);
    };
    const onWorkspaceChanged = () => queueSync(true);
    const onFocus = () => queueSync(false);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") queueSync(false);
    };
    const onStorage = (event: StorageEvent) => {
      if ([FAVORITES_KEY, FAVORITE_META_KEY, SAVED_SEARCHES_KEY, RECENT_KEY, WORKSPACE_PENDING_KEY].includes(event.key ?? "")) {
        queueSync(false);
      }
    };
    window.addEventListener("hirmand:workspace-changed", onWorkspaceChanged);
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener("hirmand:workspace-changed", onWorkspaceChanged);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled, isPending, userId, sync]);

  useEffect(() => {
    if (!enabled || isPending || userId || !authEnabled) return;
    clearWorkspaceForSignedOutUser({ storage: localStorage, target: window });
  }, [enabled, isPending, userId]);

  return (
    <CustomerWorkspaceSyncContext.Provider value={{ user, isPending, busy, status, retry: () => { void sync(); } }}>
      {children}
    </CustomerWorkspaceSyncContext.Provider>
  );
}

export function CustomerWorkspaceSyncStatus() {
  const workspace = useContext(CustomerWorkspaceSyncContext);
  if (!workspace || !authEnabled || workspace.isPending) return null;
  const { user, busy, status, retry } = workspace;
  if (!user) {
    return (
      <section className="customer-workspace-sync customer-workspace-signin">
        <div className="customer-workspace-icon"><Cloud size={20} /></div>
        <div>
          <strong>فضای شخصی هیرمند</strong>
          <p>برای نگه‌داشتن علاقه‌مندی‌ها و جست‌وجوها روی موبایل و کامپیوتر، وارد حساب شوید.</p>
        </div>
        <Link to="/login" search={{ next: "/favorites" }} className="btn-gold">
          ورود یا ساخت حساب
        </Link>
      </section>
    );
  }
  return (
    <section className="customer-workspace-sync">
      <div className="customer-workspace-icon"><Cloud size={20} /></div>
      <div className="customer-workspace-copy">
        <strong>فضای شخصی شما فعال است</strong>
        <p><ShieldCheck size={13} /> علاقه‌مندی‌ها، جست‌وجوهای ذخیره‌شده و فایل‌های اخیر روی حساب شما نگه‌داری می‌شود.</p>
        {status ? <span role="status">{status}</span> : null}
      </div>
      <button type="button" className="btn-ghost" onClick={retry} disabled={busy}>
        <RefreshCw size={15} className={busy ? "workspace-sync-spin" : ""} />
        {busy ? "در حال همگام‌سازی…" : "همگام‌سازی"}
      </button>
    </section>
  );
}
