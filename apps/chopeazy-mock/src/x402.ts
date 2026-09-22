import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { x402ResourceServer } from "@x402/express";
import { FACILITATOR_URL, NETWORK, PACK_NAMES, PACKS } from "@choppilot/shared";

export function buildResourceServer(facilitatorUrl: string): x402ResourceServer {
  const facilitator = new HTTPFacilitatorClient({ url: facilitatorUrl });
  return new x402ResourceServer(facilitator).register(NETWORK, new ExactEvmScheme());
}

// One route per pack. x402 prices a route, so an arbitrary recharge amount
// would need an arbitrary number of routes.
export function buildRoutes(merchant: string) {
  return Object.fromEntries(
    PACK_NAMES.map((name) => [
      `POST /recharge/${name}`,
      {
        accepts: {
          scheme: "exact",
          price: `$${PACKS[name].usdc.toFixed(2)}`,
          network: NETWORK,
          payTo: merchant,
          maxTimeoutSeconds: 120,
        },
        description: `${PACKS[name].chops} chops`,
      },
    ]),
  );
}

export const FACILITATOR = FACILITATOR_URL;
