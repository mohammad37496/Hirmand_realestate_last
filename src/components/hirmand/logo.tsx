import { cn } from "@/lib/utils";

type LogoSize = "nav" | "hero" | "footer" | "soon";

export function BrandLogo({
  size = "nav",
  className,
}: {
  size?: LogoSize;
  className?: string;
}) {
  return (
    <img
      src="/images/hirmand-logo.png"
      alt="لوگوی گروه مشاورین املاک هیرمند"
      width={1457}
      height={1079}
      draggable={false}
      decoding="async"
      loading={size === "hero" ? "eager" : "lazy"}
      fetchPriority={size === "hero" ? "high" : "auto"}
      className={cn("brand-logo", `brand-logo-${size}`, className)}
    />
  );
}
