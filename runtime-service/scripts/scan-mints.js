import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import { ViemMintSource, runMintScanner } from "../lib/engines/mint-scanner.js";

const rpcUrl = process.env.SEPOLIA_RPC_URL;
if (!rpcUrl) throw new Error("SEPOLIA_RPC_URL is required");

const input = process.argv[2]
  ? JSON.parse(process.argv[2])
  : { chains: ["eip155:11155111"], timeWindowHours: 1, filters: { minMints: 2 } };
const client = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
const report = await runMintScanner({
  input,
  sources: {
    "eip155:11155111": new ViemMintSource(client, { chain: "eip155:11155111" }),
  },
});
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
