import { useEffect, useState } from "react";
import { DEFAULT_PROPERTY_WATERMARK, getPropertyWatermarkSettings, watermarkIsVisible, type PropertyWatermarkSettings } from "@/lib/property-watermark";
import "@/property-media-watermark.css";

export function PropertyMediaWatermark() {
  const [settings, setSettings] = useState<PropertyWatermarkSettings>(DEFAULT_PROPERTY_WATERMARK);

  useEffect(() => {
    let active = true;
    void getPropertyWatermarkSettings().then((next) => {
      if (active) setSettings(next);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!watermarkIsVisible(settings)) return null;

  return (
    <div
      className="property-media-watermark"
      style={{
        opacity: settings.opacity,
        transform: "scale(" + settings.size + ")",
        transformOrigin: "100% 100%",
      }}
      aria-hidden="true"
    >
      {settings.showLogo ? <img src="/images/hirmand-logo.png" alt="" className="property-media-watermark-logo" /> : null}
      {settings.showText ? <span>{settings.text}</span> : null}
    </div>
  );
}

export function PropertyMediaWatermarkPreview({
  settings,
}: {
  settings: PropertyWatermarkSettings;
}) {
  if (!watermarkIsVisible(settings)) return null;
  return (
    <div
      className="property-media-watermark property-media-watermark-preview"
      style={{
        opacity: settings.opacity,
        transform: "scale(" + settings.size + ")",
        transformOrigin: "100% 100%",
      }}
      aria-hidden="true"
    >
      {settings.showLogo ? <img src="/images/hirmand-logo.png" alt="" className="property-media-watermark-logo" /> : null}
      {settings.showText ? <span>{settings.text}</span> : null}
    </div>
  );
}
