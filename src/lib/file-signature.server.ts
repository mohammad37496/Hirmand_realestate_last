/**
 * Server-only magic-byte sniffing for uploaded media.
 *
 * The upload endpoints already restrict the declared MIME type and the file
 * extension, but both are attacker-controlled: a `.jpg` that is really an HTML
 * document would be stored happily and later served from our own origin. This
 * module inspects the real header bytes once the object is assembled and
 * rejects anything that does not match the type we are about to persist.
 */

export type SniffResult =
  | { ok: true; kind: "image" | "audio" | "video"; mime: string }
  | { ok: false; reason: string };

type Signature = {
  mime: string;
  kind: "image" | "audio" | "video";
  /** Minimum bytes needed to test this signature. */
  length: number;
  matches: (bytes: Uint8Array) => boolean;
};

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, index) => bytes[index] === byte);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let out = "";
  for (let index = 0; index < length; index += 1) {
    out += String.fromCharCode(bytes[offset + index] ?? 0);
  }
  return out;
}

/**
 * Order matters only for readability: the container formats we accept have a
 * distinctive header, so the first match wins.
 */
const SIGNATURES: Signature[] = [
  // ---- images ----
  { mime: "image/jpeg", kind: "image", length: 3, matches: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  {
    mime: "image/png",
    kind: "image",
    length: 8,
    matches: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  {
    mime: "image/gif",
    kind: "image",
    length: 6,
    matches: (b) => ascii(b, 0, 6) === "GIF87a" || ascii(b, 0, 6) === "GIF89a",
  },
  {
    mime: "image/webp",
    kind: "image",
    length: 12,
    matches: (b) => ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP",
  },
  {
    mime: "image/avif",
    kind: "image",
    length: 12,
    matches: (b) => ascii(b, 4, 4) === "ftyp" && ascii(b, 8, 4).toLowerCase().startsWith("avif"),
  },

  // ---- audio ----
  {
    mime: "audio/mpeg",
    kind: "audio",
    length: 3,
    matches: (b) => ascii(b, 0, 3) === "ID3" || (b[0] === 0xff && (b[1]! & 0xe0) === 0xe0),
  },
  {
    mime: "audio/ogg",
    kind: "audio",
    length: 4,
    matches: (b) => ascii(b, 0, 4) === "OggS",
  },
  {
    mime: "audio/wav",
    kind: "audio",
    length: 12,
    matches: (b) => ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WAVE",
  },
  {
    mime: "audio/mp4",
    kind: "audio",
    length: 12,
    matches: (b) =>
      ascii(b, 4, 4) === "ftyp" &&
      (ascii(b, 8, 4).toLowerCase().startsWith("m4a") ||
        ascii(b, 8, 4).toLowerCase().startsWith("mp4a") ||
        ascii(b, 8, 4).toLowerCase().startsWith("mp4")),
  },

  // ---- video ----
  {
    mime: "video/mp4",
    kind: "video",
    length: 12,
    matches: (b) => ascii(b, 4, 4) === "ftyp" && ascii(b, 8, 4).toLowerCase().startsWith("isom"),
  },
  {
    mime: "video/webm",
    kind: "video",
    length: 4,
    matches: (b) => startsWith(b, [0x1a, 0x45, 0xdf, 0xa3]),
  },
  {
    mime: "video/quicktime",
    kind: "video",
    length: 12,
    matches: (b) => ascii(b, 4, 4) === "ftyp" && ascii(b, 8, 4).toLowerCase().startsWith("qt"),
  },
];

/**
 * MP4/QuickTime/M4A all live in the same ISO-BMFF container, so a bare
 * `ftyp` check is not enough to pick a single type. Callers pass the declared
 * type and we return the sniffed *family*, letting the declared type survive
 * only when the container agrees with it.
 */
export function sniffMediaBytes(bytes: Uint8Array): SniffResult {
  if (!bytes.length) return { ok: false, reason: "فایل آپلودشده خالی است." };

  for (const signature of SIGNATURES) {
    if (bytes.length < signature.length) continue;
    if (signature.matches(bytes)) {
      return { ok: true, kind: signature.kind, mime: signature.mime };
    }
  }

  return {
    ok: false,
    reason: "محتوای فایل با نوع اعلام‌شده هم‌خوانی ندارد.",
  };
}

/** MIME aliases that are legitimately interchangeable. */
function typeFamily(mime: string): string {
  const value = mime.trim().toLowerCase();
  if (value === "audio/mp3") return "audio/mpeg";
  if (value === "audio/x-m4a") return "audio/mp4";
  if (value === "audio/x-wav") return "audio/wav";
  return value;
}

/**
 * `true` when the assembled bytes really are what the upload declared.
 *
 * Every ISO-BMFF flavour (mp4 / m4a / quicktime) is the same container, and the
 * `ftyp` brand does not reliably say whether the tracks are audio or video —
 * `mp42`, `isom`, `avc1` and `dash` all show up on H.264 video, and `M4A ` on
 * audio. So once both sides are in that family the declared type wins: the
 * container is genuinely a media file either way, and the whole point of this
 * check is to keep HTML/SVG/script payloads out of a media slot, not to police
 * which track type a valid container holds. Raw AAC and MP3 are *not* in the
 * family — a different container entirely — so swapping those for an mp4 is
 * still refused.
 */
export function contentMatchesDeclaredType(bytes: Uint8Array, declaredMime: string): boolean {
  const sniffed = sniffMediaBytes(bytes);
  if (!sniffed.ok) return false;

  const declared = typeFamily(declaredMime);
  if (sniffed.mime === declared) return true;

  const isoBmff = new Set(["audio/mp4", "video/mp4", "video/quicktime"]);
  if (isoBmff.has(declared) && isoBmff.has(sniffed.mime)) return true;

  return false;
}
