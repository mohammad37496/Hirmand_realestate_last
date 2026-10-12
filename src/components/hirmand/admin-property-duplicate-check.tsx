import { AlertTriangle, ExternalLink, Search } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { formatToman } from "@/lib/money";

type Props = {
  id?: string;
  title: string;
  transactionType: "buy" | "sell" | "rent" | "mortgage";
  propertyType: "apartment" | "villa" | "office" | "heritage" | "land" | "commercial";
  neighborhood: string;
  areaM2: number | null;
  price: number | null;
  deposit: number | null;
  rent: number | null;
};

type Match = {
  id: string;
  slug: string;
  title: string;
  areaM2: number | null;
  comparablePrice: number | null;
  status: string;
  availabilityStatus: string;
};

export function AdminPropertyDuplicateCheck(props: Props) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(false);

  async function check() {
    if (props.title.trim().length < 3 || props.neighborhood.trim().length < 2) {
      toast.info("برای بررسی مشابه، عنوان و محله را تکمیل کنید.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/admin-property-duplicates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: props.id,
          title: props.title,
          transactionType: props.transactionType,
          propertyType: props.propertyType,
          neighborhood: props.neighborhood,
          areaM2: props.areaM2,
          price: props.price,
          deposit: props.deposit,
          rent: props.rent,
        }),
      });
      const data = await response.json().catch(() => null) as { matches?: Match[]; statusMessage?: string; message?: string } | null;
      if (!response.ok) throw new Error(data?.statusMessage || data?.message || "بررسی فایل‌های مشابه انجام نشد.");
      setMatches(Array.isArray(data?.matches) ? data.matches : []);
      setChecked(true);
      if (!data?.matches?.length) toast.success("فایل مشابه مشکوک پیدا نشد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "بررسی فایل‌های مشابه انجام نشد.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="admin-section admin-duplicate-check">
      <div className="admin-duplicate-head">
        <div>
          <strong>بررسی فایل مشابه / تکراری</strong>
          <small>قبل از انتشار، فایل‌های مشابه همین محله و شرایط را بررسی کنید.</small>
        </div>
        <button type="button" className="btn-ghost" onClick={() => void check()} disabled={loading}>
          <Search size={15} />
          {loading ? "در حال بررسی…" : "بررسی مشابه‌ها"}
        </button>
      </div>

      {checked ? (
        matches.length ? (
          <div className="admin-duplicate-list">
            <div className="admin-duplicate-warning">
              <AlertTriangle size={17} />
              <span>{matches.length.toLocaleString("fa-IR")} فایل مشابه احتمالی پیدا شد. قبل از انتشار اطلاعات را بررسی کنید.</span>
            </div>
            {matches.map((match) => (
              <div key={match.id} className="admin-duplicate-row">
                <div>
                  <strong>{match.title}</strong>
                  <small>
                    {match.areaM2 != null ? String(match.areaM2.toLocaleString("fa-IR")) + " متر" : "متراژ ثبت نشده"}
                    {match.comparablePrice != null ? " · " + formatToman(match.comparablePrice) : ""}
                    {match.status === "published" ? " · منتشرشده" : " · پیش‌نویس"}
                  </small>
                </div>
                <a className="text-link" href={"/properties/" + encodeURIComponent(match.slug)} target="_blank" rel="noreferrer">
                  مشاهده <ExternalLink size={13} />
                </a>
              </div>
            ))}
          </div>
        ) : (
          <div className="admin-duplicate-ok">مورد مشابه مشکوکی برای شرایط فعلی پیدا نشد.</div>
        )
      ) : (
        <div className="admin-duplicate-empty">برای بررسی، روی «بررسی مشابه‌ها» بزنید.</div>
      )}
    </section>
  );
}
