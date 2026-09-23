"use client";

import { useQuery } from "@tanstack/react-query";
import { RulesForm } from "./components/RulesForm";
import { StatStrip } from "./components/StatStrip";
import { WalletCard } from "./components/WalletCard";
import { api } from "@/lib/api";
import styles from "./page.module.css";

export default function Dashboard() {
  const health = useQuery({ queryKey: ["health"], queryFn: api.health, refetchInterval: 8000 });
  const account = health.data?.account ?? "amaka";
  const online = health.isSuccess;

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.wordmark}>
          CHOP<span className={styles.wordmarkAccent}>PILOT</span>
        </div>
        <div className={styles.status}>
          <span className={styles.dot} style={{ background: online ? "var(--green)" : "var(--dim)" }} />
          <span className="label">{online ? "agent live" : "agent offline"}</span>
        </div>
      </header>

      <StatStrip account={account} />

      <div className={styles.columns}>
        <div className={styles.column}>
          <WalletCard />
        </div>
        <div className={styles.column}>
          <RulesForm />
        </div>
      </div>

      <hr className="rule" />
      <p className={styles.placeholder}>Decision timeline lands in the next commit.</p>
    </main>
  );
}
