import { accountStateSchema, type Decision, type PackName } from "@choppilot/shared";
import { config } from "./config.js";
import { payForPack } from "./pay.js";
import { evaluate } from "./policy.js";
import { proposeDecision } from "./serv.js";
import { summarizeUsage } from "./usage.js";
import { getDecision, getRules, recordDecision, updateDecision, type Store } from "./store.js";
import type { CdpX402Client } from "@coinbase/cdp-sdk/x402";

export interface TickResult {
  decision: Decision;
  tokens: { input: number; output: number };
  model: string;
}

export async function fetchAccount(accountId: string) {
  const res = await fetch(`${config.mockUrl}/accounts/${accountId}`);
  if (!res.ok) {
    throw new Error(`chopeazy-mock returned ${res.status} for account ${accountId}`);
  }
  return accountStateSchema.parse(await res.json());
}

// One pass: read state, ask SERV, enforce the rules, pay only if the rules
// allow it. Every outcome is written to the decision log, including the ones
// where nothing happened.
export async function runTick(
  db: Store,
  client: CdpX402Client,
  accountId: string,
): Promise<TickResult> {
  const account = await fetchAccount(accountId);
  const rules = getRules(db);

  const { proposal, usage, model, tokens } = await proposeDecision(account, rules);

  const verdict = evaluate(proposal, {
    balance: account.chop_balance,
    usage,
    recharges: account.recharges ?? [],
    rules,
    payee: config.merchantAddress,
  });

  const base = {
    created_at: new Date().toISOString(),
    account: { id: account.id, chop_balance: account.chop_balance },
    proposal,
    verdict,
  };

  if (!verdict.approved) {
    const status: Decision["status"] =
      proposal.action === "flag" ? "flagged" : proposal.action === "wait" ? "waited" : "blocked";
    return {
      decision: recordDecision(db, { ...base, status, tx_hash: null }),
      tokens,
      model,
    };
  }

  // Approved. The pack is guaranteed non-null here; the policy engine blocks
  // a recharge without one.
  const pack = proposal.pack as PackName;

  try {
    const result = await payForPack(client, pack, account.id);
    if (!result.ok) {
      throw new Error(`recharge returned ${result.status}`);
    }
    return {
      decision: recordDecision(db, { ...base, status: "paid", tx_hash: result.txHash }),
      tokens,
      model,
    };
  } catch (err) {
    // A payment that was authorised but failed is its own outcome, and the
    // payer needs to see it rather than a silent gap in the timeline.
    const message = err instanceof Error ? err.message : String(err);
    const decision = recordDecision(db, {
      ...base,
      verdict: { approved: false, blockedBy: [`payment_failed:${message}`] },
      status: "failed",
      tx_hash: null,
    });
    return { decision, tokens, model };
  }
}

export interface ResolveResult {
  decision: Decision;
  blockedBy?: string[];
}

// The payer reviewed a flagged decision. Approving waives the anomaly
// judgement and nothing else: the caps, the allowlist and the cooldown are
// re-checked against the account as it stands now, not as it stood when the
// flag was raised.
export async function approveFlagged(
  db: Store,
  client: CdpX402Client,
  id: string,
  pack: PackName,
): Promise<ResolveResult> {
  const existing = getDecision(db, id);
  if (!existing) throw new Error("decision not found");
  if (existing.status !== "flagged") {
    throw new Error(`decision is ${existing.status}, not flagged`);
  }

  const account = await fetchAccount(existing.account.id);
  const rules = getRules(db);
  const usage = summarizeUsage(account.orders);

  const proposal = { ...existing.proposal, action: "recharge" as const, pack };
  const verdict = evaluate(
    proposal,
    {
      balance: account.chop_balance,
      usage,
      recharges: account.recharges ?? [],
      rules,
      payee: config.merchantAddress,
    },
    { waiveAnomaly: true },
  );

  if (!verdict.approved) {
    return { decision: existing, blockedBy: verdict.blockedBy };
  }

  const result = await payForPack(client, pack, account.id);
  if (!result.ok) {
    updateDecision(db, id, "failed", null);
    return { decision: { ...existing, status: "failed" }, blockedBy: [`payment_failed:${result.status}`] };
  }

  updateDecision(db, id, "approved_by_payer", result.txHash);
  return { decision: { ...existing, status: "approved_by_payer", tx_hash: result.txHash } };
}

export function rejectFlagged(db: Store, id: string): Decision {
  const existing = getDecision(db, id);
  if (!existing) throw new Error("decision not found");
  if (existing.status !== "flagged") {
    throw new Error(`decision is ${existing.status}, not flagged`);
  }
  updateDecision(db, id, "rejected_by_payer", null);
  return { ...existing, status: "rejected_by_payer" };
}
