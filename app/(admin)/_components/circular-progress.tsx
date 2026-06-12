"use client";

interface CircularProgressProps {
  /** Percentage value 0–100. null/undefined = show ∞ */
  value: number | null | undefined;
  /** Label text below the value */
  label?: string;
  /** Diameter in pixels */
  size?: number;
  /** Stroke color (Tailwind class or CSS color) */
  color?: string;
  /** Show the numeric value inside the circle */
  showValue?: boolean;
}

export function CircularProgress({
  value,
  label,
  size = 36,
  color = "var(--primary)",
  showValue = true,
}: CircularProgressProps) {
  const r = (size - 4) / 2;
  const circumference = 2 * Math.PI * r;
  const pct = value != null ? Math.min(100, Math.max(0, value)) : null;
  const offset = pct != null ? circumference - (pct / 100) * circumference : 0;

  return (
    <div className="inline-flex flex-col items-center gap-0.5">
      <svg width={size} height={size} className="block">
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={3}
        />
        {/* Foreground arc */}
        {pct != null ? (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            className="transition-all duration-300"
          />
        ) : null}
        {/* Center text */}
        {showValue && (
          <text
            x={size / 2}
            y={size / 2}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-foreground text-[9px] font-medium tabular-nums"
          >
            {pct != null ? `${Math.round(pct)}%` : "∞"}
          </text>
        )}
      </svg>
      {label && (
        <span className="text-[10px] text-muted-foreground leading-none">
          {label}
        </span>
      )}
    </div>
  );
}
