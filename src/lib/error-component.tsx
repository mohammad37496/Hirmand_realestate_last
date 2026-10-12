import type { ErrorComponentProps } from "@tanstack/react-router";
import { Copy, Home, RefreshCw, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";

const FALLBACK_MESSAGE = "خطایی در بارگذاری این صفحه رخ داد. لطفاً دوباره تلاش کنید.";

function rawErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  if (error == null) return "";
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function sanitizeErrorMessage(value: string): string {
  return value
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "postgresql://[REDACTED]")
    .replace(/(?:Bearer\s+)[A-Za-z0-9._~-]+/gi, "Bearer [REDACTED]")
    .replace(/(?:token|secret|password|api[_-]?key)=([^\s&]+)/gi, "$1=[REDACTED]");
}

function getDiagnostic(error: unknown) {
  const raw = rawErrorMessage(error);
  const message = sanitizeErrorMessage(raw) || FALLBACK_MESSAGE;
  const name = error instanceof Error && error.name ? error.name : "UnknownError";
  const path =
    typeof window !== "undefined"
      ? window.location.pathname + window.location.search + window.location.hash
      : "server";
  const time = new Date().toISOString();

  return { message, name, path, time };
}

export function AppErrorComponent({ error, reset }: ErrorComponentProps) {
  const [copied, setCopied] = useState(false);
  const diagnostic = useMemo(() => getDiagnostic(error), [error]);

  console.error("[Hirmand Runtime Error]", {
    name: diagnostic.name,
    message: diagnostic.message,
    path: diagnostic.path,
    time: diagnostic.time,
    error,
  });

  async function copyDiagnostic() {
    const payload = [
      "[Hirmand Runtime Error]",
      `name: ${diagnostic.name}`,
      `message: ${diagnostic.message}`,
      `path: ${diagnostic.path}`,
      `time: ${diagnostic.time}`,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main className="min-h-screen bg-white px-6 py-12 text-black" dir="rtl">
      <div className="mx-auto flex min-h-[78vh] w-full max-w-2xl flex-col items-center justify-center gap-5 text-center">
        <span
          className="grid size-16 place-items-center rounded-full border border-black/15 bg-black/[.04] text-black"
          aria-hidden="true"
        >
          <TriangleAlert className="size-8" strokeWidth={1.8} />
        </span>

        <div className="w-full">
          <h1 className="text-2xl font-bold">خطایی رخ داد</h1>
          <p className="mt-2 break-words text-sm leading-7 text-black/60">
            {diagnostic.message}
          </p>
        </div>

        <section
          className="w-full rounded-2xl border border-black/10 bg-black/[.025] p-4 text-right"
          aria-label="جزئیات فنی خطا"
          dir="ltr"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2" dir="rtl">
            <strong className="text-sm">جزئیات فنی خطا</strong>
            <span className="text-xs text-black/45">برای عیب‌یابی Production</span>
          </div>
          <dl className="grid gap-2 text-left text-xs leading-6">
            <div className="grid gap-1 sm:grid-cols-[90px_1fr]">
              <dt className="font-semibold text-black/50">name</dt>
              <dd className="break-all">{diagnostic.name}</dd>
            </div>
            <div className="grid gap-1 sm:grid-cols-[90px_1fr]">
              <dt className="font-semibold text-black/50">message</dt>
              <dd className="break-all">{diagnostic.message}</dd>
            </div>
            <div className="grid gap-1 sm:grid-cols-[90px_1fr]">
              <dt className="font-semibold text-black/50">path</dt>
              <dd className="break-all">{diagnostic.path}</dd>
            </div>
            <div className="grid gap-1 sm:grid-cols-[90px_1fr]">
              <dt className="font-semibold text-black/50">time</dt>
              <dd className="break-all">{diagnostic.time}</dd>
            </div>
          </dl>
        </section>

        <div className="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-black px-5 text-sm font-semibold text-white"
            onClick={() => reset()}
          >
            <RefreshCw className="size-4" />
            تلاش دوباره
          </button>

          <button
            type="button"
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-black/15 bg-white px-5 text-sm font-semibold text-black"
            onClick={copyDiagnostic}
          >
            <Copy className="size-4" />
            {copied ? "کپی شد" : "کپی خطا"}
          </button>

          <a
            href="/"
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-black/15 bg-white px-5 text-sm font-semibold text-black"
          >
            <Home className="size-4" />
            بازگشت به خانه
          </a>
        </div>
      </div>
    </main>
  );
}
