/**
 * Magazine + mail illustration for Anand Sandesh subscription (replaces generic typing GIF).
 */
export default function SubscriptionHeroVisual({ className = '' }) {
  return (
    <div
      className={`auth-hero-visual ${className}`}
      role="img"
      aria-label="Magazine and postal subscription"
    >
      <svg
        className="h-auto w-full max-w-full"
        viewBox="0 0 480 280"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id="hero-dots" x="0" y="0" width="14" height="14" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="0.9" fill="rgba(13, 45, 127, 0.08)" />
          </pattern>
          <linearGradient id="hero-wash" x1="40" y1="0" x2="240" y2="200" gradientUnits="userSpaceOnUse">
            <stop stopColor="#c9a43a" stopOpacity="0.25" />
            <stop offset="1" stopColor="#1e4a9e" stopOpacity="0.15" />
          </linearGradient>
        </defs>

        <rect width="480" height="280" fill="url(#hero-dots)" opacity="0.5" />
        <ellipse cx="200" cy="120" rx="160" ry="90" fill="url(#hero-wash)" />

        <g className="subscription-hero-float">
          {/* Open magazine */}
          <g transform="translate(85, 55)">
            <rect x="0" y="18" width="90" height="115" rx="5" fill="#eef2ff" stroke="#0d2d7f" strokeWidth="2" />
            <rect x="4" y="30" width="36" height="3" rx="1" fill="#64748b" opacity="0.5" />
            <rect x="4" y="38" width="28" height="2" rx="1" fill="#94a3b8" opacity="0.45" />
            <rect
              x="48"
              y="0"
              width="90"
              height="115"
              rx="5"
              fill="#ffffff"
              stroke="#0d2d7f"
              strokeWidth="2"
            />
            <rect x="56" y="12" width="48" height="4" rx="1" fill="#0d2d7f" />
            <rect x="56" y="24" width="66" height="2" rx="1" fill="#64748b" opacity="0.45" />
            <rect x="56" y="32" width="60" height="2" rx="1" fill="#64748b" opacity="0.38" />
            <rect x="56" y="40" width="66" height="2" rx="1" fill="#64748b" opacity="0.38" />
            <rect x="56" y="58" width="68" height="2" rx="1" fill="#c9a43a" />
            <rect x="56" y="68" width="58" height="2" rx="1" fill="#cbd5e1" />
            <rect x="56" y="76" width="64" height="2" rx="1" fill="#cbd5e1" />
          </g>

          {/* Envelope + seal */}
          <g transform="translate(270, 72)">
            <rect x="0" y="0" width="128" height="92" rx="7" fill="#f8fafc" stroke="#0d2d7f" strokeWidth="2.5" />
            <path d="M0 10 L64 52 L128 10" stroke="#0d2d7f" strokeWidth="2" fill="none" strokeLinejoin="round" />
            <circle cx="100" cy="78" r="14" fill="#c9a43a" stroke="#0d2d7f" strokeWidth="1.5" />
            <path
              d="M94 78 L98 82 L106 72"
              stroke="#0d2d7f"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <rect x="12" y="100" width="104" height="2" rx="1" fill="#cbd5e1" />
            <rect x="12" y="106" width="72" height="2" rx="1" fill="#e2e8f0" />
          </g>

          {/* Small letter */}
          <g transform="translate(52, 175)">
            <g className="subscription-letter-drift">
              <rect width="52" height="36" rx="4" fill="#fff" stroke="#0d2d7f" strokeWidth="1.5" />
              <path d="M0 0 L26 18 L52 0" stroke="#0d2d7f" strokeWidth="1.2" fill="none" />
            </g>
          </g>
        </g>
      </svg>
    </div>
  );
}
