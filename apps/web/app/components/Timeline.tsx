"use client";

import { useQuery } from "@tanstack/react-query";
import type { Decision } from "@choppilot/shared";
import { api } from "@/lib/api";
import styles from "./Timeline.module.css";

const EXPLORER = "https://sepolia.basescan.org/tx";

const STATUS: Record<Decision["status"], { text: string; tone: string }> = {
  paid: { text: "paid", tone: "var(--green)" },
  approved_by_payer: { text: "paid · you approved", tone: "var(--green)" },
  flagged: { text: "flagged", tone: "var(--amber)" },
  blocked: { text: "blocked", tone: "var(--red)" },
  failed: { text: "failed", tone: "var(--red)" },
  rejected_by_payer: { text: "you rejected", tone: "var(--dim)" },
  waited: { text: "no action", tone: "var(--dim)" },
};

// The dashboard speaks to a payer, not an operator, so rule codes become
// sentences. Anything unrecognised falls through as-is rather than vanishing.
const REASONS: Record<string, string> = {
  max_per_recharge: "over your per-recharge limit",
  weekly_cap: "would exceed your weekly cap",
  balance_above_trigger: "balance still above your trigger",
  recipient_not_allowed: "payee is not on your allowlist",
  anomaly: "consumption looks unusual",
  cooldown: "too soon after the last recharge",
  pack_missing: "no pack was chosen",
};

function explain(code: string): string {
  if (code.startsWith("payment_failed:")) {
    return `payment failed — ${code.slice("payment_failed:".length)}`;
  }
  return REASONS[code] ?? code;
}

function clockOf(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour12: false });
}

function agoOf(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}

export function Timeline({ actions }: { actions?: (decision: Decision) => React.ReactNode }) {
  const decisions = useQuery({
    queryKey: ["decisions"],
    queryFn: () => api.decisions(50),
    refetchInterval: 4000,
  });

  if (decisions.isError) {
    return <p className={styles.empty}>Agent unreachable.</p>;
  }

  if (decisions.data && decisions.data.length === 0) {
    return <p className={styles.empty}>No decisions yet. Run a tick to see the agent reason.</p>;
  }

  return (
    <ol className={styles.list}>
      {(decisions.data ?? []).map((decision) => (
        <Entry key={decision.id} decision={decision} actions={actions} />
      ))}
    </ol>
  );
}

function Entry({
  decision,
  actions,
}: {
  decision: Decision;
  actions?: (decision: Decision) => React.ReactNode;
}) {
  const status = STATUS[decision.status];
  const blocked = decision.verdict.blockedBy;
  const passed = decision.verdict.approved;

  return (
    <li className={styles.entry}>
      <div className={styles.head}>
        <span className={`num ${styles.clock}`}>{clockOf(decision.created_at)}</span>
        <span className={`num ${styles.status}`} style={{ color: status.tone }}>
          {status.text}
        </span>
        <span className={styles.spacer} />
        {decision.proposal.pack ? (
          <span className={`num ${styles.pack}`}>{decision.proposal.pack}</span>
        ) : null}
        <span className={styles.ago}>{agoOf(decision.created_at)}</span>
      </div>

      {/* The two rows below are the whole argument: the model proposes, the code decides. */}
      <div className={styles.row}>
        <span className={styles.rowLabel}>serv</span>
        <span className={styles.reasoning}>{decision.proposal.reasoning}</span>
      </div>

      <div className={styles.row}>
        <span className={styles.rowLabel}>policy</span>
        <span className={styles.verdict}>
          {blocked.length > 0 ? (
            <span className={styles.blockedList}>
              {blocked.map((code) => (
                <span key={code} className={styles.blockedItem}>
                  <span className={styles.cross}>✕</span>
                  {explain(code)}
                </span>
              ))}
            </span>
          ) : passed ? (
            <span style={{ color: "var(--green)" }}>all rules passed</span>
          ) : (
            <span className={styles.muted}>no payment proposed</span>
          )}
        </span>
      </div>

      {decision.tx_hash ? (
        <div className={styles.row}>
          <span className={styles.rowLabel}>tx</span>
          <a
            className={`num ${styles.tx}`}
            href={`${EXPLORER}/${decision.tx_hash}`}
            target="_blank"
            rel="noreferrer"
          >
            {decision.tx_hash.slice(0, 10)}…{decision.tx_hash.slice(-4)} ↗
          </a>
        </div>
      ) : null}

      {actions ? <div className={styles.actions}>{actions(decision)}</div> : null}
    </li>
  );
}
