// Lucide-style SVG icons — stroke only, 1.5px, uniform family.
function Ico({ size = 20, sw = 1.5, style, children }) {
  return (
    <svg
      width={size} height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ display: 'inline-block', flexShrink: 0, ...style }}
    >
      {children}
    </svg>
  );
}

export const IconSearch = ({ size, style }) => (
  <Ico size={size} style={style}>
    <circle cx="11" cy="11" r="8"/>
    <path d="m21 21-4.35-4.35"/>
  </Ico>
);

export const IconNavigation = ({ size, style }) => (
  <Ico size={size} style={style}>
    <polygon points="3 11 22 2 13 21 11 13 3 11"/>
  </Ico>
);

export const IconCar = ({ size, style }) => (
  <Ico size={size} style={style}>
    <rect x="1" y="3" width="15" height="13" rx="2"/>
    <path d="M16 8h4l3 3v5h-7V8z"/>
    <circle cx="5.5" cy="18.5" r="2.5"/>
    <circle cx="18.5" cy="18.5" r="2.5"/>
  </Ico>
);

export const IconPin = ({ size, style }) => (
  <Ico size={size} style={style}>
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
    <circle cx="12" cy="10" r="3"/>
  </Ico>
);

export const IconBus = ({ size, style }) => (
  <Ico size={size} style={style}>
    <rect x="1" y="6" width="22" height="13" rx="2"/>
    <path d="M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
    <line x1="12" y1="12" x2="12.01" y2="12"/>
  </Ico>
);

export const IconTrain = ({ size, style }) => (
  <Ico size={size} style={style}>
    <rect x="2" y="3" width="20" height="14" rx="2"/>
    <path d="M12 3v14M2 12h20"/>
    <path d="M7 21l-2-4h14l-2 4"/>
  </Ico>
);

export const IconStar = ({ size, style }) => (
  <Ico size={size} style={style}>
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </Ico>
);

export const IconClock = ({ size, style }) => (
  <Ico size={size} style={style}>
    <circle cx="12" cy="12" r="10"/>
    <polyline points="12 6 12 12 16 14"/>
  </Ico>
);

export const IconThumbUp = ({ size, style }) => (
  <Ico size={size} style={style}>
    <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
  </Ico>
);

export const IconThumbDown = ({ size, style }) => (
  <Ico size={size} style={style}>
    <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/>
  </Ico>
);

export const IconTarget = ({ size, style }) => (
  <Ico size={size} style={style}>
    <circle cx="12" cy="12" r="10"/>
    <circle cx="12" cy="12" r="3"/>
  </Ico>
);

export const IconZap = ({ size, style }) => (
  <Ico size={size} style={style}>
    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
  </Ico>
);

export const IconArrowLeft = ({ size, style }) => (
  <Ico size={size} style={style}>
    <path d="M19 12H5M12 5l-7 7 7 7"/>
  </Ico>
);

export const IconFlag = ({ size, style }) => (
  <Ico size={size} style={style}>
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
    <line x1="4" y1="22" x2="4" y2="15"/>
  </Ico>
);

export const IconStopCircle = ({ size, style }) => (
  <Ico size={size} style={style}>
    <circle cx="12" cy="12" r="10"/>
    <rect x="9" y="9" width="6" height="6"/>
  </Ico>
);

export const IconChevronDown = ({ size, style }) => (
  <Ico size={size} style={style}>
    <polyline points="6 9 12 15 18 9"/>
  </Ico>
);

export const IconChevronUp = ({ size, style }) => (
  <Ico size={size} style={style}>
    <polyline points="18 15 12 9 6 15"/>
  </Ico>
);

export const IconRoute = ({ size, style }) => (
  <Ico size={size} style={style}>
    <circle cx="6" cy="19" r="3"/>
    <path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/>
    <circle cx="18" cy="5" r="3"/>
  </Ico>
);

export const IconRefresh = ({ size, style }) => (
  <Ico size={size} style={style}>
    <polyline points="23 4 23 10 17 10"/>
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
  </Ico>
);

export const IconPlus = ({ size, style }) => (
  <Ico size={size} style={style}>
    <line x1="12" y1="5" x2="12" y2="19"/>
    <line x1="5" y1="12" x2="19" y2="12"/>
  </Ico>
);

export const IconSparkles = ({ size, style }) => (
  <Ico size={size} style={style}>
    <path d="M12 3 13.5 8.5 19 10 13.5 11.5 12 17 10.5 11.5 5 10 10.5 8.5 12 3z"/>
    <path d="M19 15.5 19.6 17.5 21.5 18.1 19.6 18.7 19 20.7 18.4 18.7 16.5 18.1 18.4 17.5 19 15.5z"/>
    <path d="M5 15.8 5.5 17.4 7 18 5.5 18.5 5 20 4.5 18.5 3 18 4.5 17.4 5 15.8z"/>
  </Ico>
);

export const IconGift = ({ size, style }) => (
  <Ico size={size} style={style}>
    <rect x="3" y="9" width="18" height="4" rx="0.6"/>
    <rect x="4.2" y="13" width="15.6" height="8" rx="0.6"/>
    <line x1="12" y1="9" x2="12" y2="21"/>
    <path d="M12 9C11 6 6.5 6 6.5 9c0 1.6 2.2 1 5.5 0"/>
    <path d="M12 9c1-3 5.5-3 5.5 0 0 1.6-2.2 1-5.5 0"/>
  </Ico>
);

export const IconAlertCircle = ({ size, style }) => (
  <Ico size={size} style={style}>
    <circle cx="12" cy="12" r="9"/>
    <line x1="12" y1="7.5" x2="12" y2="13"/>
    <circle cx="12" cy="16.3" r="0.9" fill="currentColor" stroke="none"/>
  </Ico>
);

export const IconLink = ({ size, style }) => (
  <Ico size={size} style={style}>
    <path d="M9.5 14.5 14.5 9.5"/>
    <path d="M8.5 16.8 6.3 19a3.2 3.2 0 0 1-4.5-4.5l3-3a3.2 3.2 0 0 1 4.5 0"/>
    <path d="M15.5 7.2l2.2-2.2a3.2 3.2 0 0 1 4.5 4.5l-3 3a3.2 3.2 0 0 1-4.5 0"/>
  </Ico>
);

export const IconMap = ({ size, style }) => (
  <Ico size={size} style={style}>
    <path d="M3 6.5 9 4l6 2.5 6-2.5v15l-6 2.5-6-2.5-6 2.5Z"/>
    <line x1="9" y1="4" x2="9" y2="19"/>
    <line x1="15" y1="6.5" x2="15" y2="21.5"/>
  </Ico>
);

export const IconCheckCircle = ({ size, style }) => (
  <Ico size={size} style={style}>
    <circle cx="12" cy="12" r="9"/>
    <path d="m8.5 12.3 2.3 2.3 4.7-5"/>
  </Ico>
);

export const IconInfo = ({ size, style }) => (
  <Ico size={size} style={style}>
    <circle cx="12" cy="12" r="9"/>
    <line x1="12" y1="11" x2="12" y2="16.5"/>
    <circle cx="12" cy="7.8" r="0.9" fill="currentColor" stroke="none"/>
  </Ico>
);

export const IconCompass = ({ size, style }) => (
  <Ico size={size} style={style}>
    <circle cx="12" cy="12" r="9"/>
    <path d="m15.5 8.5-2 5-5 2 2-5z"/>
  </Ico>
);

export const IconLayers = ({ size, style }) => (
  <Ico size={size} style={style}>
    <polygon points="12 2 2 7 12 12 22 7 12 2"/>
    <polyline points="2 17 12 22 22 17"/>
    <polyline points="2 12 12 17 22 12"/>
  </Ico>
);

export const IconCamera = ({ size, style }) => (
  <Ico size={size} style={style}>
    <path d="M4 8.5a1.5 1.5 0 0 1 1.5-1.5h2l1.2-1.8a1.5 1.5 0 0 1 1.25-.7h4.1a1.5 1.5 0 0 1 1.25.7L16.5 7h2A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5z"/>
    <circle cx="12" cy="13" r="3.5"/>
  </Ico>
);
