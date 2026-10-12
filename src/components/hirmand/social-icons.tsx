type IconProps = {
  size?: number;
  className?: string;
};

const svgProps = (size: number, className?: string) => ({
  viewBox: "0 0 24 24",
  width: size,
  height: size,
  fill: "none",
  className,
  "aria-hidden": true as const,
});

export function InstagramIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <rect x="3.2" y="3.2" width="17.6" height="17.6" rx="5.2" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="12" r="3.6" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="17.15" cy="6.85" r="1.05" fill="currentColor" />
    </svg>
  );
}

export function TelegramIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path
        d="M20.4 4.6 3.8 11.05c-.72.28-.71.78.1.96l4.08 1.27 1.58 5.12c.2.66.6.8 1.08.44l2.28-1.86 3.86 2.84c.56.32.96.15 1.1-.52l2.86-13.18c.2-.84-.32-1.22-.94-.76Z"
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinejoin="round"
      />
      <path d="m9.9 13.15 8.35-5.35-6.2 7.05-.35 3.05" stroke="currentColor" strokeWidth="1.55" strokeLinejoin="round" />
    </svg>
  );
}

export function WhatsAppIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path
        d="M12 3.45a8.55 8.55 0 0 0-7.34 12.94L3.9 20.05l3.78-.72A8.55 8.55 0 1 0 12 3.45Z"
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.35 8.45c.2-.45.45-.53.83-.53h.62c.28 0 .51.16.62.43l.55 1.36a.77.77 0 0 1-.17.8l-.53.57c.72 1.18 1.7 2.15 2.88 2.89l.58-.54a.77.77 0 0 1 .79-.16l1.36.55c.27.11.43.34.43.62v.62c0 .37-.08.62-.53.82-.52.23-1.11.35-1.72.35-2.66 0-6.04-3.38-6.04-6.04 0-.61.12-1.2.35-1.74Z"
        fill="currentColor"
      />
      <path
        d="M7.02 20.15 3.9 20.75l.62-3.12"
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function EitaaIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...svgProps(size, className)} viewBox="0 0 24 24">
      <path
        fill="currentColor"
        d="M5.968 23.942a6.624 6.624 0 0 1-2.332-.83c-1.62-.929-2.829-2.593-3.217-4.426-.151-.717-.17-1.623-.15-7.207C.288 5.47.274 5.78.56 4.79c.142-.493.537-1.34.823-1.767C2.438 1.453 3.99.445 5.913.08c.384-.073.94-.08 6.056-.08 6.251 0 6.045-.009 7.066.314a6.807 6.807 0 0 1 4.314 4.184c.33.937.346 1.087.369 3.555l.02 2.23-.391.268c-.558.381-1.29 1.06-2.316 2.15-1.182 1.256-2.376 2.42-2.982 2.907-1.309 1.051-2.508 1.651-3.726 1.864-.634.11-1.682.067-2.302-.095-.553-.144-.517-.168-.726.464a6.355 6.355 0 0 0-.318 1.546l-.031.407-.146-.03c-1.215-.241-2.419-1.285-2.884-2.5a3.583 3.583 0 0 1-.26-1.219l-.016-.34-.309-.284c-.644-.59-1.063-1.312-1.195-2.061-.212-1.193.34-2.542 1.538-3.756 1.264-1.283 3.127-2.29 4.953-2.68.658-.14 1.818-.177 2.403-.075 1.138.198 2.067.773 2.645 1.639.182.271.195.31.177.555a.812.812 0 0 1-.183.493c-.465.651-1.848 1.348-3.336 1.68-2.625.585-4.294-.142-4.033-1.759.026-.163.04-.304.031-.313-.032-.032-.293.104-.575.3-.479.334-.903.984-1.05 1.607-.036.156-.05.406-.034.65.02.331.053.454.192.736.092.186.275.45.408.589l.24.251-.096.122a4.845 4.845 0 0 0-.677 1.217 3.635 3.635 0 0 0-.105 1.815c.103.461.421 1.095.739 1.468.242.285.797.764.886.764.024 0 .044-.048.044-.106.001-.23.184-.973.326-1.327.423-1.058 1.351-1.96 2.82-2.74.245-.13.952-.47 1.572-.757 1.36-.63 2.103-1.015 2.511-1.305 1.176-.833 1.903-2.065 2.14-3.625.086-.57.086-1.634 0-2.207-.368-2.438-2.195-4.096-4.818-4.37-2.925-.307-6.648 1.953-8.942 5.427-1.116 1.69-1.87 3.565-2.187 5.443-.123.728-.169 2.08-.093 2.75.193 1.704.822 3.078 1.903 4.156a6.531 6.531 0 0 0 1.87 1.313c2.368 1.13 4.99 1.155 7.295.071.996-.469 1.974-1.196 3.023-2.25 1.02-1.025 1.71-1.88 3.592-4.458 1.04-1.423 1.864-2.368 2.272-2.605l.15-.086-.019 3.091c-.018 2.993-.022 3.107-.123 3.561-.6 2.678-2.54 4.636-5.195 5.242l-.468.107-5.775.01c-4.734.008-5.85-.002-6.19-.056z"
      />
    </svg>
  );
}


export function RubikaIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path
        d="M7.15 3.7h9.7A3.45 3.45 0 0 1 20.3 7.15v6.7a3.45 3.45 0 0 1-3.45 3.45h-5.4l-3.35 3v-3H7.15A3.45 3.45 0 0 1 3.7 13.85v-6.7A3.45 3.45 0 0 1 7.15 3.7Z"
        fill="currentColor"
      />
      <path
        d="m8.1 8.05 2.15 5.4 1.85-3.4 1.82 3.4 2.02-5.4"
        fill="none"
        stroke="white"
        strokeWidth="1.45"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BaleIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path
        d="M6.5 4.1h11A3.4 3.4 0 0 1 20.9 7.5v6.1a3.4 3.4 0 0 1-3.4 3.4h-4.25l-4.1 3.05.48-3.05H6.5a3.4 3.4 0 0 1-3.4-3.4V7.5A3.4 3.4 0 0 1 6.5 4.1Z"
        fill="currentColor"
      />
      <path
        d="M8 12.65c.8-2.25 2.08-3.38 3.83-3.38 1.62 0 2.78.81 3.42 2.43-.66 1.66-1.81 2.49-3.45 2.49-1.67 0-2.94-.51-3.8-1.54Z"
        fill="white"
        opacity=".95"
      />
    </svg>
  );
}

export function IGAPPIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path
        d="M5.95 4h12.1A3.95 3.95 0 0 1 22 7.95v7.6a3.95 3.95 0 0 1-3.95 3.95h-5.6L8.4 22v-2.5H5.95A3.95 3.95 0 0 1 2 15.55v-7.6A3.95 3.95 0 0 1 5.95 4Z"
        fill="currentColor"
      />
      <circle cx="9" cy="11.9" r="1.2" fill="white" />
      <circle cx="12.2" cy="11.9" r="1.2" fill="white" />
      <circle cx="15.4" cy="11.9" r="1.2" fill="white" />
    </svg>
  );
}

export function SoroushIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path
        d="M12 3.35a8.65 8.65 0 0 0-8.65 8.65c0 1.75.52 3.38 1.42 4.74l-.92 3.91 3.98-.83A8.64 8.64 0 1 0 12 3.35Z"
        fill="currentColor"
      />
      <path
        d="M8.1 11.55c1.1-1.7 2.35-2.55 3.76-2.55 1.42 0 2.6.69 3.55 2.08M8.35 14.45c.99-.74 2.21-1.12 3.65-1.12 1.39 0 2.58.36 3.56 1.08"
        fill="none"
        stroke="white"
        strokeWidth="1.45"
        strokeLinecap="round"
      />
    </svg>
  );
}
