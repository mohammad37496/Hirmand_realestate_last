import { Cloud, LogIn, RefreshCw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { authEnabled, signIn, GROK_PROVIDERS } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import "@/customer-workspace-sync.css";

const FAVORITES_KEY = "hirmand-favorite-properties";
const FAVORITE_META_KEY = "hirmand-favorite-meta-v1";
const SAVED_SEARCHES_KEY = "hirmand-saved-searches";
const RECENT_KEY = "hirmand-recent-properties";

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
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Local storage remains an optional fallback.
  }
}

function localWorkspace() {
  const favorites = readJson<unknown>(FAVORITES_KEY, []);
  const recentProperties = readJson<unknown>(RECENT_KEY, []);
  const savedSearches = readJson<unknown>(SAVED_SEARCHES_KEY, []);
  const favoriteMeta = readJson<unknown>(FAVORITE_META_KEY, {});
  return {
    favorites: Array.isArray(favorites) ? favorites.filter((item): item is string => typeof item === "string").slice(0, 200) : [],
    recentProperties: Array.isArray(recentProperties) ? recentProperties.filter((item): item is string => typeof item === "string").slice(0, 20) : [],
    savedSearches: Array.isArray(savedSearches) ? savedSearches.filter((item): item is SavedSearch => Boolean(item && typeof item === "object" && typeof item.id === "string")).slice(0, 10) : [],
    favoriteMeta:
      favoriteMeta && typeof favoriteMeta === "object" && !Array.isArray(favoriteMeta)
        ? favoriteMeta as Record<string, { tag?: string; note?: string }>
        : {},
  };
}

function mergeWorkspace(remote: ReturnType<typeof localWorkspace>) {
  const local = localWorkspace();
  const favorites = [...new Set([...remote.favorites, ...local.favorites])].slice(0, 200);
  const recentProperties = [...new Set([...local.recentProperties, ...remote.recentProperties])].slice(0, 20);
  const byId = new Map<string, SavedSearch>();
  [...remote.savedSearches, ...local.savedSearches].forEach((item) => byId.set(item.id, item));
  const favoriteMeta = { ...remote.favoriteMeta, ...local.favoriteMeta };
  return {
    favorites,
    recentProperties,
    savedSearches: Array.from(byId.values()).slice(0, 10),
    favoriteMeta,
  };
}

export function CustomerWorkspaceSync() {
  const { user, isPending } = useCurrentUserState();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState("");
  const bootedUser = useRef<string | null>(null);

  const sync = useCallback(async () => {
    if (!user || !authEnabled) return;
    setBusy(true);
    setStatus("");
    try {
      const getResponse = await fetch("/api/customer-workspace", {
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      if (!getResponse.ok) throw new Error("فضای شخصی هنوز آماده نیست.");
      const remote = await getResponse.json() as ReturnType<typeof localWorkspace>;
      const merged = mergeWorkspace({
        favorites: Array.isArray(remote.favorites) ? remote.favorites.filter((item): item is string => typeof item === "string") : [],
        recentProperties: Array.isArray(remote.recentProperties) ? remote.recentProperties.filter((item): item is string => typeof item === "string") : [],
        savedSearches: Array.isArray(remote.savedSearches) ? remote.savedSearches : [],
        favoriteMeta: remote.favoriteMeta && typeof remote.favoriteMeta === "object" ? remote.favoriteMeta : {},
      });

      writeJson(FAVORITES_KEY, merged.favorites);
      writeJson(RECENT_KEY, merged.recentProperties);
      writeJson(SAVED_SEARCHES_KEY, merged.savedSearches);
      writeJson(FAVORITE_META_KEY, merged.favoriteMeta);

      const postResponse = await fetch("/api/customer-workspace", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(merged),
      });
      const saved = await postResponse.json().catch(() => null) as { success?: boolean } | null;
      if (!postResponse.ok || !saved?.success) throw new Error("ذخیره‌سازی فضای شخصی انجام نشد.");
      window.dispatchEvent(new CustomEvent("hirmand:workspace-synced"));
      setStatus("فضای شخصی شما بین دستگاه‌ها همگام شد.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "همگام‌سازی انجام نشد.");
    } finally {
      setBusy(false);
    }
  }, [user]);

  useEffect(() => {
    if (isPending || !user || !authEnabled || bootedUser.current === user.id) return;
    bootedUser.current = user.id;
    void sync();
  }, [isPending, user, authEnabled, sync]);

  if (isPending || !authEnabled) return null;

  if (!user) {
    return (
      <section className="customer-workspace-sync customer-workspace-signin">
        <div className="customer-workspace-icon"><Cloud size={20} /></div>
        <div>
          <strong>فضای شخصی هیرمند</strong>
          <p>برای نگه‌داشتن علاقه‌مندی‌ها و جست‌وجوها روی موبایل و کامپیوتر، وارد حساب شوید.</p>
        </div>
        <button
          type="button"
          className="btn-gold"
          disabled={signingIn || !GROK_PROVIDERS[0]}
          onClick={() => {
            const provider = GROK_PROVIDERS[0];
            if (!provider) return;
            setSigningIn(true);
            void signIn(provider.providerId, { callbackURL: "/favorites" })
              .catch(() => setSignInError("ورود به حساب انجام نشد. دوباره تلاش کنید."))
              .finally(() => setSigningIn(false));
          }}
        >
          <LogIn size={15} /> {signingIn ? "در حال ورود…" : "ورود"}
        </button>
        {signInError ? <p className="customer-workspace-sync-error" role="alert">{signInError}</p> : null}
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
      <button type="button" className="btn-ghost" onClick={() => void sync()} disabled={busy}>
        <RefreshCw size={15} className={busy ? "workspace-sync-spin" : ""} />
        {busy ? "در حال همگام‌سازی…" : "همگام‌سازی"}
      </button>
    </section>
  );
}
