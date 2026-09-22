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

export const spendAtomic = {
  perPayment: usdcToAtomic(config.spend.maxPerPaymentUsdc),
  cumulative: usdcToAtomic(config.spend.maxCumulativeUsdc),
};
