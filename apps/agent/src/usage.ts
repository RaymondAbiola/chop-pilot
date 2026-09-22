import type { AccountState } from "@choppilot/shared";

export interface UsageSummary {
  days: number;
  totalChops: number;
  dailyAverage: number;
  recentAverage: number;
  // How far recent consumption sits above the longer baseline. The policy
  // engine treats a high ratio as an anomaly regardless of what the model says.
  spikeRatio: number;
  byDay: { date: string; chops: number }[];
}

const RECENT_DAYS = 3;

export function summarizeUsage(orders: AccountState["orders"], windowDays = 14): UsageSummary {
  const now = Date.now();
  const buckets = new Map<string, number>();

  for (let i = windowDays - 1; i >= 0; i--) {
    const day = new Date(now - i * 86_400_000).toISOString().slice(0, 10);
    buckets.set(day, 0);
  }

  for (const order of orders) {
    const day = order.created_at.slice(0, 10);
    if (buckets.has(day)) {
      buckets.set(day, (buckets.get(day) ?? 0) + order.chops);
    }
  }

  const byDay = [...buckets.entries()].map(([date, chops]) => ({ date, chops }));
  const totalChops = byDay.reduce((sum, d) => sum + d.chops, 0);
  const dailyAverage = byDay.length > 0 ? totalChops / byDay.length : 0;

  const recent = byDay.slice(-RECENT_DAYS);
  const recentTotal = recent.reduce((sum, d) => sum + d.chops, 0);
  const recentAverage = recent.length > 0 ? recentTotal / recent.length : 0;

  return {
    days: byDay.length,
    totalChops,
    dailyAverage,
    recentAverage,
    spikeRatio: dailyAverage > 0 ? recentAverage / dailyAverage : 0,
    byDay,
  };
}

export function projectDaysLeft(balance: number, dailyAverage: number): number {
  if (dailyAverage <= 0) return 365;
  return Math.max(0, balance / dailyAverage);
}
