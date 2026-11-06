const slotColors = ['#d8c8ef', '#bddce9', '#efd1c0', '#c7e0d2'];

/** Preview-only artwork shared by the editor and every frame picker. */
export function PhotoPlaceholder({ index }: { index: number }) {
  return (
    <svg
      className="photo-placeholder"
      width="100%"
      height="100%"
      overflow="hidden"
      aria-hidden="true"
    >
      <rect
        width="100%"
        height="100%"
        fill={slotColors[index % slotColors.length]}
      />
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 160 100"
        preserveAspectRatio="xMidYMid meet"
      >
        <g fill="#483957" opacity=".7">
          <circle cx="80" cy="25" r="18" />
          <path d="M42 91V79c0-23 17-35 38-35s38 12 38 35v12z" />
        </g>
        <text
          x="80"
          y="82"
          textAnchor="middle"
          fill="#ffffff"
          fontFamily="Segoe UI, sans-serif"
          fontSize="36"
          fontWeight="800"
        >
          {index + 1}
        </text>
      </svg>
    </svg>
  );
}
