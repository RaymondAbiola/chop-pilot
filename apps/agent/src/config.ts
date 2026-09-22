import { loadRootEnv, requireEnv, usdcToAtomic } from "@choppilot/shared";

loadRootEnv(import.meta.url);

export const config = {
  merchantAddress: requireEnv("MERCHANT_ADDRESS"),
  mockUrl: process.env.CHOPEAZY_MOCK_URL ?? "http://localhost:4000",
  agentPort: Number(process.env.AGENT_PORT ?? 4100),

  // Hard ceilings enforced by the CDP SDK itself, underneath the policy engine.
  // Deliberately generous relative to the payer's own rules: this is the floor
  // that holds even if the agent process is wrong about everything else.
  spend: {
    maxPerPaymentUsdc: Number(process.env.SPEND_MAX_PER_PAYMENT_USDC ?? 0.5),
    maxCumulativeUsdc: Number(process.env.SPEND_MAX_CUMULATIVE_USDC ?? 5),
    window: process.env.SPEND_WINDOW ?? "7d",
  },
} as const;

// Starting rules. The dashboard will let the payer change these in commit 12;
// until then they are the demo defaults.
export const defaultRules = {
  weeklyCapUsdc: Number(process.env.RULE_WEEKLY_CAP_USDC ?? 3),
  maxPerRechargeUsdc: Number(process.env.RULE_MAX_PER_RECHARGE_USDC ?? 0.5),
  minBalanceTrigger: Number(process.env.RULE_MIN_BALANCE_TRIGGER ?? 10),
  cooldownMinutes: Number(process.env.RULE_COOLDOWN_MINUTES ?? 60),
  recipientAllowlist: [requireEnv("MERCHANT_ADDRESS")],
};

export const spendAtomic = {
  perPayment: usdcToAtomic(config.spend.maxPerPaymentUsdc),
  cumulative: usdcToAtomic(config.spend.maxCumulativeUsdc),
};
