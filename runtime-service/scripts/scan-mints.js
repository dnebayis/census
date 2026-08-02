import { runMintScanner } from "../lib/engines/mint-scanner.js";
import { createMintScannerSources } from "../lib/execution.js";

const rpcUrl = process.env.SEPOLIA_RPC_URL;
if (!rpcUrl) throw new Error("SEPOLIA_RPC_URL is required");

const input = process.argv[2]
  ? JSON.parse(process.argv[2])
  : { chains: ["eip155:11155111"], timeWindowHours: 1, filters: { minMints: 2 } };
const report = await runMintScanner({
  input,
  sources: createMintScannerSources(process.env),
});
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
