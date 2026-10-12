import type { PropertyWatermarkSettings } from "@/lib/property-watermark";

const LOGO_SRC = "/images/hirmand-logo.png";
let logoPromise: Promise<HTMLImageElement> | null = null;

function loadLogo() {
  if (logoPromise) return logoPromise;
  logoPromise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("بارگذاری لوگوی واترمارک انجام نشد."));
    image.src = LOGO_SRC;
  });
  return logoPromise;
}

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

export async function applyPropertyImageWatermark(
  file: File,
  settings: PropertyWatermarkSettings,
): Promise<File> {
  if (!settings.enabled || !file.type.startsWith("image/") || file.type === "image/gif" || file.type === "image/svg+xml" || (!settings.showLogo && (!settings.showText || !settings.text.trim()))) return file;

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("خواندن تصویر برای واترمارک انجام نشد."));
      element.src = objectUrl;
    });

    const maxDimension = Math.max(image.naturalWidth, image.naturalHeight);
    const scale = maxDimension > 2560 ? 2560 / maxDimension : 1;
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;

    context.drawImage(image, 0, 0, width, height);

    const base = Math.max(14, Math.round(Math.min(width, height) * 0.028 * settings.size));
    const paddingX = Math.max(10, Math.round(base * 0.8));
    const paddingY = Math.max(8, Math.round(base * 0.58));
    const gap = Math.max(7, Math.round(base * 0.5));
    const logo = settings.showLogo ? await loadLogo().catch(() => null) : null;
    const logoHeight = logo ? Math.round(base * 1.9) : 0;
    const logoWidth = logo && logo.naturalHeight > 0 ? Math.round(logo.naturalWidth * (logoHeight / logo.naturalHeight)) : 0;

    context.font = "800 " + Math.max(13, Math.round(base * 0.95)) + "px Vazirmatn, Arial, sans-serif";
    const textWidth = settings.showText && settings.text.trim() ? context.measureText(settings.text.trim()).width : 0;
    const contentWidth = logoWidth + (logoWidth && textWidth ? gap : 0) + textWidth;
    const panelWidth = Math.min(width - 20, contentWidth + paddingX * 2);
    const panelHeight = Math.min(height - 20, Math.max(logoHeight, base * 1.8) + paddingY * 2);
    const x = width - panelWidth - Math.max(10, Math.round(width * 0.018));
    const y = height - panelHeight - Math.max(10, Math.round(height * 0.018));

    context.save();
    context.globalAlpha = settings.opacity;
    context.fillStyle = "rgba(8,19,32,0.74)";
    roundedRect(context, x, y, panelWidth, panelHeight, Math.max(9, Math.round(base * 0.6)));
    context.fill();
    context.globalAlpha = 1;

    let cursorX = x + panelWidth - paddingX;
    const centerY = y + panelHeight / 2;

    if (logo && logoWidth > 0 && logoHeight > 0) {
      context.drawImage(logo, cursorX - logoWidth, centerY - logoHeight / 2, logoWidth, logoHeight);
      cursorX -= logoWidth;
      if (textWidth) cursorX -= gap;
    }

    if (settings.showText && settings.text.trim()) {
      context.fillStyle = "#ffffff";
      context.textAlign = "right";
      context.textBaseline = "middle";
      context.fillText(settings.text.trim(), cursorX, centerY);
    }
    context.restore();

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/webp", 0.84);
    });
    if (!blob) return file;

    const name = file.name.replace(/.[^.]+$/, "") || "property-image";
    return new File([blob], name + "-watermarked.webp", {
      type: "image/webp",
      lastModified: Date.now(),
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
