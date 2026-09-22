import { CdpX402Client, SpendControlError } from "@coinbase/cdp-sdk/x402";
import { NETWORK, PACKS, USDC_BASE_SEPOLIA, usdcToAtomic, type PackName } from "@choppilot/shared";
import { config } from "../config.js";
import { payForPack, packPrice } from "../pay.js";
import { createPaymentClient } from "../wallet.js";

const PACK = (process.argv[2] ?? "medium") as PackName;
const ACCOUNT = process.argv[3] ?? "amaka";

async function chopBalance(): Promise<number | null> {
  try {
    const res = await fetch(`${config.mockUrl}/accounts/${ACCOUNT}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { chop_balance: number };
    return data.chop_balance;
  } catch {
    return null;
  }
}

// A client whose per-payment cap sits below the pack price. The payment must be
// refused before any signature is produced.
function overcappedClient(): CdpX402Client {
  return new CdpX402Client({
    walletConfig: { type: "eoa", accountName: "choppilot-agent" },
    networkSchemes: [{ network: "base-sepolia", scheme: { exact: true } }],
    spendControls: {
      maxAmountPerPayment: { atomic: usdcToAtomic(0.01), asset: USDC_BASE_SEPOLIA },
      allowedNetworks: [NETWORK],
      allowedAssets: [USDC_BASE_SEPOLIA],
      allowedPayees: [config.merchantAddress],
    },
  });
}

async function main(): Promise<void> {
  const before = await chopBalance();
  if (before === null) {
    console.error(`Cannot reach the mock at ${config.mockUrl}. Start it with: pnpm dev:mock`);
    process.exit(1);
  }

  console.log("");
  console.log(`  account      : ${ACCOUNT}`);
  console.log(`  pack         : ${PACK} ($${packPrice(PACK)}, ${PACKS[PACK].chops} chops)`);
  console.log(`  chops before : ${before}`);
  console.log("");

  console.log("  paying...");
  const result = await payForPack(createPaymentClient(), PACK, ACCOUNT);

  if (!result.ok) {
    console.error(`  FAILED: status ${result.status}`);
    console.error("  " + JSON.stringify(result.body));
    process.exit(1);
  }

  const after = await chopBalance();
  console.log(`  status       : ${result.status}`);
  console.log(`  chops after  : ${after} (+${(after ?? 0) - before})`);

  if (result.txHash) {
    console.log(`  tx           : ${result.txHash}`);
    console.log(`  explorer     : https://sepolia.basescan.org/tx/${result.txHash}`);
  } else {
    console.log("  tx           : not reported in the settlement header");
  }
  console.log("");

  await checkGuardrail();
}

// The client wraps a blocked payment in a generic Error, so the SpendControlError
// arrives as a cause rather than the thrown value. Walk the chain before giving up.
function findSpendControlError(err: unknown): SpendControlError | null {
  let current: unknown = err;
  for (let depth = 0; depth < 5; depth++) {
    if (current instanceof SpendControlError) return current;
    if (current instanceof Error && current.cause !== undefined) {
      current = current.cause;
      continue;
    }
    return null;
  }
  return null;
}

// The demo claims the code refuses what the LLM proposes. Prove the SDK layer
// actually refuses, rather than trusting the configuration.
async function checkGuardrail(): Promise<void> {
  console.log("  guardrail check: paying $" + packPrice(PACK) + " against a $0.01 cap");
  try {
    const result = await payForPack(overcappedClient(), PACK, ACCOUNT);
    console.error(`  NOT BLOCKED. status ${result.status}. Spend controls are not working.`);
    process.exitCode = 1;
  } catch (err) {
    const spendError = findSpendControlError(err);
    const message = err instanceof Error ? err.message : String(err);

    if (spendError) {
      console.log(`  blocked as expected: ${spendError.code}`);
    } else if (/per-payment cap|cumulative cap|not allowed/i.test(message)) {
      // Blocked for the right reason, but the cause chain did not carry the
      // typed error. Good enough to pass; worth knowing it is message-matched.
      console.log("  blocked as expected (matched on message, not typed error)");
      console.log(`    ${message}`);
    } else {
      console.error(`  blocked for an unexpected reason: ${message}`);
      process.exitCode = 1;
    }
  }
  console.log("");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
