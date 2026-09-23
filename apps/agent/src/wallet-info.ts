import { CdpClient } from "@coinbase/cdp-sdk";
import { USDC_BASE_SEPOLIA, USDC_DECIMALS } from "@choppilot/shared";
import { config, spendAtomic } from "./config.js";
import { createPaymentClient } from "./wallet.js";

export interface WalletInfo {
  address: string;
  merchant: string;
  network: string;
  usdc: number;
  eth: number;
  spendControls: {
    maxPerPaymentUsdc: number;
    maxCumulativeUsdc: number;
    window: string;
  };
}

let cached: { at: number; value: WalletInfo } | undefined;
const CACHE_MS = 10_000;

// Balances come from CDP on every call, so the dashboard polling this would
// otherwise hammer the API. Ten seconds is fresh enough for a demo.
export async function getWalletInfo(): Promise<WalletInfo> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;

  const { evmAddress } = await createPaymentClient().getAddresses();
  const cdp = new CdpClient();
  const { balances } = await cdp.evm.listTokenBalances({
    address: evmAddress as `0x${string}`,
    network: "base-sepolia",
  });

  const find = (predicate: (symbol: string, contract: string) => boolean) =>
    balances.find((b) =>
      predicate((b.token.symbol ?? "").toUpperCase(), b.token.contractAddress.toLowerCase()),
    );

  const usdcBal = find((_s, c) => c === USDC_BASE_SEPOLIA.toLowerCase());
  const ethBal = find((s) => s === "ETH");

  const value: WalletInfo = {
    address: evmAddress,
    merchant: config.merchantAddress,
    network: "base-sepolia",
    usdc: usdcBal ? Number(usdcBal.amount.amount) / 10 ** (usdcBal.amount.decimals ?? USDC_DECIMALS) : 0,
    eth: ethBal ? Number(ethBal.amount.amount) / 10 ** (ethBal.amount.decimals ?? 18) : 0,
    spendControls: {
      maxPerPaymentUsdc: config.spend.maxPerPaymentUsdc,
      maxCumulativeUsdc: config.spend.maxCumulativeUsdc,
      window: config.spend.window,
    },
  };

  cached = { at: Date.now(), value };
  return value;
}

export const spendCeilings = spendAtomic;
