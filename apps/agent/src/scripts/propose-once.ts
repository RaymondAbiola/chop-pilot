import { accountStateSchema, proposalSchema } from "@choppilot/shared";
import { config, defaultRules } from "../config.js";
import { toStrictJsonSchema } from "../schema-json.js";
import { proposeDecision } from "../serv.js";

const ACCOUNT = process.argv[2] ?? "amaka";
const SHOW_SCHEMA = process.argv.includes("--schema");

async function main(): Promise<void> {
  if (SHOW_SCHEMA) {
    console.log(JSON.stringify(toStrictJsonSchema(proposalSchema, "chop_proposal"), null, 2));
    return;
  }

  const res = await fetch(`${config.mockUrl}/accounts/${ACCOUNT}`);
  if (!res.ok) {
    console.error(`Cannot reach the mock at ${config.mockUrl}. Start it with: pnpm dev:mock`);
    process.exit(1);
  }

  const account = accountStateSchema.parse(await res.json());
  const { proposal, usage, model, tokens } = await proposeDecision(account, defaultRules);

  console.log("");
  console.log(`  account   : ${account.name} (${account.chop_balance} chops)`);
  console.log(`  usage     : ${usage.dailyAverage.toFixed(2)}/day avg, ${usage.recentAverage.toFixed(2)}/day recent`);
  console.log(`  spike     : ${usage.spikeRatio.toFixed(2)}x baseline`);
  console.log("");
  console.log(`  action    : ${proposal.action}`);
  console.log(`  pack      : ${proposal.pack ?? "-"}`);
  console.log(`  days left : ${proposal.projected_days_left}`);
  console.log(`  anomaly   : ${proposal.anomaly}`);
  console.log(`  reasoning : ${proposal.reasoning}`);
  console.log("");

  // SERV bills several components per request, so the catalog rate is a floor.
  console.log(`  model     : ${model}`);
  console.log(`  tokens    : ${tokens.input} in, ${tokens.output} out`);
  console.log("");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
