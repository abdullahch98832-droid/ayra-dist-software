/** Delivery routes fanning out from one warehouse: lines and stops, drawn for the sign-in panel. */
const ROUTES = [
  "M400 300 C 330 250, 300 160, 190 150 S 60 90, -20 110",
  "M400 300 C 300 330, 240 280, 150 310 S 30 380, -20 350",
  "M400 300 C 360 400, 260 420, 210 480 S 120 560, 60 620",
  "M400 300 C 420 190, 520 170, 560 90 S 660 20, 700 -20",
  "M400 300 C 500 290, 560 230, 650 250 S 760 200, 830 220",
  "M400 300 C 480 360, 600 340, 660 400 S 780 450, 830 430",
  "M400 300 C 430 420, 520 440, 560 520 S 600 590, 590 640",
];
const STOPS: [number, number][] = [[190, 150], [150, 310], [210, 480], [560, 90], [650, 250], [660, 400], [560, 520], [300, 195], [470, 440]];

export function AuthArtwork({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice" fill="none" aria-hidden>
      <g stroke="#7ea4ff" strokeOpacity="0.4" strokeWidth="1.5" strokeLinecap="round">
        {ROUTES.map((d) => <path key={d} d={d} />)}
      </g>
      {STOPS.map(([x, y], i) => (
        <g key={`${x}-${y}`}>
          <circle cx={x} cy={y} r="14" fill="#7ea4ff" fillOpacity="0.14" />
          <circle cx={x} cy={y} r={i % 3 === 0 ? 5 : 4} fill="#b9ceff" />
        </g>
      ))}
      <rect x="368" y="268" width="64" height="64" rx="14" fill="var(--navy)" stroke="#b9ceff" strokeWidth="1.5" transform="rotate(45 400 300)" />
      <rect x="384" y="284" width="32" height="32" rx="7" fill="#ffffff" transform="rotate(45 400 300)" />
    </svg>
  );
}
