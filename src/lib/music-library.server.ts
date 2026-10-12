/**
 * Server-only music library helpers shared by the admin API and the upload
 * coordinator.
 */

import { dbSource, getSql } from "@/lib/db";
import { isDatabaseMediaUrl } from "@/lib/media-store.server";

export const ALLOWED_AUDIO_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/ogg",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
] as const;

export const ALLOWED_AUDIO_TYPE_SET = new Set<string>(ALLOWED_AUDIO_TYPES);

/**
 * Hard ceiling for a single song. The upload is assembled from chunks inside
 * the database and then handed to the object store when one is configured, so
 * this stays within a size the serverless function can hold comfortably.
 */
export const MAX_AUDIO_BYTES = 32 * 1024 * 1024;

/**
 * Uploads are collected one chunk at a time so a song never has to fit in a
 * single request body (deployed functions reject bodies above ~4.5 MB).
 */
export const AUDIO_CHUNK_BYTES = 2 * 1024 * 1024;

export type MusicTrack = {
  id: string;
  title: string;
  artist: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  active: boolean;
  position: number;
  createdAt: string;
};

export function mimeFromFilename(filename: string): string {
  const extension = filename.split(".").pop()?.toLowerCase();
  if (extension === "mp3") return "audio/mpeg";
  if (extension === "ogg" || extension === "oga") return "audio/ogg";
  if (extension === "wav") return "audio/wav";
  if (extension === "m4a") return "audio/mp4";
  if (extension === "aac") return "audio/aac";
  return "";
}

/**
 * Turns whatever was persisted for a track into a URL the browser can fetch.
 * Older rows may hold a delegation-signed Blob URL; those are rewritten to the
 * stable public CDN path.
 */
export function normalizeStoredMediaUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return value;
  if (isDatabaseMediaUrl(value)) return value;

  try {
    const url = new URL(value);
    const delegation = url.searchParams.get("vercel-blob-delegation");

    if (
      url.hostname === "blob.vercel-storage.com" ||
      url.hostname.endsWith(".private.blob.vercel-storage.com")
    ) {
      const storeId = configuredBlobStoreId();
      if (storeId) {
        return `https://${storeId}.public.blob.vercel-storage.com${url.pathname}`;
      }
    }

    if (url.hostname.endsWith(".public.blob.vercel-storage.com")) {
      url.search = "";
      url.hash = "";
      return url.toString();
    }

    if (delegation) {
      const dot = delegation.indexOf(".");
      if (dot > 0) {
        const payload = JSON.parse(
          Buffer.from(delegation.slice(0, dot), "base64url").toString("utf8"),
        ) as { storeId?: unknown };
        if (typeof payload.storeId === "string" && payload.storeId) {
          const storeId = payload.storeId.startsWith("store_")
            ? payload.storeId.slice("store_".length)
            : payload.storeId;
          return `https://${storeId}.public.blob.vercel-storage.com${url.pathname}`;
        }
      }
    }

    return raw;
  } catch {
    return raw;
  }
}

function configuredBlobStoreId(): string | null {
  const raw = process.env.BLOB_STORE_ID?.trim();
  if (!raw) return null;
  return raw.startsWith("store_") ? raw.slice("store_".length) : raw;
}

/**
 * The URL must be something the visitor's browser can actually fetch: media we
 * serve ourselves, or an `https://` address. Local file paths and
 * `javascript:`-style values are rejected.
 */
export function isPlayableMediaUrl(value: string): boolean {
  if (isDatabaseMediaUrl(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

export function mapTrackRow(row: Record<string, unknown>): MusicTrack {
  return {
    id: String(row.id),
    title: String(row.title),
    artist: String(row.artist ?? ""),
    url: normalizeStoredMediaUrl(String(row.url)),
    mimeType: String(row.mime_type),
    sizeBytes: Number(row.size_bytes) || 0,
    active: Boolean(row.active),
    position: Number(row.position) || 0,
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

export async function insertMusicTrack(input: {
  title: string;
  artist: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  active?: boolean;
}): Promise<MusicTrack> {
  if (dbSource === "unconfigured") {
    throw new Error("پایگاه داده برای مدیریت موسیقی تنظیم نشده است.");
  }
  const sql = await getSql();
  const rows = await sql.query<Record<string, unknown>>(
    `insert into music_tracks (id, title, artist, url, mime_type, size_bytes, active, position)
     values (
       $1, $2, $3, $4, $5, $6, $7,
       coalesce((select max(position) + 1 from music_tracks), 0)
     )
     returning id, title, artist, url, mime_type, size_bytes, active, position, created_at`,
    [
      crypto.randomUUID(),
      input.title,
      input.artist,
      input.url,
      input.mimeType,
      input.sizeBytes,
      input.active !== false,
    ],
  );
  return mapTrackRow(rows[0]!);
}
