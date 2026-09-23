import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { type Decision, type Rules, rulesSchema } from "@choppilot/shared";

export type Store = InstanceType<typeof Database>;

interface DecisionRow {
  id: string;
  created_at: string;
  account_id: string;
  chop_balance: number;
  proposal: string;
  verdict: string;
  status: Decision["status"];
  tx_hash: string | null;
}

export function openStore(path: string, defaults: Rules): Store {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS decisions (
      id           TEXT PRIMARY KEY,
      created_at   TEXT NOT NULL,
      account_id   TEXT NOT NULL,
      chop_balance INTEGER NOT NULL,
      proposal     TEXT NOT NULL,
      verdict      TEXT NOT NULL,
      status       TEXT NOT NULL,
      tx_hash      TEXT
    );

    CREATE TABLE IF NOT EXISTS rules (
      id    INTEGER PRIMARY KEY CHECK (id = 1),
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_decisions_time ON decisions(created_at DESC);
  `);

  const existing = db.prepare("SELECT value FROM rules WHERE id = 1").get();
  if (!existing) {
    db.prepare("INSERT INTO rules (id, value) VALUES (1, ?)").run(JSON.stringify(defaults));
  }

  return db;
}

export function getRules(db: Store): Rules {
  const row = db.prepare("SELECT value FROM rules WHERE id = 1").get() as
    | { value: string }
    | undefined;
  if (!row) throw new Error("rules row missing");
  return rulesSchema.parse(JSON.parse(row.value));
}

export function setRules(db: Store, rules: Rules): Rules {
  const parsed = rulesSchema.parse(rules);
  db.prepare("UPDATE rules SET value = ? WHERE id = 1").run(JSON.stringify(parsed));
  return parsed;
}

export function recordDecision(db: Store, decision: Omit<Decision, "id">): Decision {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO decisions (id, created_at, account_id, chop_balance, proposal, verdict, status, tx_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    decision.created_at,
    decision.account.id,
    decision.account.chop_balance,
    JSON.stringify(decision.proposal),
    JSON.stringify(decision.verdict),
    decision.status,
    decision.tx_hash,
  );
  return { ...decision, id };
}

export function updateDecision(
  db: Store,
  id: string,
  status: Decision["status"],
  txHash: string | null,
): void {
  db.prepare("UPDATE decisions SET status = ?, tx_hash = ? WHERE id = ?").run(status, txHash, id);
}

function hydrate(row: DecisionRow): Decision {
  return {
    id: row.id,
    created_at: row.created_at,
    account: { id: row.account_id, chop_balance: row.chop_balance },
    proposal: JSON.parse(row.proposal),
    verdict: JSON.parse(row.verdict),
    status: row.status,
    tx_hash: row.tx_hash,
  };
}

export function listDecisions(db: Store, limit = 50): Decision[] {
  const rows = db
    .prepare("SELECT * FROM decisions ORDER BY created_at DESC LIMIT ?")
    .all(limit) as DecisionRow[];
  return rows.map(hydrate);
}

export function getDecision(db: Store, id: string): Decision | undefined {
  const row = db.prepare("SELECT * FROM decisions WHERE id = ?").get(id) as DecisionRow | undefined;
  return row ? hydrate(row) : undefined;
}

// Demo control. Clears the decision log but leaves the payer's rules alone,
// since those are configuration rather than history.
export function clearDecisions(db: Store): void {
  db.prepare("DELETE FROM decisions").run();
}

export function listFlagged(db: Store): Decision[] {
  const rows = db
    .prepare("SELECT * FROM decisions WHERE status = 'flagged' ORDER BY created_at DESC")
    .all() as DecisionRow[];
  return rows.map(hydrate);
}
