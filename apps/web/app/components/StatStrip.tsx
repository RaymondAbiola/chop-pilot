"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import styles from "./StatStrip.module.css";

const WEEK_MS = 7 * 86_400_000;

export function StatStrip({ account }: { account: string }) {
  const state = useQuery({
    queryKey: ["account", account],
    queryFn: () => api.account(account),
    refetchInterval: 5000,
  });

  const wallet = useQuery({ queryKey: ["wallet"], queryFn: api.wallet, refetchInterval: 15_000 });
  const rules = useQuery({ queryKey: ["rules"], queryFn: api.rules, refetchInterval: 15_000 });

  const cutoff = Date.now() - WEEK_MS;
  const weekSpend = (state.data?.recharges ?? [])
    .filter((r) => new Date(r.created_at).getTime() >= cutoff)
    .reduce((sum, r) => sum + r.usdc, 0);

  // Meter against the payer's own weekly cap, not the SDK backstop. The
  // payer's rule is lower and bites first, so showing the backstop here would
  // overstate the headroom.
  const cap = rules.data?.weeklyCapUsdc;
  const pct = cap ? Math.min(100, (weekSpend / cap) * 100) : 0;

  return (
    <section className={styles.strip}>
      <Stat label="balance" value={state.data ? `${state.data.chop_balance}` : "—"} unit="chops" />
      <Stat
        label="agent usdc"
        value={wallet.data ? wallet.data.usdc.toFixed(2) : "—"}
        unit={wallet.isError ? "unreachable" : "available"}
        tone={wallet.data && wallet.data.usdc < 1 ? "warn" : undefined}
      />
      <Stat
        label="week spend"
        value={weekSpend.toFixed(2)}
        unit={cap ? `of ${cap.toFixed(2)} your cap` : ""}
        meter={pct}
      />
    </section>
  );
}

function Stat({
  label,
  value,
  unit,
  meter,
  tone,
}: {
  label: string;
  value: string;
  unit?: string;
  meter?: number;
  tone?: "warn";
}) {
  return (
    <div className={styles.stat}>
      <div className="label">{label}</div>
      <div className={`num ${styles.value}`} style={tone === "warn" ? { color: "var(--amber)" } : undefined}>
        {value}
      </div>
      {unit ? <div className={styles.unit}>{unit}</div> : null}
      {meter !== undefined ? (
        <div className={styles.meter}>
          <span style={{ width: `${meter}%`, background: meter > 80 ? "var(--red)" : "var(--amber)" }} />
        </div>
      ) : null}
    </div>
  );
}
