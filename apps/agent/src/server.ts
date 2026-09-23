import cors from "cors";
import express, { type Express } from "express";
import { PACK_NAMES, rulesSchema, type PackName } from "@choppilot/shared";
import type { CdpX402Client } from "@coinbase/cdp-sdk/x402";
import { config, defaultRules } from "./config.js";
import { approveFlagged, rejectFlagged, runTick } from "./loop.js";
import {
  getDecision,
  getRules,
  listDecisions,
  listFlagged,
  openStore,
  setRules,
  type Store,
} from "./store.js";
import { getWalletInfo } from "./wallet-info.js";
import { createPaymentClient } from "./wallet.js";

const DEFAULT_ACCOUNT = process.env.DEMO_ACCOUNT ?? "amaka";

export interface AgentServer {
  app: Express;
  db: Store;
  client: CdpX402Client;
}

export function createServer(): AgentServer {
  const db = openStore(process.env.AGENT_DB_PATH ?? "agent.sqlite", defaultRules);
  const client: CdpX402Client = createPaymentClient();

  // One tick at a time. Two dashboard clicks in quick succession must not
  // become two payments.
  let inFlight: Promise<unknown> | null = null;

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true, account: DEFAULT_ACCOUNT, mock: config.mockUrl });
  });

  app.get("/decisions", (req, res) => {
    const limit = Math.min(Number(req.query["limit"] ?? 50) || 50, 200);
    res.json(listDecisions(db, limit));
  });

  app.get("/decisions/:id", (req, res) => {
    const decision = getDecision(db, req.params.id);
    if (!decision) {
      res.status(404).json({ error: "decision not found" });
      return;
    }
    res.json(decision);
  });

  app.get("/flags", (_req, res) => {
    res.json(listFlagged(db));
  });

  app.get("/rules", (_req, res) => {
    res.json(getRules(db));
  });

  app.put("/rules", (req, res) => {
    const parsed = rulesSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid rules", issues: parsed.error.issues });
      return;
    }
    res.json(setRules(db, parsed.data));
  });

  app.get("/wallet", (_req, res) => {
    getWalletInfo()
      .then((info) => res.json(info))
      .catch((err: unknown) => {
        res.status(502).json({ error: err instanceof Error ? err.message : String(err) });
      });
  });

  // Approving costs money, so it takes the same single-flight lock as a tick.
  app.post("/decisions/:id/approve", (req, res) => {
    if (inFlight) {
      res.status(409).json({ error: "a payment is already running" });
      return;
    }

    const requested = req.body?.pack;
    // Defaults to the cheapest pack. A flagged proposal usually carries no
    // pack, and the safe default when spending someone else's money is least.
    const pack: PackName = PACK_NAMES.includes(requested) ? requested : "small";

    const run = approveFlagged(db, client, req.params.id, pack)
      .then((result) => {
        if (result.blockedBy) {
          res.status(409).json({ error: "still blocked", blockedBy: result.blockedBy });
          return;
        }
        res.json(result.decision);
      })
      .catch((err: unknown) => {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
      })
      .finally(() => {
        inFlight = null;
      });

    inFlight = run;
  });

  app.post("/decisions/:id/reject", (req, res) => {
    try {
      res.json(rejectFlagged(db, req.params.id));
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post("/tick", (req, res) => {
    if (inFlight) {
      res.status(409).json({ error: "a tick is already running" });
      return;
    }

    const account = typeof req.body?.account_id === "string" ? req.body.account_id : DEFAULT_ACCOUNT;
    const run = runTick(db, client, account)
      .then((result) => res.json(result))
      .catch((err: unknown) => {
        res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
      })
      .finally(() => {
        inFlight = null;
      });

    inFlight = run;
  });

  return { app, db, client };
}
