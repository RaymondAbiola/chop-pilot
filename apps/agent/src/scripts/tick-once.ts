import { config, defaultRules } from "../config.js";
import { runTick } from "../loop.js";
import { openStore } from "../store.js";
import { createPaymentClient } from "../wallet.js";

const ACCOUNT = process.argv[2] ?? "amaka";

async function main(): Promise<void> {
  const db = openStore(process.env.AGENT_DB_PATH ?? "agent.sqlite", defaultRules);
  const { decision, model, tokens } = await runTick(db, createPaymentClient(), ACCOUNT);

  console.log("");
  console.log(`  balance   : ${decision.account.chop_balance} chops`);
  console.log(`  action    : ${decision.proposal.action}  pack: ${decision.proposal.pack ?? "-"}`);
  console.log(`  reasoning : ${decision.proposal.reasoning}`);
  console.log("");
  console.log(`  approved  : ${decision.verdict.approved}`);
  if (decision.verdict.blockedBy.length > 0) {
    console.log(`  blocked by: ${decision.verdict.blockedBy.join(", ")}`);
  }
  console.log(`  status    : ${decision.status}`);
  if (decision.tx_hash) {
    console.log(`  tx        : https://sepolia.basescan.org/tx/${decision.tx_hash}`);
  }
  console.log("");
  console.log(`  ${model}: ${tokens.input} in, ${tokens.output} out  (mock: ${config.mockUrl})`);
  console.log("");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
