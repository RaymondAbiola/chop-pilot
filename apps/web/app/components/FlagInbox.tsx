"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PACKS, type PackName, PACK_NAMES, type Decision } from "@choppilot/shared";
import { api } from "@/lib/api";
import styles from "./FlagInbox.module.css";

export function FlagInbox() {
  const queryClient = useQueryClient();
  const flags = useQuery({ queryKey: ["flags"], queryFn: api.flags, refetchInterval: 4000 });
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["flags"] });
    void queryClient.invalidateQueries({ queryKey: ["decisions"] });
    void queryClient.invalidateQueries({ queryKey: ["account"] });
    void queryClient.invalidateQueries({ queryKey: ["wallet"] });
  };

  const approve = useMutation({
    mutationFn: ({ id, pack }: { id: string; pack: PackName }) => api.approve(id, pack),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: (err: Error) => setError(err.message),
  });

  const reject = useMutation({
    mutationFn: (id: string) => api.reject(id),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: (err: Error) => setError(err.message),
  });

  const pending = flags.data ?? [];
  if (pending.length === 0) return null;

  const busy = approve.isPending || reject.isPending;

  return (
    <section className={styles.inbox}>
      <div className={styles.headline}>
        <span className="label" style={{ color: "var(--amber)" }}>
          needs your approval
        </span>
        <span className={`num ${styles.count}`}>{pending.length}</span>
      </div>

      {pending.map((decision: Decision) => (
        <div key={decision.id} className={styles.item}>
          <p className={styles.reasoning}>{decision.proposal.reasoning}</p>
          <p className={styles.meta}>
            balance was <span className="num">{decision.account.chop_balance}</span> chops
          </p>

          <div className={styles.controls}>
            {PACK_NAMES.map((pack) => (
              <button
                key={pack}
                className={styles.approve}
                disabled={busy}
                onClick={() => approve.mutate({ id: decision.id, pack })}
              >
                approve {pack}
                <span className={styles.price}>${PACKS[pack].usdc.toFixed(2)}</span>
              </button>
            ))}
            <button
              className={styles.reject}
              disabled={busy}
              onClick={() => reject.mutate(decision.id)}
            >
              reject
            </button>
          </div>
        </div>
      ))}

      {error ? <p className={styles.error}>{error}</p> : null}
      <p className={styles.note}>
        Approving waives the anomaly only. Your caps, cooldown and payee allowlist are re-checked
        against the account as it stands now.
      </p>
    </section>
  );
}
