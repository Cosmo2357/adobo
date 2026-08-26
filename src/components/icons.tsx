interface IconProps {
  size?: number;
}

const S = (size?: number) => ({
  width: size ?? 18,
  height: size ?? 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export const IconPanel = (p: IconProps) => (
  <svg {...S(p.size)}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <line x1="9" y1="4" x2="9" y2="20" />
  </svg>
);

export const IconFolder = (p: IconProps) => (
  <svg {...S(p.size)}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
  </svg>
);

export const IconSave = (p: IconProps) => (
  <svg {...S(p.size)}>
    <path d="M12 3v12" />
    <path d="m7 10 5 5 5-5" />
    <path d="M4 19h16" />
  </svg>
);

export const IconPrint = (p: IconProps) => (
  <svg {...S(p.size)}>
    <path d="M7 8V4h10v4" />
    <rect x="4" y="8" width="16" height="8" rx="1.5" />
    <path d="M7 13h10v7H7z" />
  </svg>
);

export const IconChevronUp = (p: IconProps) => (
  <svg {...S(p.size)}><path d="m6 14 6-6 6 6" /></svg>
);

export const IconChevronDown = (p: IconProps) => (
  <svg {...S(p.size)}><path d="m6 10 6 6 6-6" /></svg>
);

export const IconMinus = (p: IconProps) => (
  <svg {...S(p.size)}><line x1="5" y1="12" x2="19" y2="12" /></svg>
);

export const IconPlus = (p: IconProps) => (
  <svg {...S(p.size)}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

export const IconFitWidth = (p: IconProps) => (
  <svg {...S(p.size)}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m7 12 -2 0" /><path d="m19 12 -2 0" />
    <path d="m8.5 9.5 -2.5 2.5 2.5 2.5" />
    <path d="m15.5 9.5 2.5 2.5 -2.5 2.5" />
  </svg>
);

export const IconFitPage = (p: IconProps) => (
  <svg {...S(p.size)}>
    <rect x="5" y="3" width="14" height="18" rx="2" />
    <path d="M9 8h6M9 12h6M9 16h4" />
  </svg>
);

export const IconRotate = (p: IconProps) => (
  <svg {...S(p.size)}>
    <path d="M21 8a9 9 0 1 0 2 6" transform="rotate(-30 12 12)" />
    <path d="M21 3v5h-5" />
  </svg>
);

export const IconSearch = (p: IconProps) => (
  <svg {...S(p.size)}>
    <circle cx="11" cy="11" r="6.5" />
    <line x1="16" y1="16" x2="21" y2="21" />
  </svg>
);

export const IconClose = (p: IconProps) => (
  <svg {...S(p.size)}>
    <line x1="6" y1="6" x2="18" y2="18" />
    <line x1="18" y1="6" x2="6" y2="18" />
  </svg>
);

export const IconUpdate = (p: IconProps) => (
  <svg {...S(p.size)}>
    <path d="M4 12a8 8 0 0 1 14-5.3L21 9" />
    <path d="M21 4v5h-5" />
    <path d="M20 12a8 8 0 0 1-14 5.3L3 15" />
    <path d="M3 20v-5h5" />
  </svg>
);
