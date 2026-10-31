export function QuickLaunchOrbit(): React.JSX.Element {
  return (
    <svg
      className="workspace-quick-launch-orbit"
      viewBox="0 0 320 210"
      fill="none"
      aria-hidden="true"
    >
      <g stroke="currentColor" strokeWidth="0.8">
        <ellipse cx="160" cy="105" rx="115" ry="37" transform="rotate(-35 160 105)" />
        <ellipse
          cx="160"
          cy="105"
          rx="123"
          ry="29"
          transform="rotate(-39 160 105)"
          strokeDasharray="52 12 3 18"
        />
        <ellipse
          cx="160"
          cy="105"
          rx="104"
          ry="48"
          transform="rotate(-31 160 105)"
          strokeDasharray="2 15"
        />
        <circle cx="160" cy="105" r="23" />
        <path d="M155 83 Q131 102 155 126 M82 30v18m-9-9h18 M246 154v14m-7-7h14 M160 5v18m0 168v14" />
      </g>
    </svg>
  )
}
