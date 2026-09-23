"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import styles from "./DemoPanel.module.css";

const NORMAL_DAY = 3;
const SPIKE_DAY = 14;

export function DemoPanel() {
  const queryClient = useQueryClient();
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    for (const key of ["decisions", "flags", "account", "wallet", "rules"]) {
      void queryClient.invalidateQueries({ queryKey: [key] });
    }
  };

  const run = useMutation({
    mutationFn: async (action: "reset" | "normal" | "spike" | "tick") => {
      setError(null);
      switch (action) {
        case "reset":
          // Both stores, or the timeline keeps yesterday's story.
          await Promise.all([api.reset(), api.resetAgent()]);
          return "reset to a clean 14 day history";
        case "normal":
          await api.consume(NORMAL_DAY);
          return `${NORMAL_DAY} chops eaten, a normal day`;
        case "spike":
          await api.consume(SPIKE_DAY);
          return `${SPIKE_DAY} chops eaten, well above the baseline`;
        case "tick": {
          const { decision } = await api.tick();
          return `agent decided: ${decision.status}`;
        }
      }
    },
    onSuccess: (message) => {
      setNote(message ?? null);
      refresh();
    },
    onError: (err: Error) => {
      setNote(null);
      setError(err.message);
    },
  });

  const busy = run.isPending;

  return (
    <section className={styles.panel}>
      <div className={styles.row}>
        <span className="label">demo</span>

        <button className={styles.button} disabled={busy} onClick={() => run.mutate("reset")}>
          reset
        </button>
        <button className={styles.button} disabled={busy} onClick={() => run.mutate("normal")}>
          normal day
        </button>
        <button className={styles.button} disabled={busy} onClick={() => run.mutate("spike")}>
          usage spike
        </button>

        <span className={styles.spacer} />

        <button
          className={`${styles.button} ${styles.primary}`}
          disabled={busy}
          onClick={() => run.mutate("tick")}
        >
          {busy && run.variables === "tick" ? "thinking…" : "run agent"}
        </button>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}
      {note && !error ? <p className={styles.note}>{note}</p> : null}
    </section>
  );
}
