# ChopPilot

An AI treasurer for prepaid meal balances. A payer abroad funds an agent wallet
with USDC; the agent watches a family member's prepaid chop balance, reasons over
their usage with SERV, and recharges via an x402-paywalled endpoint, always inside
the payer's spending rules.

Built for the OpenServ SERV Hackathon, Edition 01 (AgentKit track).

## The core idea

**The LLM proposes, the code enforces.** SERV Reasoning decides whether and how
much to recharge and explains why. A deterministic policy engine validates every
proposal before any money moves. The two are separate on purpose, and the
dashboard shows both sides of the split for every decision.

## Layout

```
apps/chopeazy-mock   Express + SQLite + x402 paywall on the recharge routes
apps/agent           SERV reasoning loop, policy engine, x402 payment, decision log
apps/web             Next.js payer dashboard
packages/shared      Types, zod schemas, pack and network constants
```

`apps/chopeazy-mock` is a stand-in. ChopEazy's real system stays private; the mock
reproduces only the surface an agent needs, so this repo contains no production code.

## Stack notes

- x402 protocol **v2** via the `@x402/*` packages. The older unscoped `x402-express`
  is v1 and is not wire-compatible.
- Network is Base Sepolia, written as CAIP-2 `eip155:84532`.
- Recharges are fixed packs because x402 prices a route, not a request.

## Setup

```
pnpm install
cp .env.example .env    # fill in SERV, CDP and merchant values
pnpm build
```
