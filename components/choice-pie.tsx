import type { ChoiceTally } from "@/lib/questionnaire";
import type { ChoiceColor } from "@/lib/types";
import { cn } from "@/lib/utils";

/** An option's colour; options without one take the chart colours in order. */
export function choiceColor(color: ChoiceColor | undefined, index: number) {
  return color ? `var(--choice-${color})` : `var(--chart-${(index % 5) + 1})`;
}

const C = 50;
const R = 48;

/** A slice from `start` to `end`, as fractions of the circle from 12 o'clock. */
function slicePath(start: number, end: number) {
  const point = (turn: number) => {
    const a = (turn - 0.25) * 2 * Math.PI;
    return `${(C + R * Math.cos(a)).toFixed(3)} ${(C + R * Math.sin(a)).toFixed(3)}`;
  };
  const large = end - start > 0.5 ? 1 : 0;
  return `M${C} ${C} L${point(start)} A${R} ${R} 0 ${large} 1 ${point(end)} Z`;
}

function slicesOf(tally: ChoiceTally) {
  const slices = [];
  let at = 0;
  for (const [i, { option, count }] of tally.options.entries()) {
    const share = tally.answered ? count / tally.answered : 0;
    slices.push({
      option,
      count,
      percent: Math.round(share * 100),
      color: choiceColor(option.color, i),
      start: at,
      end: at + share,
    });
    at += share;
  }
  return slices;
}

/**
 * How the answers to a choice split, e.g. "Will you come back?": a pie, and
 * beside it each option with its count and share, so no colour stands alone.
 */
export function ChoicePie({
  tally,
  className,
}: {
  tally: ChoiceTally;
  className?: string;
}) {
  if (tally.answered === 0) {
    return <p className="text-sm text-muted-foreground">No answers yet.</p>;
  }
  const slices = slicesOf(tally);
  const drawn = slices.filter((s) => s.count > 0);
  const tip = (s: (typeof slices)[number]) =>
    `${s.option.label}: ${s.count} of ${tally.answered} (${s.percent}%)`;

  return (
    <div className={cn("flex flex-wrap items-center gap-x-8 gap-y-4", className)}>
      <svg
        viewBox="0 0 100 100"
        className="size-32 shrink-0"
        role="img"
        aria-label={`${tally.question.label} ${slices.map(tip).join(", ")}`}
      >
        {drawn.length === 1 ? (
          <circle cx={C} cy={C} r={R} style={{ fill: drawn[0].color }}>
            <title>{tip(drawn[0])}</title>
          </circle>
        ) : (
          drawn.map((s) => (
            <path
              key={s.option.value}
              d={slicePath(s.start, s.end)}
              style={{ fill: s.color }}
              className="stroke-card"
              strokeWidth={1.5}
              strokeLinejoin="round"
            >
              <title>{tip(s)}</title>
            </path>
          ))
        )}
      </svg>
      <ul className="min-w-44 flex-1 space-y-2 text-sm sm:flex-none">
        {slices.map((s) => (
          <li key={s.option.value} className="flex items-center gap-2.5">
            <span
              className="size-3 shrink-0 rounded-sm"
              style={{ background: s.color }}
              aria-hidden
            />
            <span className="text-foreground">{s.option.label}</span>
            <span className="ml-auto pl-4 text-foreground tabular-nums">
              {s.count}
            </span>
            <span className="w-10 text-right text-muted-foreground tabular-nums">
              {s.percent}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
