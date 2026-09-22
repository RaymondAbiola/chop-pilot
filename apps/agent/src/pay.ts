import { wrapFetchWithPayment } from "@x402/fetch";
import type { CdpX402Client } from "@coinbase/cdp-sdk/x402";
import { type PackName, PACKS } from "@choppilot/shared";
import { config } from "./config.js";

export interface PaymentResult {
  ok: boolean;
  status: number;
  txHash: string | null;
  body: unknown;
}

// Settlement details come back base64-encoded. v2 uses PAYMENT-RESPONSE;
// X-PAYMENT-RESPONSE is the v1 spelling, still emitted by some facilitators.
function readSettlement(res: Response): { txHash: string | null; raw: unknown } {
  const header = res.headers.get("PAYMENT-RESPONSE") ?? res.headers.get("X-PAYMENT-RESPONSE");
  if (!header) return { txHash: null, raw: null };

  try {
    const decoded = JSON.parse(Buffer.from(header, "base64").toString("utf8")) as Record<
      string,
      unknown
    >;
    const hash =
      (decoded["transaction"] as string | undefined) ??
      (decoded["txHash"] as string | undefined) ??
      (decoded["transactionHash"] as string | undefined) ??
      null;
    return { txHash: hash, raw: decoded };
  } catch {
    return { txHash: null, raw: header };
  }
}

// @x402/core ships separate .d.ts and .d.mts declarations of x402Client, each
// with its own private field, so the CdpX402Client that cdp-sdk (CJS types)
// extends is nominally distinct from the one @x402/fetch (ESM types) expects.
// Identical class at runtime; the cast is the seam between the two declarations.
type PayableClient = Parameters<typeof wrapFetchWithPayment>[1];

export async function payForPack(
  client: CdpX402Client,
  pack: PackName,
  accountId: string,
): Promise<PaymentResult> {
  const fetchWithPayment = wrapFetchWithPayment(fetch, client as unknown as PayableClient);

  const res = await fetchWithPayment(`${config.mockUrl}/recharge/${pack}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ account_id: accountId }),
  });

  const { txHash } = readSettlement(res);
  const body = await res.json().catch(() => null);

  return { ok: res.ok, status: res.status, txHash, body };
}

export function packPrice(pack: PackName): number {
  return PACKS[pack].usdc;
}
