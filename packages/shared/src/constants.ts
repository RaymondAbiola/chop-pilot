// Base Sepolia in CAIP-2 form. x402 v2 uses chain identifiers, not chain names.
export const NETWORK = "eip155:84532" as const;

export const FACILITATOR_URL = "https://x402.org/facilitator";

export const CHOP_PRICE_USDC = 0.01;

// x402 prices a route, not a request, so recharges are fixed packs.
export const PACKS = {
  small: { chops: 10, usdc: 0.1 },
  medium: { chops: 25, usdc: 0.25 },
  large: { chops: 50, usdc: 0.5 },
} as const;

export type PackName = keyof typeof PACKS;

export const PACK_NAMES = Object.keys(PACKS) as PackName[];

// Circle's USDC on Base Sepolia. This is the asset the x402 exact scheme moves.
export const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

export const USDC_DECIMALS = 6;

export function usdcToAtomic(usdc: number): bigint {
  return BigInt(Math.round(usdc * 10 ** USDC_DECIMALS));
}
