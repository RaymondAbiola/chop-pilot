# ChopPilot

**An AI treasurer for prepaid meal balances.** A payer abroad funds an agent
wallet with USDC. The agent watches a family member's prepaid meal balance,
reasons over their consumption with SERV, and recharges automatically through an
x402 paywalled endpoint, always inside the payer's spending rules.

Built for the OpenServ SERV Hackathon, Edition 01. AgentKit track.

## The problem

Diaspora remittance for food is fire and forget. You send money home and hope it
reaches a meal. You get no visibility into whether it did, no control over how
fast it goes, and no way to notice when something is wrong.

## The principle: the LLM proposes, the code enforces

SERV Reasoning decides *whether* and *how much* to recharge, and explains why in
a sentence the payer reads. A deterministic policy engine then validates that
proposal before any money moves.

These are separate on purpose, and the dashboard shows both sides of the split
for every single decision:

```
07:30:36   PAID                                    medium
 serv      The balance is at your recharge point and recent use is steady.
 policy    all rules passed
 tx        0xfa5a5d2d...210e

07:29:34   BLOCKED                                 medium
 serv      proposed a medium pack
 policy    x too soon after the last recharge
```

The second row is the product. An agent that can spend money is only as
trustworthy as the thing that can stop it, and that thing is plain, tested,
non-probabilistic code.

## Architecture

```
  Payer dashboard (Next.js)
  rules, wallet, decision log, flag inbox
            |
            | REST
            v
  Agent service (Node)                 SERV Reasoning API
  1. read balance and 14d usage  <-->  inference-api.openserv.ai
  2. ask SERV for a proposal
  3. policy engine validates           Coinbase CDP wallet
  4. pay over x402               <-->  Base Sepolia, USDC
  5. log the decision
            |
            | x402 payment
            v
  ChopEazy mock (Express + SQLite)
  accounts, orders, x402 paywalled recharge packs
```

| Package | Role |
|---|---|
| `apps/web` | Payer dashboard |
| `apps/agent` | SERV client, policy engine, CDP wallet, decision log, REST API |
| `apps/chopeazy-mock` | Stand-in for ChopEazy, with the x402 paywall |
| `packages/shared` | Types, zod schemas, pack and network constants |

## The six rules

Set by the payer, enforced by `apps/agent/src/policy.ts`, covered by 19 tests.

| Rule | Meaning |
|---|---|
| `weekly_cap` | total spend in any rolling 7 days |
| `max_per_recharge` | largest single payment |
| `balance_above_trigger` | only recharge once the balance is actually low |
| `recipient_not_allowed` | pay one allowlisted address and nothing else |
| `anomaly` | consumption over 3x the 14 day baseline is never auto paid |
| `cooldown` | minimum gap between recharges |

Every failing rule is reported, not just the first, so the payer sees the whole
reason a payment was refused.

### Two independent layers

Underneath the policy engine sit **CDP SDK spend controls**: per payment cap,
cumulative cap, asset allowlist and payee allowlist, enforced inside the wallet
itself. They are deliberately set above the payer's own rules, so they only fire
if the agent's own logic is wrong.

The dashboard labels them as the wallet backstop and states that they cannot be
changed from the UI.

## When the agent is unsure

Abnormal consumption produces a flag rather than a payment. The payer sees an
approval panel with the agent's reasoning, a chart of daily consumption showing
the spike, and Approve or Reject.

**Approving waives the anomaly judgement only.** The caps, cooldown and payee
allowlist are re-checked against the account as it stands at the moment of
approval. During development the system refused a payment that had been
explicitly approved, because the balance had recovered in between. That is the
intended behaviour.

## What is real

- **SERV Reasoning** makes every decision, with a strict JSON schema and zod
  validation at the boundary. Malformed output is a failure, never prose quietly
  treated as a decision.
- **Payments are real x402 v2 transactions** settling on Base Sepolia in USDC,
  verifiable on BaseScan.
- **The wallet is a real CDP server wallet** with real spend controls.

## What is mocked, and why

`apps/chopeazy-mock` stands in for ChopEazy's production system, which stays
private. The mock reproduces only the surface an agent needs: a balance, an order
history, and paywalled recharge routes. **This repository contains no ChopEazy
production code.** Connecting the real system is one endpoint.

Recharges are fixed packs because x402 prices a route rather than a request. A
human paying by hand has no such constraint, which is why the seeded pre agent
top up is an arbitrary amount while every agent payment is a pack.

## Stack

| | |
|---|---|
| Reasoning | OpenServ SERV Reasoning API, OpenAI SDK against `/v1/chat/completions` |
| Payments | x402 protocol v2, `@x402/express` and `@x402/fetch` |
| Wallet | Coinbase CDP SDK, `CdpX402Client` with spend controls |
| Chain | Base Sepolia, USDC at `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| Dashboard | Next.js, wagmi, viem, TanStack Query |
| Storage | SQLite |

Notes for anyone extending this: the `@x402/*` v2 packages are not wire
compatible with the older unscoped `x402-express`, networks are CAIP-2
identifiers rather than names, and a long lived `CdpX402Client` can present a
stale credential, so the agent builds one per request and retries once on a
fresh client.

## Running it

```
pnpm install
cp .env.example .env     # fill in SERV, CDP and merchant values
pnpm build
```

Then three terminals:

```
pnpm dev:mock     # localhost:4000
pnpm dev:agent    # localhost:4100
pnpm dev:web      # localhost:3000
```

The agent acts only when asked. Set `TICK_INTERVAL_SECONDS` to run it on a timer.

```
pnpm test         # policy engine, 19 tests
```

### Useful scripts

```
pnpm --filter @choppilot/agent address    # agent wallet address and balances
pnpm --filter @choppilot/agent fund       # request testnet ETH
pnpm --filter @choppilot/agent propose    # one SERV decision, no payment
pnpm --filter @choppilot/agent tick       # one full decision cycle
pnpm --filter @choppilot/agent pay        # pay once, then prove the caps refuse an overspend
```

Fund the agent wallet with Base Sepolia USDC from `faucet.circle.com`.

## Demo

The dashboard has a demo strip: **reset** to a clean 14 day history, **normal
day**, **usage spike**, and **run agent**. Reset clears both stores but leaves
the payer's rules alone.

1. Reset, then run the agent. The balance is comfortable, so it waits.
2. Normal day, then run the agent. It recharges, and the transaction appears.
3. Usage spike, then run the agent. It flags instead of paying, and the chart
   shows why.
4. Approve the flag. It pays, having re-checked every rule except the anomaly.

## Revenue model

- **A new funding channel for ChopEazy.** Diaspora payers become a subscription
  source the business cannot reach today.
- **Fee on USDC recharges**, competitive against remittance corridor spreads
  rather than against card rails.
- **An agent payable endpoint.** Once chops are behind x402, any agent can buy
  them. Gifting a week of meals becomes an API call.

## Cost

A decision costs roughly 730 input and 130 output tokens. On `gpt-5.6-luna`
through SERV that is a fraction of a cent per tick, so the reasoning is not the
constraint on running this for real.
