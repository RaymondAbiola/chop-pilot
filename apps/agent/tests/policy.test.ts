import { describe, expect, it } from "vitest";
import type { Proposal, Rules } from "@choppilot/shared";
import { ANOMALY_THRESHOLD, BlockReason, evaluate, spentInWindow } from "../src/policy.js";
import type { PolicyContext } from "../src/policy.js";
import type { UsageSummary } from "../src/usage.js";

const MERCHANT = "0x1Ef0E1De9F0ac2255a42e8987692f89F296dd670";
const NOW = new Date("2026-09-23T12:00:00.000Z");

const rules: Rules = {
  weeklyCapUsdc: 20,
  maxPerRechargeUsdc: 15,
  minBalanceTrigger: 10,
  cooldownMinutes: 60,
  recipientAllowlist: [MERCHANT],
};

const usage = (spikeRatio: number): UsageSummary => ({
  days: 14,
  totalChops: 35,
  dailyAverage: 2.5,
  recentAverage: 2.5 * spikeRatio,
  spikeRatio,
  byDay: [],
});

const recharge = (proposal: Partial<Proposal> = {}): Proposal => ({
  action: "recharge",
  pack: "medium",
  reasoning: "balance is low",
  projected_days_left: 2,
  anomaly: false,
  ...proposal,
});

const ctx = (overrides: Partial<PolicyContext> = {}): PolicyContext => ({
  balance: 5,
  usage: usage(1),
  recharges: [],
  rules,
  payee: MERCHANT,
  now: NOW,
  ...overrides,
});

const minutesAgo = (n: number): string => new Date(NOW.getTime() - n * 60_000).toISOString();
const daysAgo = (n: number): string => new Date(NOW.getTime() - n * 86_400_000).toISOString();

describe("evaluate", () => {
  it("approves a clean recharge", () => {
    expect(evaluate(recharge(), ctx())).toEqual({ approved: true, blockedBy: [] });
  });

  it("does not approve when the model is not asking to recharge", () => {
    expect(evaluate(recharge({ action: "wait", pack: null }), ctx())).toEqual({
      approved: false,
      blockedBy: [],
    });
    expect(evaluate(recharge({ action: "flag", pack: null }), ctx())).toEqual({
      approved: false,
      blockedBy: [],
    });
  });

  it("blocks a recharge with no pack", () => {
    const verdict = evaluate(recharge({ pack: null }), ctx());
    expect(verdict.approved).toBe(false);
    expect(verdict.blockedBy).toEqual([BlockReason.PACK_MISSING]);
  });

  it("blocks a pack that costs more than the per-recharge limit", () => {
    const verdict = evaluate(recharge({ pack: "large" }), ctx({
      rules: { ...rules, maxPerRechargeUsdc: 7.5 },
    }));
    expect(verdict.blockedBy).toContain(BlockReason.MAX_PER_RECHARGE);
  });

  it("blocks when the week's spending would exceed the cap", () => {
    const verdict = evaluate(recharge(), ctx({
      recharges: [
        { usdc: 8, created_at: daysAgo(1) },
        { usdc: 7, created_at: daysAgo(2) },
      ],
    }));
    expect(verdict.blockedBy).toContain(BlockReason.WEEKLY_CAP);
  });

  it("ignores spending that fell outside the 7 day window", () => {
    const verdict = evaluate(recharge(), ctx({
      recharges: [{ usdc: 19, created_at: daysAgo(8) }],
    }));
    expect(verdict.blockedBy).not.toContain(BlockReason.WEEKLY_CAP);
  });

  it("blocks when the balance is still above the trigger", () => {
    const verdict = evaluate(recharge(), ctx({ balance: 25 }));
    expect(verdict.blockedBy).toContain(BlockReason.BALANCE_ABOVE_TRIGGER);
  });

  it("blocks a payee that is not on the allowlist", () => {
    const verdict = evaluate(recharge(), ctx({ payee: "0xdeadbeef00000000000000000000000000000000" }));
    expect(verdict.blockedBy).toContain(BlockReason.RECIPIENT_NOT_ALLOWED);
  });

  it("accepts an allowlisted payee regardless of case", () => {
    const verdict = evaluate(recharge(), ctx({ payee: MERCHANT.toLowerCase() }));
    expect(verdict.approved).toBe(true);
  });

  it("blocks when consumption exceeds the anomaly threshold", () => {
    const verdict = evaluate(recharge(), ctx({ usage: usage(ANOMALY_THRESHOLD + 0.1) }));
    expect(verdict.blockedBy).toContain(BlockReason.ANOMALY);
  });

  it("blocks when the model itself flagged an anomaly", () => {
    const verdict = evaluate(recharge({ anomaly: true }), ctx());
    expect(verdict.blockedBy).toContain(BlockReason.ANOMALY);
  });

  it("blocks inside the cooldown window", () => {
    const verdict = evaluate(recharge(), ctx({
      recharges: [{ usdc: 7.5, created_at: minutesAgo(30) }],
    }));
    expect(verdict.blockedBy).toContain(BlockReason.COOLDOWN);
  });

  it("allows once the cooldown has passed", () => {
    const verdict = evaluate(recharge(), ctx({
      recharges: [{ usdc: 7.5, created_at: minutesAgo(90) }],
    }));
    expect(verdict.blockedBy).not.toContain(BlockReason.COOLDOWN);
  });

  it("reports every failing rule, not just the first", () => {
    const verdict = evaluate(recharge({ pack: "large", anomaly: true }), ctx({
      balance: 40,
      payee: "0xdeadbeef00000000000000000000000000000000",
      rules: { ...rules, maxPerRechargeUsdc: 7.5 },
      recharges: [{ usdc: 19, created_at: minutesAgo(10) }],
    }));
    expect(verdict.approved).toBe(false);
    expect(verdict.blockedBy).toEqual([
      BlockReason.MAX_PER_RECHARGE,
      BlockReason.WEEKLY_CAP,
      BlockReason.BALANCE_ABOVE_TRIGGER,
      BlockReason.RECIPIENT_NOT_ALLOWED,
      BlockReason.ANOMALY,
      BlockReason.COOLDOWN,
    ]);
  });
});

describe("spentInWindow", () => {
  it("sums only what falls inside the window", () => {
    const spent = spentInWindow(
      [
        { usdc: 2.5, created_at: daysAgo(1) },
        { usdc: 7.5, created_at: daysAgo(6) },
        { usdc: 100, created_at: daysAgo(30) },
      ],
      NOW,
    );
    expect(spent).toBe(10);
  });

  it("is zero with no history", () => {
    expect(spentInWindow([], NOW)).toBe(0);
  });
});

describe("waiveAnomaly", () => {
  it("lets a payer-approved anomaly through", () => {
    const verdict = evaluate(
      recharge({ anomaly: true }),
      ctx({ usage: usage(ANOMALY_THRESHOLD + 2) }),
      { waiveAnomaly: true },
    );
    expect(verdict.approved).toBe(true);
  });

  it("still enforces the weekly cap for an approved anomaly", () => {
    const verdict = evaluate(
      recharge({ anomaly: true }),
      ctx({
        usage: usage(ANOMALY_THRESHOLD + 2),
        recharges: [{ usdc: 19, created_at: daysAgo(1) }],
      }),
      { waiveAnomaly: true },
    );
    expect(verdict.approved).toBe(false);
    expect(verdict.blockedBy).toContain(BlockReason.WEEKLY_CAP);
    expect(verdict.blockedBy).not.toContain(BlockReason.ANOMALY);
  });

  it("still enforces the recipient allowlist for an approved anomaly", () => {
    const verdict = evaluate(
      recharge({ anomaly: true }),
      ctx({ usage: usage(ANOMALY_THRESHOLD + 2), payee: "0xdeadbeef00000000000000000000000000000000" }),
      { waiveAnomaly: true },
    );
    expect(verdict.blockedBy).toContain(BlockReason.RECIPIENT_NOT_ALLOWED);
  });
});
