import { CdpClient } from "@coinbase/cdp-sdk";
import { USDC_BASE_SEPOLIA, USDC_DECIMALS } from "@choppilot/shared";
import { config, spendAtomic } from "../config.js";
import { createPaymentClient } from "../wallet.js";

const WANT_FAUCET = process.argv.includes("--faucet");

async function main(): Promise<void> {
  const client = createPaymentClient();

  // Provisions the wallet eagerly instead of waiting for a first payment.
  const { evmAddress } = await client.getAddresses();

  console.log("");
  console.log("  agent wallet : " + evmAddress);
  console.log("  merchant     : " + config.merchantAddress);
  console.log("  network      : base-sepolia");
  console.log("");
  console.log("  spend controls");
  console.log(`    per payment : $${config.spend.maxPerPaymentUsdc} (${spendAtomic.perPayment} atomic)`);
  console.log(`    cumulative  : $${config.spend.maxCumulativeUsdc} per ${config.spend.window}`);
  console.log(`    payee       : ${config.merchantAddress}`);
  console.log(`    asset       : ${USDC_BASE_SEPOLIA}`);
  console.log("");

  await printBalances(evmAddress);

  if (evmAddress.toLowerCase() === config.merchantAddress.toLowerCase()) {
    console.error("  MERCHANT_ADDRESS is the agent wallet. The agent would pay itself.");
    process.exitCode = 1;
    return;
  }

  if (!WANT_FAUCET) {
    console.log("  run with --faucet to request testnet ETH for gas");
    console.log("  USDC: https://faucet.circle.com (select Base Sepolia)");
    console.log("");
    return;
  }

  const cdp = new CdpClient();
  console.log("  requesting testnet ETH...");
  const resp = await cdp.evm.requestFaucet({
    address: evmAddress as `0x${string}`,
    network: "base-sepolia",
    token: "eth",
  });
  console.log("  faucet tx: " + JSON.stringify(resp));
  console.log("");
  console.log("  USDC still needs the Circle faucet: https://faucet.circle.com");
  console.log("");
}

// The agent needs USDC, not just gas. A wallet with ETH and no USDC produces a
// payment failure that reads like a protocol bug, so surface both up front.
async function printBalances(address: string): Promise<void> {
  const cdp = new CdpClient();
  const { balances } = await cdp.evm.listTokenBalances({
    address: address as `0x${string}`,
    network: "base-sepolia",
  });

  const usdc = balances.find(
    (b) => b.token.contractAddress.toLowerCase() === USDC_BASE_SEPOLIA.toLowerCase(),
  );
  const eth = balances.find((b) => (b.token.symbol ?? "").toUpperCase() === "ETH");

  const fmt = (raw: bigint | undefined, decimals: number): string =>
    raw === undefined ? "0" : (Number(raw) / 10 ** decimals).toFixed(4);

  console.log("  balances");
  console.log(`    ETH  : ${fmt(eth?.amount.amount, eth?.amount.decimals ?? 18)}`);
  console.log(`    USDC : ${fmt(usdc?.amount.amount, usdc?.amount.decimals ?? USDC_DECIMALS)}`);

  if (!usdc || usdc.amount.amount === 0n) {
    console.log("");
    console.log("    no USDC yet. https://faucet.circle.com, select Base Sepolia,");
    console.log(`    and send to ${address}`);
  }
  console.log("");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
