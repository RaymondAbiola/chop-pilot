import { accountStateSchema, type Decision, type PackName } from "@choppilot/shared";
import { config } from "./config.js";
import { payForPack } from "./pay.js";
import { evaluate } from "./policy.js";
import { proposeDecision } from "./serv.js";
import { getRules, recordDecision, type Store } from "./store.js";
import type { CdpX402Client } from "@coinbase/cdp-sdk/x402";

export interface TickResult {
  decision: Decision;
  tokens: { input: number; output: number };
  model: string;
}

async function fetchAccount(accountId: string) {
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
