import { CdpX402Client } from "@coinbase/cdp-sdk/x402";
import { NETWORK, USDC_BASE_SEPOLIA } from "@choppilot/shared";
import { config, spendAtomic } from "./config.js";

// CdpX402Client applies no caps by default and only warns about it, so every
// control here is set explicitly. These are the SDK-level guardrails; the
// policy engine adds the domain rules on top.
export function createPaymentClient(): CdpX402Client {
  return new CdpX402Client({
    walletConfig: { type: "eoa", accountName: "choppilot-agent" },
    networkSchemes: [{ network: "base-sepolia", scheme: { exact: true } }],
    spendControls: {
      maxAmountPerPayment: { atomic: spendAtomic.perPayment, asset: USDC_BASE_SEPOLIA },
      maxCumulativeSpend: { atomic: spendAtomic.cumulative, asset: USDC_BASE_SEPOLIA },
      maxCumulativeSpendWindow: config.spend.window,
      allowedNetworks: [NETWORK],
      allowedAssets: [USDC_BASE_SEPOLIA],
      allowedPayees: [config.merchantAddress],
      onApproachingLimit: (spent, limit) => {
        const pct = (Number(spent.atomic) / Number(limit.atomic)) * 100;
        console.warn(`[spend] ${pct.toFixed(0)}% of the ${config.spend.window} cap used`);
      },
    },
  });
}
