"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { Rules } from "@choppilot/shared";
import { api } from "@/lib/api";
import styles from "./RulesForm.module.css";

type Draft = Record<keyof Omit<Rules, "recipientAllowlist">, string>;

const FIELDS: { key: keyof Draft; label: string; hint: string; unit: string }[] = [
  { key: "weeklyCapUsdc", label: "weekly cap", hint: "total spend in any rolling 7 days", unit: "USDC" },
  { key: "maxPerRechargeUsdc", label: "per recharge", hint: "largest single payment", unit: "USDC" },
  { key: "minBalanceTrigger", label: "recharge at", hint: "balance that triggers a top-up", unit: "chops" },
  { key: "cooldownMinutes", label: "cooldown", hint: "minimum gap between recharges", unit: "min" },
];

export function RulesForm() {
  const queryClient = useQueryClient();
  const rules = useQuery({ queryKey: ["rules"], queryFn: api.rules, refetchInterval: 15_000 });
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    if (!rules.data) return;
    setDraft({
      weeklyCapUsdc: String(rules.data.weeklyCapUsdc),
      maxPerRechargeUsdc: String(rules.data.maxPerRechargeUsdc),
      minBalanceTrigger: String(rules.data.minBalanceTrigger),
      cooldownMinutes: String(rules.data.cooldownMinutes),
    });
  }, [rules.data]);

  const save = useMutation({
    mutationFn: (next: Rules) => api.saveRules(next),
    onSuccess: (saved) => {
      queryClient.setQueryData(["rules"], saved);
    },
  });

  const dirty =
    draft !== null &&
    rules.data !== undefined &&
    FIELDS.some((f) => Number(draft[f.key]) !== rules.data[f.key]);

  const submit = () => {
    if (!draft || !rules.data) return;
    save.mutate({
      ...rules.data,
      weeklyCapUsdc: Number(draft.weeklyCapUsdc),
      maxPerRechargeUsdc: Number(draft.maxPerRechargeUsdc),
      minBalanceTrigger: Number(draft.minBalanceTrigger),
      cooldownMinutes: Number(draft.cooldownMinutes),
    });
  };

  if (rules.isError) {
    return (
      <div className={styles.panel}>
        <div className="label">your rules</div>
        <p className={styles.error}>Agent unreachable.</p>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <div className="label">your rules</div>

      {FIELDS.map((field) => (
        <label key={field.key} className={styles.field}>
          <span className={styles.fieldLabel}>
            {field.label}
            <span className={styles.hint}>{field.hint}</span>
          </span>
          <span className={styles.inputWrap}>
            <input
              className={`num ${styles.input}`}
              value={draft?.[field.key] ?? ""}
              onChange={(e) => setDraft((d) => (d ? { ...d, [field.key]: e.target.value } : d))}
              inputMode="decimal"
              disabled={!draft}
            />
            <span className={styles.unit}>{field.unit}</span>
          </span>
        </label>
      ))}

      <div className={styles.allowlist}>
        <span className={styles.fieldLabel}>
          pays only
          <span className={styles.hint}>fixed to the ChopEazy merchant address</span>
        </span>
        <span className={`num ${styles.locked}`}>
          {rules.data?.recipientAllowlist[0]?.slice(0, 6)}…{rules.data?.recipientAllowlist[0]?.slice(-4)}
        </span>
      </div>

      <button className={styles.button} onClick={submit} disabled={!dirty || save.isPending}>
        {save.isPending ? "saving" : dirty ? "save rules" : "saved"}
      </button>
      {save.isError ? <p className={styles.error}>{(save.error as Error).message}</p> : null}
    </div>
  );
}
