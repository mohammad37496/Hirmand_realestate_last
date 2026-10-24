const EXTENSION = /\.(?:mp3|ogg|oga|wav|m4a|aac)$/i;

// Prefer explicit, known artist prefixes. Unknown names are kept intact as the
// title rather than guessing where a complex title or collaboration splits.
const ARTIST_PREFIXES = [
  "Yo Yo Ma",
  "Yo-Yo Ma",
  "Carl Davis",
  "Anja Lechner",
  "J S Bach",
  "J. S. Bach",
  "Johann Sebastian Bach",
];

export function parseMusicFilename(filename: string): { title: string; artist: string } {
  const withoutExtension = filename.replace(EXTENSION, "");
  const cleaned = withoutExtension.replace(/^\s*\d+\s*[-_.—–]+\s*/, "").trim();
  const normalized = cleaned
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s*[,;]\s*/g, ", ")
    .trim();
  const lower = normalized.toLocaleLowerCase();
  const matchedArtist = ARTIST_PREFIXES.find((name) => {
    const prefix = name.toLocaleLowerCase();
    return lower === prefix || lower.startsWith(prefix + " ");
  });

  if (!matchedArtist) {
    return { title: normalized || "آهنگ بدون عنوان", artist: "" };
  }

  const artist = normalized.slice(0, matchedArtist.length).trim();
  const title = normalized.slice(matchedArtist.length).trim();
  if (/^(?:&|\+|feat(?:uring)?\.?|ft\.?|with|and)(?:\s+|$)/i.test(title)) {
    return { title: normalized || "آهنگ بدون عنوان", artist: "" };
  }
  return {
    title: title || normalized || "آهنگ بدون عنوان",
    artist,
  };
}
