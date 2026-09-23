"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import styles from "./page.module.css";

export default function Dashboard() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: api.health,
    refetchInterval: 8000,
  });

  const online = health.isSuccess;

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.wordmark}>
          CHOP<span className={styles.wordmarkAccent}>PILOT</span>
        </div>
        <div className={styles.status}>
          <span
            className={styles.dot}
            style={{ background: online ? "var(--green)" : "var(--dim)" }}
          />
          <span className="label">{online ? "agent live" : "agent offline"}</span>
        </div>
      </header>

      <hr className="rule" />

      <section className={styles.body}>
        <p className={styles.placeholder}>
          Wallet, rules and the decision timeline land in the next commits.
        </p>
      </section>
    </main>
  );
}
