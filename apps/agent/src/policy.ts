import {
  PACKS,
  type PackName,
  type PolicyVerdict,
  type Proposal,
  type Rules,
} from "@choppilot/shared";
import type { UsageSummary } from "./usage.js";

// Consumption above this multiple of the 14-day baseline is never paid
// automatically, whatever the model concluded.
export const ANOMALY_THRESHOLD = 3;

const WEEK_MS = 7 * 86_400_000;

export interface PastRecharge {
  usdc: number;
  created_at: string;
}

export interface PolicyContext {
  balance: number;
  usage: UsageSummary;
  recharges: PastRecharge[];
  rules: Rules;
  payee: string;
  now?: Date;
}

export const BlockReason = {
  PACK_MISSING: "pack_missing",
  MAX_PER_RECHARGE: "max_per_recharge",
  WEEKLY_CAP: "weekly_cap",
  BALANCE_ABOVE_TRIGGER: "balance_above_trigger",
  RECIPIENT_NOT_ALLOWED: "recipient_not_allowed",
  ANOMALY: "anomaly",
  COOLDOWN: "cooldown",
} as const;

export function spentInWindow(recharges: PastRecharge[], now: Date, windowMs = WEEK_MS): number {
  const cutoff = now.getTime() - windowMs;
  return recharges
    .filter((r) => new Date(r.created_at).getTime() >= cutoff)
    .reduce((sum, r) => sum + r.usdc, 0);
}

export function minutesSinceLastRecharge(recharges: PastRecharge[], now: Date): number | null {
  if (recharges.length === 0) return null;
  const latest = recharges.reduce((newest, r) =>
    new Date(r.created_at) > new Date(newest.created_at) ? r : newest,
  );
  return (now.getTime() - new Date(latest.created_at).getTime()) / 60_000;
}

// Every failing rule is reported, not just the first, so the payer sees the
// whole reason a payment was refused.
export function evaluate(proposal: Proposal, ctx: PolicyContext): PolicyVerdict {
  if (proposal.action !== "recharge") {
    return { approved: false, blockedBy: [] };
  }

  const now = ctx.now ?? new Date();
  const blockedBy: string[] = [];

  const pack = proposal.pack as PackName | null;
  if (pack === null || !(pack in PACKS)) {
    return { approved: false, blockedBy: [BlockReason.PACK_MISSING] };
  }

  const price = PACKS[pack].usdc;

  if (price > ctx.rules.maxPerRechargeUsdc) {
    blockedBy.push(BlockReason.MAX_PER_RECHARGE);
  }

  if (spentInWindow(ctx.recharges, now) + price > ctx.rules.weeklyCapUsdc) {
    blockedBy.push(BlockReason.WEEKLY_CAP);
  }

  if (ctx.balance > ctx.rules.minBalanceTrigger) {
    blockedBy.push(BlockReason.BALANCE_ABOVE_TRIGGER);
  }

  if (!ctx.rules.recipientAllowlist.some((a) => a.toLowerCase() === ctx.payee.toLowerCase())) {
    blockedBy.push(BlockReason.RECIPIENT_NOT_ALLOWED);
  }

  // The model's own anomaly flag counts too: it may spot something the ratio misses.
  if (ctx.usage.spikeRatio > ANOMALY_THRESHOLD || proposal.anomaly) {
    blockedBy.push(BlockReason.ANOMALY);
  }

  const sinceLast = minutesSinceLastRecharge(ctx.recharges, now);
  if (sinceLast !== null && sinceLast < ctx.rules.cooldownMinutes) {
    blockedBy.push(BlockReason.COOLDOWN);
  }

  return { approved: blockedBy.length === 0, blockedBy };
}
