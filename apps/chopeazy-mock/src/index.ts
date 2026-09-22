import express from "express";
import cors from "cors";
import { PACKS } from "@choppilot/shared";
import { getAccount, listAccounts, listRecharges, openDb, ordersSince, placeOrder } from "./db.js";
import { seed } from "./seed.js";

// Node loads .env natively; no dotenv dependency needed.
try {
  process.loadEnvFile(new URL("../../../.env", import.meta.url).pathname);
} catch {
  // No .env yet. Defaults below cover local development.
}

const PORT = Number(process.env.MOCK_PORT ?? 4000);
const HISTORY_DAYS = 14;

const db = openDb(process.env.DB_PATH ?? "chopeazy.sqlite");
seed(db);

const app = express();
app.use(cors());
app.use(express.json());

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

app.listen(PORT, () => {
  console.log(`chopeazy-mock listening on http://localhost:${PORT}`);
});
