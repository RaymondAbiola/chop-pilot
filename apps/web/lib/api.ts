import type { Decision, Rules } from "@choppilot/shared";

const AGENT = process.env.NEXT_PUBLIC_AGENT_URL ?? "http://localhost:4100";
const MOCK = process.env.NEXT_PUBLIC_MOCK_URL ?? "http://localhost:4000";

export interface WalletInfo {
  address: string;
  merchant: string;
  network: string;
  usdc: number;
  eth: number;
  spendControls: { maxPerPaymentUsdc: number; maxCumulativeUsdc: number; window: string };
}

export interface AccountState {
  id: string;
  name: string;
  chop_balance: number;
  orders: { id: number; chops: number; created_at: string }[];
  recharges?: { pack: string; usdc: number; created_at: string }[];
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export const api = {
  health: () => json<{ ok: boolean; account: string }>(`${AGENT}/health`),
  wallet: () => json<WalletInfo>(`${AGENT}/wallet`),
  decisions: (limit = 50) => json<Decision[]>(`${AGENT}/decisions?limit=${limit}`),
  flags: () => json<Decision[]>(`${AGENT}/flags`),
  rules: () => json<Rules>(`${AGENT}/rules`),
  saveRules: (rules: Rules) => json<Rules>(`${AGENT}/rules`, { method: "PUT", body: JSON.stringify(rules) }),
  tick: () => json<{ decision: Decision }>(`${AGENT}/tick`, { method: "POST", body: "{}" }),
  approve: (id: string, pack: string) =>
    json<Decision>(`${AGENT}/decisions/${id}/approve`, {
      method: "POST",
      body: JSON.stringify({ pack }),
    }),
  reject: (id: string) => json<Decision>(`${AGENT}/decisions/${id}/reject`, { method: "POST" }),

  account: (id: string) => json<AccountState>(`${MOCK}/accounts/${id}`),
  consume: (chops: number) =>
    json<{ chop_balance: number }>(`${MOCK}/demo/consume`, {
      method: "POST",
      body: JSON.stringify({ chops }),
    }),
  reset: () => json<unknown>(`${MOCK}/demo/reset`, { method: "POST" }),
  resetAgent: () => json<unknown>(`${AGENT}/demo/reset`, { method: "POST" }),
};
