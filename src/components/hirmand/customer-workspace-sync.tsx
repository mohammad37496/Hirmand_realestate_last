import { Cloud, RefreshCw, ShieldCheck } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { authEnabled, getBearerToken } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { chooseCustomerWorkspaceSync } from "@/lib/customer-workspace-sync-plan.mjs";
import { clearWorkspaceForSignedOutUser, resetWorkspaceForAccountSwitch } from "@/lib/customer-workspace-account-switch.mjs";
import "@/customer-workspace-sync.css";

const FAVORITES_KEY = "hirmand-favorite-properties";
const FAVORITE_META_KEY = "hirmand-favorite-meta-v1";
const SAVED_SEARCHES_KEY = "hirmand-saved-searches";
const RECENT_KEY = "hirmand-recent-properties";
const WORKSPACE_OWNER_KEY = "hirmand-workspace-owner-v1";
const WORKSPACE_PENDING_KEY = "hirmand-workspace-pending-v1";

type SavedSearch = {
  id: string;
  name: string;
  params: string;
  alerts?: boolean;
  lastCheckedAt?: string;
};

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

function normalizeWorkspace(value: unknown) {
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

function localWorkspace() {
  return normalizeWorkspace({
    favorites: readJson<unknown>(FAVORITES_KEY, []),
    recentProperties: readJson<unknown>(RECENT_KEY, []),
    savedSearches: readJson<unknown>(SAVED_SEARCHES_KEY, []),
    favoriteMeta: readJson<unknown>(FAVORITE_META_KEY, {}),
  });
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
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const bootedUser = useRef<string | null>(null);
  const activeUserId = useRef<string | null>(user?.id ?? null);
  const syncInFlight = useRef(false);
  const syncQueued = useRef(false);
  const syncRef = useRef<() => void>(() => {});
  useEffect(() => {
    activeUserId.current = user?.id ?? null;
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    resetWorkspaceForAccountSwitch({ storage: localStorage, target: window, userId: user.id });
  }, [user?.id]);

  const sync = useCallback(async () => {
    if (!user || !authEnabled) return;
    if (syncInFlight.current) {
      syncQueued.current = true;
      return;
    }
    syncInFlight.current = true;
    setBusy(true);
    setStatus("");
    try {
      const bearerToken = getBearerToken();
      const getResponse = await fetch("/api/customer-workspace", {
        credentials: "same-origin",
        headers: {
          accept: "application/json",
          ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
        },
      });
      if (!getResponse.ok) throw new Error("فضای شخصی هنوز آماده نیست.");
      const remote = await getResponse.json() as ReturnType<typeof localWorkspace> & {
        ownerId?: string;
        updatedAt?: string | null;
      };
      if (activeUserId.current !== user.id) return;
      if (remote.ownerId !== user.id) throw new Error("نشست حساب تغییر کرده است؛ صفحه را تازه‌سازی کنید.");
      let storedOwner: string | null = null;
      let pendingLocalChanges = false;
      let pendingMarker: string | null = null;
      try {
        storedOwner = localStorage.getItem(WORKSPACE_OWNER_KEY);
        pendingMarker = localStorage.getItem(WORKSPACE_PENDING_KEY);
        pendingLocalChanges = Boolean(pendingMarker);
      } catch {
        // The remote account workspace can still be used without local storage.
      }
      const remoteWorkspace = {
        ...normalizeWorkspace(remote),
        updatedAt: remote.updatedAt ?? null,
      };
      const decision = chooseCustomerWorkspaceSync({
        remote: remoteWorkspace,
        local: localWorkspace(),
        ownerId: storedOwner,
        currentUserId: user.id,
        pendingLocalChanges,
      });
      const workspace = decision.workspace;
      if (activeUserId.current !== user.id) return;
      if (decision.direction === "push" && !pendingMarker) {
        const initialMarker = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        try {
          if (localStorage.getItem(WORKSPACE_PENDING_KEY) !== null) {
            syncQueued.current = true;
            return;
          }
          localStorage.setItem(WORKSPACE_PENDING_KEY, initialMarker);
          pendingMarker = initialMarker;
        } catch {
          // The server can still accept the snapshot when local storage is unavailable.
        }
      }
      try {
        if (localStorage.getItem(WORKSPACE_PENDING_KEY) !== pendingMarker) {
          syncQueued.current = true;
          return;
        }
      } catch {
        // Continue with the remote snapshot when local storage is unavailable.
      }

      writeJson(FAVORITES_KEY, workspace.favorites);
      writeJson(RECENT_KEY, workspace.recentProperties);
      writeJson(SAVED_SEARCHES_KEY, workspace.savedSearches);
      writeJson(FAVORITE_META_KEY, workspace.favoriteMeta);
      try {
        localStorage.setItem(WORKSPACE_OWNER_KEY, user.id);
      } catch {
        // Remote data is already saved; ownership metadata is a local safeguard.
      }

      if (decision.direction === "push") {
        if (activeUserId.current !== user.id) return;
        const postResponse = await fetch("/api/customer-workspace", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "content-type": "application/json",
            ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
          },
          body: JSON.stringify({ ...workspace, ownerId: user.id }),
        });
        const saved = await postResponse.json().catch(() => null) as { success?: boolean; updatedAt?: string } | null;
        if (!postResponse.ok || !saved?.success) throw new Error("ذخیره‌سازی فضای شخصی انجام نشد.");
        try {
          if (localStorage.getItem(WORKSPACE_PENDING_KEY) === pendingMarker) {
            localStorage.removeItem(WORKSPACE_PENDING_KEY);
          } else {
            syncQueued.current = true;
          }
        } catch {
          // The server snapshot is saved even if the local marker cannot be cleared.
        }
      } else {
        try {
          localStorage.removeItem(WORKSPACE_PENDING_KEY);
        } catch {
          // The server snapshot is already authoritative for this device.
        }
      }
      window.dispatchEvent(new CustomEvent("hirmand:workspace-synced"));
      setStatus("فضای شخصی شما بین دستگاه‌ها همگام شد.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "همگام‌سازی انجام نشد.");
    } finally {
      setBusy(false);
      syncInFlight.current = false;
      if (syncQueued.current) {
        syncQueued.current = false;
        syncRef.current();
      }
    }
  }, [user]);

  useEffect(() => {
    syncRef.current = () => { void sync(); };
  }, [sync]);

  useEffect(() => {
    if (!enabled || isPending || !user || !authEnabled || bootedUser.current === user.id) return;
    bootedUser.current = user.id;
    void sync();
  }, [enabled, isPending, user, sync]);

  useEffect(() => {
    if (!enabled || isPending || !user || !authEnabled) return;
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
  }, [enabled, isPending, user, sync]);

  useEffect(() => {
    if (!enabled || isPending || user || !authEnabled) return;
    clearWorkspaceForSignedOutUser({ storage: localStorage, target: window });
  }, [enabled, isPending, user]);

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
