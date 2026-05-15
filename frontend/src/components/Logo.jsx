export default function Logo({ size = 32 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="kepler-logo"
    >
      <defs>
        <linearGradient id="kepler-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
      </defs>
      <ellipse
        cx="20"
        cy="20"
        rx="17"
        ry="7"
        fill="none"
        stroke="url(#kepler-grad)"
        strokeWidth="1.6"
        transform="rotate(-30 20 20)"
        opacity="0.7"
      />
      <circle cx="20" cy="20" r="7" fill="url(#kepler-grad)" />
      <circle cx="33" cy="13" r="2.2" fill="#22d3ee" />
    </svg>
  );
}
