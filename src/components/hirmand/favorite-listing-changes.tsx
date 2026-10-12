import { useEffect, useMemo, useState } from "react";
import { History, RefreshCw } from "lucide-react";
import type { Property } from "@/lib/properties";
import { formatToman } from "@/lib/money";
import "@/favorites-change-tracker.css";

const STORAGE_KEY = "hirmand-favorite-property-snapshots-v1";

type Snapshot = {
  title: string;
  price: string | null;
  deposit: string | null;
  rent: string | null;
  areaM2: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  floor: number | null;
  availabilityStatus: Property["availabilityStatus"];
  updatedAt: string;
};

type SnapshotMap = Record<string, Snapshot>;

type Change = {
  label: string;
  previous: string;
  current: string;
};

type ChangeRow = {
  property: Property;
  changes: Change[];
};

function readSnapshots(): SnapshotMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as SnapshotMap;
  } catch {
    return {};
  }
}

function displayMoney(value: string | null) {
  if (!value) return "ثبت نشده";
  const numeric = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(numeric) ? formatToman(numeric) + " تومان" : value;
}

function displayNumber(value: number | null, suffix = "") {
  return value == null ? "ثبت نشده" : value.toLocaleString("fa-IR") + suffix;
}

function availabilityLabel(value: Property["availabilityStatus"]) {
  return value === "available"
    ? "موجود"
    : value === "reserved"
      ? "رزرو موقت"
      : value === "sold"
        ? "فروخته‌شده"
        : value === "rented"
          ? "اجاره‌داده‌شده"
          : "فعلاً ناموجود";
}

function snapshotOf(property: Property): Snapshot {
  return {
    title: property.title,
    price: property.price,
    deposit: property.deposit,
    rent: property.rent,
    areaM2: property.areaM2,
    bedrooms: property.bedrooms,
    bathrooms: property.bathrooms,
    floor: property.floor,
    availabilityStatus: property.availabilityStatus,
    updatedAt: property.updatedAt,
  };
}

function compare(previous: Snapshot, current: Snapshot): Change[] {
  const changes: Change[] = [];
  if (previous.price !== current.price) {
    changes.push({ label: "قیمت", previous: displayMoney(previous.price), current: displayMoney(current.price) });
  }
  if (previous.deposit !== current.deposit) {
    changes.push({ label: "رهن", previous: displayMoney(previous.deposit), current: displayMoney(current.deposit) });
  }
  if (previous.rent !== current.rent) {
    changes.push({ label: "اجاره", previous: displayMoney(previous.rent), current: displayMoney(current.rent) });
  }
  if (previous.areaM2 !== current.areaM2) {
    changes.push({ label: "متراژ", previous: displayNumber(previous.areaM2, " متر"), current: displayNumber(current.areaM2, " متر") });
  }
  if (previous.bedrooms !== current.bedrooms) {
    changes.push({ label: "خواب", previous: displayNumber(previous.bedrooms), current: displayNumber(current.bedrooms) });
  }
  if (previous.bathrooms !== current.bathrooms) {
    changes.push({ label: "سرویس", previous: displayNumber(previous.bathrooms), current: displayNumber(current.bathrooms) });
  }
  if (previous.floor !== current.floor) {
    changes.push({ label: "طبقه", previous: displayNumber(previous.floor), current: displayNumber(current.floor) });
  }
  if (previous.availabilityStatus !== current.availabilityStatus) {
    changes.push({
      label: "وضعیت",
      previous: availabilityLabel(previous.availabilityStatus),
      current: availabilityLabel(current.availabilityStatus),
    });
  }
  return changes;
}

export function FavoriteListingChanges({ properties }: { properties: Property[] }) {
  const [rows, setRows] = useState<ChangeRow[]>([]);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !properties.length) {
      setRows([]);
      return;
    }

    const previous = readSnapshots();
    const next: SnapshotMap = { ...previous };
    const changed: ChangeRow[] = [];

    for (const property of properties) {
      const current = snapshotOf(property);
      const old = previous[property.id];
      if (old) {
        const changes = compare(old, current);
        if (changes.length) changed.push({ property, changes });
      }
      next[property.id] = current;
    }

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // The feature remains read-only when storage is unavailable.
    }
    setRows(changed);
    setCheckedAt(new Date().toISOString());
  }, [properties]);

  const changeCount = useMemo(
    () => rows.reduce((sum, row) => sum + row.changes.length, 0),
    [rows],
  );

  return (
    <section className="favorite-changes" aria-labelledby="favorite-changes-title">
      <header className="favorite-changes-head">
        <div>
          <span className="kicker">پایش سبد</span>
          <h2 id="favorite-changes-title"><History size={19} /> تغییرات فایل‌های منتخب</h2>
          <p>هر بار که سبد منتخب را باز می‌کنید، وضعیت فعلی فایل با آخرین مشاهده شما مقایسه می‌شود؛ این بخش فقط تغییرات قابل مشاهده آگهی را نشان می‌دهد.</p>
        </div>
        <span className="favorite-changes-count">{changeCount.toLocaleString("fa-IR")} تغییر</span>
      </header>

      {rows.length ? (
        <div className="favorite-changes-list">
          {rows.map(({ property, changes }) => (
            <article className="favorite-change-card" key={property.id}>
              <div className="favorite-change-card-head">
                <div>
                  <strong>{property.title}</strong>
                  <span>{property.neighborhood}</span>
                </div>
                <a href={property.slug ? "/properties/" + encodeURIComponent(property.slug) : "/properties"}>مشاهده فایل</a>
              </div>
              <div className="favorite-change-items">
                {changes.map((change) => (
                  <div key={change.label} className="favorite-change-item">
                    <span>{change.label}</span>
                    <strong>{change.previous}</strong>
                    <b>←</b>
                    <strong className="is-current">{change.current}</strong>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="favorite-changes-empty">
          <RefreshCw size={20} />
          <strong>تغییر قابل مشاهده‌ای از آخرین مشاهده ثبت نشده است.</strong>
          <span>
            {checkedAt
              ? "با مراجعه بعدی به فایل‌های منتخب، تغییرات جدید دوباره بررسی می‌شوند."
              : "این پایش پس از اولین مشاهده سبد فعال می‌شود."}
          </span>
        </div>
      )}
    </section>
  );
}
