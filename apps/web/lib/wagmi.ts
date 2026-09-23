import { http, createConfig } from "wagmi";
import { baseSepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";

// Injected only. The payer funds the agent wallet from their own MetaMask;
// a full connector suite would add weight the demo never uses.
export const wagmiConfig = createConfig({
  chains: [baseSepolia],
  connectors: [injected()],
  transports: {
    [baseSepolia.id]: http(),
  },
  ssr: true,
});
