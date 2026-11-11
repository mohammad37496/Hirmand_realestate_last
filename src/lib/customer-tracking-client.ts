export type PublicTrackingResult = {
  trackingCode: string;
  status: string;
  statusLabel: string;
  visitStatus: string;
  visitStatusLabel: string;
  createdAt: string | null;
  updatedAt: string | null;
  consultant: string;
  deal: string;
  propertyType: string;
  neighborhood: string;
  offerAmount?: string | null;
  offerConditions?: string;
  visitRequestedAt: string | null;
  visitPreferredAt: string | null;
  property: { title: string; slug: string } | null;
  timeline: Array<{ type: "created" | "status" | "visit"; label: string; note: string; at: string | null }>;
};

type TrackingResponse = PublicTrackingResult & { statusMessage?: string };
type TrackingFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function loadPublicTrackingResult(code: string, fetcher: TrackingFetcher = fetch) {
  try {
    const response = await fetcher("/api/public-lead-tracking?code=" + encodeURIComponent(code), {
      credentials: "same-origin",
      headers: { accept: "application/json" },
    });
    const data = await response.json().catch(() => null) as TrackingResponse | null;
    if (!response.ok || !data?.trackingCode) {
      const fallback = response.status === 429
        ? "تعداد درخواست‌های پیگیری زیاد است؛ کمی بعد دوباره تلاش کنید."
        : response.status === 503
          ? "سامانه موقتاً در دسترس نیست؛ کد شما ذخیره مانده است. بعداً دوباره تلاش کنید."
          : response.status === 404
            ? "درخواستی با این کد پیدا نشد؛ ممکن است درخواست حذف شده باشد."
            : "دریافت وضعیت درخواست انجام نشد؛ دوباره تلاش کنید.";
      return { ok: false as const, status: response.status, message: data?.statusMessage || fallback };
    }
    return { ok: true as const, data };
  } catch {
    return {
      ok: false as const,
      status: null,
      message: "ارتباط با سامانه برقرار نشد؛ کد شما ذخیره مانده است. اتصال را بررسی و دوباره تلاش کنید.",
    };
  }
}
