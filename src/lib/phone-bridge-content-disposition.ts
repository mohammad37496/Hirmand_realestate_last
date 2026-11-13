export function safePhoneBridgeDownloadName(value: string) {
  const sanitized = [...value].map((char) => {
    const code = char.charCodeAt(0);
    return code < 32 || char === "/" || char === "\\" ? "-" : char;
  }).join("");
  return sanitized.trim().slice(-180) || "file";
}

export function buildPhoneBridgeAttachmentContentDisposition(value: string) {
  const safeName = safePhoneBridgeDownloadName(value);
  const encodedName = encodeURIComponent(safeName).replace(/['()*]/g, (char) =>
    "%" + char.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0"),
  );
  return "attachment; filename=\"phone-bridge-file\"; filename*=UTF-8''" + encodedName;
}