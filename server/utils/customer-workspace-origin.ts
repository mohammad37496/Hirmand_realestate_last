import { createError } from "h3";

/** Browser-only authenticated workspace writes must carry an explicit same-origin context. */
export function assertCustomerWorkspacePostOrigin(input: {
  origin: string | null | undefined;
  host: string | null | undefined;
  requestOrigin: string;
}) {
  if (!input.origin || !input.host) {
    throw createError({ statusCode: 403, statusMessage: "درخواست فضای شخصی باید از مبدأ معتبر مرورگر ارسال شود." });
  }

  let originHost = "";
  try {
    originHost = new URL(input.origin).host;
  } catch {
    throw createError({ statusCode: 403, statusMessage: "مبدأ درخواست معتبر نیست." });
  }

  let requestOrigin: string;
  try {
    requestOrigin = new URL(input.requestOrigin).origin;
  } catch {
    throw createError({ statusCode: 403, statusMessage: "مبدأ درخواست معتبر نیست." });
  }

  if (originHost.toLowerCase() !== input.host.split(",")[0]!.trim().toLowerCase()
    || new URL(input.origin).origin !== requestOrigin) {
    throw createError({ statusCode: 403, statusMessage: "این درخواست از مبدأ دیگری ارسال شده و انجام نشد." });
  }
}
