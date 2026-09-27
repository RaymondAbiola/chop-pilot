import express from "express";
import cors from "cors";
import { paymentMiddleware } from "@x402/express";
import { PACK_NAMES, PACKS, type PackName } from "@choppilot/shared";
import {
  creditChops,
  getAccount,
  truncateAll,
  listAccounts,
  listRecharges,
  openDb,
  ordersSince,
  placeOrder,
  recordRecharge,
} from "./db.js";
import { seed } from "./seed.js";
import { buildResourceServer, buildRoutes, FACILITATOR } from "./x402.js";

// Node loads .env natively; no dotenv dependency needed.
try {
  process.loadEnvFile(new URL("../../../.env", import.meta.url).pathname);
} catch {
  // No .env yet. Defaults below cover local development.
}

// Hosts such as Render inject PORT and expect the service to bind it.
const PORT = Number(process.env.PORT ?? process.env.MOCK_PORT ?? 4000);
const HISTORY_DAYS = 14;

const db = openDb(process.env.DB_PATH ?? "chopeazy.sqlite");
seed(db);

const MERCHANT = process.env.MERCHANT_ADDRESS;
if (!MERCHANT) {
  throw new Error("MERCHANT_ADDRESS is required; it is the address that receives recharge payments");
}

const FACILITATOR_OVERRIDE = process.env.FACILITATOR_URL ?? FACILITATOR;

const app = express();
app.use(cors());
app.use(express.json());
app.use(paymentMiddleware(buildRoutes(MERCHANT), buildResourceServer(FACILITATOR_OVERRIDE)));

app.get("/health", (_req, res) => {
  res.json({ ok: true, packs: PACKS });
});

app.get("/accounts", (_req, res) => {
  res.json(listAccounts(db));
});

// The agent's read model: current balance plus enough history to spot a trend.
app.get("/accounts/:id", (req, res) => {
  const account = getAccount(db, req.params.id);
  if (!account) {
    res.status(404).json({ error: "account not found" });
    return;
  }

  const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000);
  res.json({
    ...account,
    orders: ordersSince(db, account.id, since),
    recharges: listRecharges(db, account.id),
  });
});

// Demo control. Resets to the seeded 14 day history and starting balance
// without restarting the server.
app.post("/demo/reset", (_req, res) => {
  truncateAll(db);
  seed(db);
  res.json(listAccounts(db));
});

// Adds consumption dated today. `spike` multiplies the normal daily rate so the
// demo can produce an anomaly on demand.
app.post("/demo/consume", (req, res) => {
  const accountId = typeof req.body?.account_id === "string" ? req.body.account_id : "amaka";
  const chops = Number.isInteger(req.body?.chops) ? (req.body.chops as number) : 3;

  const account = getAccount(db, accountId);
  if (!account) {
    res.status(404).json({ error: "account not found" });
    return;
  }

  placeOrder(db, accountId, chops);
  const updated = getAccount(db, accountId);
  res.json({ chops, chop_balance: updated?.chop_balance ?? 0 });
});

app.post("/orders", (req, res) => {
  const { account_id: accountId, chops } = req.body ?? {};

  if (typeof accountId !== "string" || !Number.isInteger(chops) || chops <= 0) {
    res.status(400).json({ error: "account_id (string) and chops (positive integer) are required" });
    return;
  }

  const account = getAccount(db, accountId);
  if (!account) {
    res.status(404).json({ error: "account not found" });
    return;
  }

  const order = placeOrder(db, accountId, chops);
  const updated = getAccount(db, accountId);
  res.status(201).json({ order, chop_balance: updated?.chop_balance ?? 0 });
});

// Paywalled. The middleware has already verified payment by the time this runs;
// settlement happens after the response, and the tx hash reaches the payer in
// the X-PAYMENT-RESPONSE header.
for (const pack of PACK_NAMES) {
  app.post(`/recharge/${pack}`, (req, res) => {
    const accountId = typeof req.body?.account_id === "string" ? req.body.account_id : undefined;
    if (!accountId) {
      res.status(400).json({ error: "account_id is required" });
      return;
    }

    const account = getAccount(db, accountId);
    if (!account) {
      res.status(404).json({ error: "account not found" });
      return;
    }

    const { chops, usdc } = PACKS[pack as PackName];
    creditChops(db, accountId, chops);
    const recharge = recordRecharge(db, accountId, pack, usdc, null);
    const updated = getAccount(db, accountId);

    res.json({
      recharge,
      chops_credited: chops,
      chop_balance: updated?.chop_balance ?? 0,
    });
  });
}

app.listen(PORT, () => {
  console.log(`chopeazy-mock listening on http://localhost:${PORT}`);
  console.log(`  paywalled packs: ${PACK_NAMES.join(", ")}`);
  console.log(`  merchant: ${MERCHANT}`);
  console.log(`  facilitator: ${FACILITATOR_OVERRIDE}`);
});
