import OpenAI from "openai";
import {
  type AccountState,
  type Proposal,
  type Rules,
  PACKS,
  proposalSchema,
} from "@choppilot/shared";
import { requireEnv } from "@choppilot/shared/env";
import { toStrictJsonSchema } from "./schema-json.js";
import { projectDaysLeft, summarizeUsage, type UsageSummary } from "./usage.js";

const SERV_BASE_URL = "https://inference-api.openserv.ai/v1";

let client: OpenAI | undefined;

function serv(): OpenAI {
  client ??= new OpenAI({
    apiKey: requireEnv("SERV_API_KEY"),
    baseURL: SERV_BASE_URL,
    maxRetries: 2,
    timeout: 30_000,
  });
  return client;
}

// SERV rejects any request without a system prompt.
const SYSTEM_PROMPT = `You are ChopPilot's treasurer. A payer abroad funds meals for a family member on a prepaid balance measured in "chops", where one chop is roughly one meal.

Decide whether to recharge the balance now, and with which pack.

Return "recharge" only when the balance is at or below the payer's trigger and consumption looks normal.
Return "wait" when the balance is comfortable.
Return "flag" when consumption looks abnormal, so a human should approve before money moves. Abnormal means a sharp, unexplained rise against the recent baseline.

Choose the smallest pack that covers roughly the next week of normal consumption. Do not stockpile.

Your reasoning is shown directly to the payer. Write one or two plain sentences, no jargon, no numbers they cannot see on their own screen.

A separate policy engine enforces the payer's hard spending limits. You are not the last line of defence, so do not attempt to reason about caps you were not given.`;

function buildUserPrompt(account: AccountState, usage: UsageSummary, rules: Rules): string {
  const packList = Object.entries(PACKS)
    .map(([name, p]) => `  ${name}: ${p.chops} chops for $${p.usdc}`)
    .join("\n");

  const recent = usage.byDay
    .slice(-7)
    .map((d) => `  ${d.date}: ${d.chops}`)
    .join("\n");

  return `Account: ${account.name}
Current balance: ${account.chop_balance} chops

Consumption over the last ${usage.days} days:
  total: ${usage.totalChops} chops
  daily average: ${usage.dailyAverage.toFixed(2)}
  last 3 days average: ${usage.recentAverage.toFixed(2)}

Chops per day, most recent 7:
${recent}

At the current daily average the balance lasts about ${projectDaysLeft(account.chop_balance, usage.dailyAverage).toFixed(1)} more days.

The payer recharges when the balance drops to ${rules.minBalanceTrigger} chops or below.

Available packs:
${packList}

Recharges in the last 7 days: ${account.recharges?.length ?? 0}`;
}

export interface ProposalResult {
  proposal: Proposal;
  usage: UsageSummary;
  model: string;
  tokens: { input: number; output: number };
}

export async function proposeDecision(
  account: AccountState,
  rules: Rules,
): Promise<ProposalResult> {
  const usage = summarizeUsage(account.orders);
  const model = process.env.SERV_MODEL ?? "gpt-5.6-luna";

  const completion = await serv().chat.completions.create({
    model,
    reasoning_effort: "low",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(account, usage, rules) },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "chop_proposal",
        strict: true,
        schema: toStrictJsonSchema(proposalSchema, "chop_proposal"),
      },
    },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("SERV returned no content");
  }

  // Validate at the boundary. A malformed proposal is a failure, never prose
  // quietly treated as a decision.
  const proposal = proposalSchema.parse(JSON.parse(raw));

  return {
    proposal,
    usage,
    model,
    tokens: {
      input: completion.usage?.prompt_tokens ?? 0,
      output: completion.usage?.completion_tokens ?? 0,
    },
  };
}
