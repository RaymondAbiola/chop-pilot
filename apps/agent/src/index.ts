import { config } from "./config.js";
import { createServer } from "./server.js";
import { runTick } from "./loop.js";

const { app, db, client } = createServer();

// Off by default. A timer that fires mid-presentation, or burns SERV credit
// while nobody is watching, is worse than a button.
const INTERVAL_SECONDS = Number(process.env.TICK_INTERVAL_SECONDS ?? 0);
const ACCOUNT = process.env.DEMO_ACCOUNT ?? "amaka";

app.listen(config.agentPort, () => {
  console.log(`choppilot agent listening on http://localhost:${config.agentPort}`);
  console.log(`  mock     : ${config.mockUrl}`);
  console.log(`  merchant : ${config.merchantAddress}`);
  console.log(
    INTERVAL_SECONDS > 0
      ? `  ticking  : every ${INTERVAL_SECONDS}s`
      : "  ticking  : on demand (POST /tick)",
  );
});

if (INTERVAL_SECONDS > 0) {
  setInterval(() => {
    runTick(db, client, ACCOUNT).catch((err: unknown) => {
      console.error("[tick]", err instanceof Error ? err.message : err);
    });
  }, INTERVAL_SECONDS * 1000);
}
