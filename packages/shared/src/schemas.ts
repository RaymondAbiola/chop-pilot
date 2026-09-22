import { z } from "zod";
import { PACK_NAMES } from "./constants.js";

const packName = z.enum(PACK_NAMES as [string, ...string[]]);

// What SERV is allowed to return. Kept small and enum-heavy so the model has
// few ways to be creative, per OpenServ's structured-output guidance.
export const proposalSchema = z.object({
  action: z.enum(["recharge", "wait", "flag"]),
  pack: packName.nullable(),
  reasoning: z.string().min(1).max(400),
  projected_days_left: z.number().min(0).max(365),
  anomaly: z.boolean(),
});

export type Proposal = z.infer<typeof proposalSchema>;

export const rulesSchema = z.object({
  weeklyCapUsdc: z.number().positive(),
  maxPerRechargeUsdc: z.number().positive(),
  minBalanceTrigger: z.number().min(0),
  cooldownMinutes: z.number().min(0),
  recipientAllowlist: z.array(z.string().regex(/^0x[a-fA-F0-9]{40}$/)).min(1),
});

export type Rules = z.infer<typeof rulesSchema>;

export const policyVerdictSchema = z.object({
  approved: z.boolean(),
  // Empty when approved. Every failed rule is listed, not just the first.
  blockedBy: z.array(z.string()),
});

export type PolicyVerdict = z.infer<typeof policyVerdictSchema>;

export const orderSchema = z.object({
  id: z.number(),
  account_id: z.string(),
  chops: z.number(),
  created_at: z.string(),
});

export const accountStateSchema = z.object({
  id: z.string(),
  name: z.string(),
  chop_balance: z.number(),
  orders: z.array(orderSchema),
});

export type AccountState = z.infer<typeof accountStateSchema>;

export const decisionSchema = z.object({
  id: z.string(),
  created_at: z.string(),
  account: accountStateSchema.pick({ id: true, chop_balance: true }),
  proposal: proposalSchema,
  verdict: policyVerdictSchema,
  status: z.enum(["paid", "blocked", "flagged", "waited", "approved_by_payer", "rejected_by_payer"]),
  tx_hash: z.string().nullable(),
});

export type Decision = z.infer<typeof decisionSchema>;
