import Database from "better-sqlite3";

export type DB = InstanceType<typeof Database>;

export interface AccountRow {
  id: string;
  name: string;
  chop_balance: number;
}

export interface OrderRow {
  id: number;
  account_id: string;
  chops: number;
  created_at: string;
}

export interface RechargeRow {
  id: number;
  account_id: string;
  pack: string;
  usdc: number;
  tx_hash: string | null;
  created_at: string;
}

export function openDb(path: string): DB {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(db: DB): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      chop_balance INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS orders (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT NOT NULL REFERENCES accounts(id),
      chops      INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recharges (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT NOT NULL REFERENCES accounts(id),
      pack       TEXT NOT NULL,
      usdc       REAL NOT NULL,
      tx_hash    TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_orders_account_time
      ON orders(account_id, created_at);
  `);
}

export function getAccount(db: DB, id: string): AccountRow | undefined {
  return db.prepare("SELECT * FROM accounts WHERE id = ?").get(id) as AccountRow | undefined;
}

export function listAccounts(db: DB): AccountRow[] {
  return db.prepare("SELECT * FROM accounts ORDER BY name").all() as AccountRow[];
}

export function ordersSince(db: DB, accountId: string, since: Date): OrderRow[] {
  return db
    .prepare("SELECT * FROM orders WHERE account_id = ? AND created_at >= ? ORDER BY created_at")
    .all(accountId, since.toISOString()) as OrderRow[];
}

// Deducting is allowed to drive the balance negative; the agent's job is to
// notice before that happens, and the demo needs to be able to show it failing.
export function placeOrder(db: DB, accountId: string, chops: number): OrderRow {
  const tx = db.transaction((id: string, n: number) => {
    db.prepare("UPDATE accounts SET chop_balance = chop_balance - ? WHERE id = ?").run(n, id);
    const info = db
      .prepare("INSERT INTO orders (account_id, chops, created_at) VALUES (?, ?, ?)")
      .run(id, n, new Date().toISOString());
    return db.prepare("SELECT * FROM orders WHERE id = ?").get(info.lastInsertRowid) as OrderRow;
  });
  return tx(accountId, chops);
}

export function creditChops(db: DB, accountId: string, chops: number): void {
  db.prepare("UPDATE accounts SET chop_balance = chop_balance + ? WHERE id = ?").run(chops, accountId);
}

export function recordRecharge(
  db: DB,
  accountId: string,
  pack: string,
  usdc: number,
  txHash: string | null,
): RechargeRow {
  const info = db
    .prepare("INSERT INTO recharges (account_id, pack, usdc, tx_hash, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(accountId, pack, usdc, txHash, new Date().toISOString());
  return db.prepare("SELECT * FROM recharges WHERE id = ?").get(info.lastInsertRowid) as RechargeRow;
}

export function listRecharges(db: DB, accountId: string): RechargeRow[] {
  return db
    .prepare("SELECT * FROM recharges WHERE account_id = ? ORDER BY created_at DESC")
    .all(accountId) as RechargeRow[];
}
