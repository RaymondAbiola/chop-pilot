"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import styles from "./UsageChart.module.css";

// Validated against the dark surface with the dataviz palette checker:
// lightness band, chroma floor, CVD separation, normal-vision floor, contrast.
const NORMAL = "#3987e5";
const SPIKE = "#c98500";

const DAYS = 14;
const ANOMALY_THRESHOLD = 3;

interface Day {
  date: string;
  chops: number;
}

function bucket(orders: { chops: number; created_at: string }[]): Day[] {
  const now = Date.now();
  const days = new Map<string, number>();

  for (let i = DAYS - 1; i >= 0; i--) {
    days.set(new Date(now - i * 86_400_000).toISOString().slice(0, 10), 0);
  }
  for (const order of orders) {
    const key = order.created_at.slice(0, 10);
    if (days.has(key)) days.set(key, (days.get(key) ?? 0) + order.chops);
  }
  return [...days.entries()].map(([date, chops]) => ({ date, chops }));
}

// Rounded at the data end only; the baseline end stays square so the bar reads
// as anchored rather than floating.
// Shows how the account was funded before the agent took over, so the balance
// and the eating history visibly add up.
function Backstory({
  recharges,
}: {
  recharges: { pack: string; usdc: number; created_at: string }[];
}) {
  const manual = recharges.find((r) => r.pack === "manual");
  if (!manual) return null;

  const daysAgo = Math.round((Date.now() - new Date(manual.created_at).getTime()) / 86_400_000);
  return (
    <p className={styles.backstory}>
      before ChopPilot: topped up by hand, ${manual.usdc.toFixed(2)} · {daysAgo} days ago
    </p>
  );
}

function barPath(x: number, y: number, w: number, h: number, r: number): string {
  const radius = Math.min(r, h, w / 2);
  if (h <= 0) return "";
  return `M ${x} ${y + h} L ${x} ${y + radius} Q ${x} ${y} ${x + radius} ${y} L ${x + w - radius} ${y} Q ${x + w} ${y} ${x + w} ${y + radius} L ${x + w} ${y + h} Z`;
}

export function UsageChart({ account }: { account: string }) {
  const state = useQuery({
    queryKey: ["account", account],
    queryFn: () => api.account(account),
    refetchInterval: 5000,
  });

  const days = bucket(state.data?.orders ?? []);
  const total = days.reduce((sum, d) => sum + d.chops, 0);
  const average = days.length > 0 ? total / days.length : 0;
  const peak = Math.max(1, ...days.map((d) => d.chops));

  const W = 320;
  const H = 72;
  const GAP = 2;
  const slot = W / DAYS;
  const barW = Math.max(3, slot - GAP);
  const scale = (n: number) => (n / peak) * H;

  const spikeDay = days.find((d) => average > 0 && d.chops > average * ANOMALY_THRESHOLD);

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <span className="label">chops eaten per day</span>
        <span className={`num ${styles.avg}`}>{average.toFixed(1)}/day average</span>
      </div>

      <svg viewBox={`0 0 ${W} ${H + 14}`} className={styles.svg} role="img"
        aria-label={`Daily consumption over ${DAYS} days, averaging ${average.toFixed(1)} chops per day`}>
        {/* Baseline marker: the thing every bar is being judged against. */}
        {average > 0 ? (
          <line
            x1={0}
            x2={W}
            y1={H - scale(average)}
            y2={H - scale(average)}
            stroke="var(--dim)"
            strokeWidth={1}
            strokeDasharray="2 3"
          />
        ) : null}

        {days.map((day, i) => {
          const h = scale(day.chops);
          const isSpike = average > 0 && day.chops > average * ANOMALY_THRESHOLD;
          return (
            <g key={day.date}>
              <path
                d={barPath(i * slot, H - h, barW, h, 3)}
                fill={isSpike ? SPIKE : NORMAL}
                opacity={isSpike ? 1 : 0.75}
              />
              <title>{`${day.date}: ${day.chops} chops`}</title>
            </g>
          );
        })}

        <line x1={0} x2={W} y1={H} y2={H} stroke="var(--hairline)" strokeWidth={1} />
      </svg>

      <Backstory recharges={state.data?.recharges ?? []} />

      <div className={styles.foot}>
        <span>{days[0]?.date.slice(5)}</span>
        {spikeDay ? (
          <span className={styles.callout} style={{ color: SPIKE }}>
            {spikeDay.chops} chops on {spikeDay.date.slice(5)}, {(spikeDay.chops / average).toFixed(1)}× the average
          </span>
        ) : (
          <span className={styles.steady}>steady</span>
        )}
        <span>today</span>
      </div>
    </div>
  );
}
