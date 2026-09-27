import { CHOP_PRICE_USDC } from "@choppilot/shared";
import { openDb, type DB } from "./db.js";

const DEMO_ACCOUNT = { id: "amaka", name: "Amaka", startingChops: 12 };

// Two or three meals a day with mild variance. This is the baseline the agent
// reasons against, so a spike in the demo has something to look abnormal next to.
const DAILY_PATTERN = [3, 2, 3, 2, 2, 3, 3, 2, 3, 2, 2, 3, 2, 3];

// Before ChopPilot existed the payer topped the account up by hand. Without
// this record the seeded balance and the seeded eating history do not add up,
// and the account looks like it was funded from nowhere.
const MANUAL_TOP_UP_DAYS_AGO = 14;

export function seed(db: DB): void {
  const existing = db.prepare("SELECT COUNT(*) AS n FROM accounts").get() as { n: number };
  if (existing.n > 0) return;

  db.prepare("INSERT INTO accounts (id, name, chop_balance) VALUES (?, ?, ?)").run(
    DEMO_ACCOUNT.id,
    DEMO_ACCOUNT.name,
    DEMO_ACCOUNT.startingChops,
  );

  const insert = db.prepare("INSERT INTO orders (account_id, chops, created_at) VALUES (?, ?, ?)");
  const now = Date.now();

  const eaten = DAILY_PATTERN.reduce((sum, meals) => sum + meals, 0);
  const loaded = eaten + DEMO_ACCOUNT.startingChops;
  db.prepare(
    "INSERT INTO recharges (account_id, pack, usdc, tx_hash, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(
    DEMO_ACCOUNT.id,
    "manual",
    Number((loaded * CHOP_PRICE_USDC).toFixed(2)),
    null,
    new Date(now - MANUAL_TOP_UP_DAYS_AGO * 86_400_000).toISOString(),
  );

  // Anchor to UTC midnight. Offsetting from "now" pushed meals across the date
  // boundary depending on the hour, which put yesterday's meals on today and
  // made the demo look like a spike.
  const midnightToday = Date.UTC(
    new Date(now).getUTCFullYear(),
    new Date(now).getUTCMonth(),
    new Date(now).getUTCDate(),
  );

  DAILY_PATTERN.forEach((meals, i) => {
    const daysAgo = DAILY_PATTERN.length - i;
    const dayStart = midnightToday - daysAgo * 86_400_000;
    for (let meal = 0; meal < meals; meal++) {
      // Spread meals across that day, staying inside it.
      const at = new Date(dayStart + (8 + meal * 4) * 3_600_000);
      insert.run(DEMO_ACCOUNT.id, 1, at.toISOString());
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const db = openDb(process.env.DB_PATH ?? "chopeazy.sqlite");
  seed(db);
  const account = db.prepare("SELECT * FROM accounts").all();
  const orders = db.prepare("SELECT COUNT(*) AS n FROM orders").get() as { n: number };
  console.log("seeded:", account, `${orders.n} orders`);
}
