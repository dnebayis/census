import { parseAbiItem, zeroAddress } from "viem";
import { skillByIndex } from "../skills.js";

const transferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
);

function integerFilter(filters, name, fallback, minimum, maximum) {
  const value = filters?.[name] ?? fallback;
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new TypeError(`${name} must be an integer from ${minimum} to ${maximum}`);
  }
  return value;
}

export function normalizeMintScannerInput(input) {
  const parsed = skillByIndex(0).inputSchema.parse(input);
  return {
    ...parsed,
    minMints: integerFilter(parsed.filters, "minMints", 2, 1, 10_000),
    maxCandidates: integerFilter(parsed.filters, "maxCandidates", 20, 1, 100),
    maxEvidencePerCandidate: integerFilter(parsed.filters, "maxEvidencePerCandidate", 3, 1, 10),
  };
}

function evidence(event) {
  return {
    transactionHash: event.transactionHash,
    blockNumber: event.blockNumber.toString(),
    tokenId: event.tokenId.toString(),
    recipient: event.recipient,
  };
}

function summarizeChain(scan, input) {
  const groups = new Map();
  for (const event of scan.events) {
    const address = event.collection.toLowerCase();
    const current = groups.get(address) || {
      collection: address,
      events: [],
      recipients: new Set(),
    };
    current.events.push(event);
    current.recipients.add(event.recipient.toLowerCase());
    groups.set(address, current);
  }

  const candidates = [...groups.values()]
    .filter((group) => group.events.length >= input.minMints)
    .map((group) => {
      group.events.sort((a, b) => Number(a.blockNumber - b.blockNumber));
      const mintCount = group.events.length;
      const uniqueRecipients = group.recipients.size;
      const score = Math.min(100, Math.round(18 * Math.log2(mintCount + 1) + uniqueRecipients));
      return {
        collection: group.collection,
        score,
        mintCount,
        uniqueRecipients,
        firstObservedBlock: group.events[0].blockNumber.toString(),
        lastObservedBlock: group.events.at(-1).blockNumber.toString(),
        reasoning: [
          `${mintCount} ERC-721 mint events were observed in the scanned window.`,
          `${uniqueRecipients} unique recipient addresses received those mints.`,
          "The score ranks observed activity only; it is not a safety, value, or authenticity judgment.",
        ],
        evidence: group.events.slice(-input.maxEvidencePerCandidate).map(evidence),
      };
    })
    .sort((a, b) => b.score - a.score || b.mintCount - a.mintCount || a.collection.localeCompare(b.collection))
    .slice(0, input.maxCandidates);

  return {
    chain: scan.chain,
    requestedSince: scan.requestedSince,
    scannedFromBlock: scan.fromBlock.toString(),
    scannedToBlock: scan.toBlock.toString(),
    truncated: scan.truncated,
    observedMintEvents: scan.events.length,
    candidates,
  };
}

export async function runMintScanner({ input, sources, now = () => new Date() }) {
  const normalized = normalizeMintScannerInput(input);
  const requestedSince = new Date(now().getTime() - normalized.timeWindowHours * 60 * 60 * 1000);
  const scans = await Promise.all(
    normalized.chains.map(async (chain) => {
      const source = sources[chain];
      if (!source) throw new TypeError(`unsupported Mint Scanner chain ${chain}`);
      return source.scanMints({ requestedSince, filters: normalized.filters || {} });
    }),
  );

  return {
    skill: "Mint Scanner",
    generatedAt: now().toISOString(),
    reportOnly: true,
    methodology: "ERC-721 Transfer events whose from address is zero, grouped by collection.",
    limitations: [
      "ERC-1155 transfers and contracts that do not emit the standard ERC-721 Transfer event are not included.",
      "Observed mint activity does not prove that a contract was deployed inside the requested window.",
      "A truncated chain scan covers the newest configured block range only.",
    ],
    chains: scans.map((scan) => summarizeChain(scan, normalized)),
  };
}

export class ViemMintSource {
  constructor(client, { chain, maxBlocks = 20_000, chunkBlocks = 1_000, maxEvents = 5_000 } = {}) {
    this.client = client;
    this.chain = chain;
    this.maxBlocks = BigInt(maxBlocks);
    this.chunkBlocks = BigInt(chunkBlocks);
    this.maxEvents = maxEvents;
  }

  async firstBlockAtOrAfter(timestamp, high) {
    let low = 0n;
    while (low < high) {
      const middle = (low + high) / 2n;
      const block = await this.client.getBlock({ blockNumber: middle });
      if (block.timestamp < timestamp) low = middle + 1n;
      else high = middle;
    }
    return low;
  }

  async scanMints({ requestedSince }) {
    const toBlock = await this.client.getBlockNumber();
    const requestedFrom = await this.firstBlockAtOrAfter(
      BigInt(Math.floor(requestedSince.getTime() / 1000)),
      toBlock,
    );
    const boundedFrom = toBlock >= this.maxBlocks ? toBlock - this.maxBlocks + 1n : 0n;
    const fromBlock = requestedFrom < boundedFrom ? boundedFrom : requestedFrom;
    const events = [];

    let cursor = toBlock;
    while (cursor >= fromBlock && events.length < this.maxEvents) {
      const possibleStart = cursor >= this.chunkBlocks - 1n ? cursor - this.chunkBlocks + 1n : 0n;
      const chunkStart = possibleStart < fromBlock ? fromBlock : possibleStart;
      const logs = await this.client.getLogs({
        event: transferEvent,
        args: { from: zeroAddress },
        fromBlock: chunkStart,
        toBlock: cursor,
        strict: true,
      });
      for (const log of logs) {
        events.push({
          collection: log.address,
          transactionHash: log.transactionHash,
          blockNumber: log.blockNumber,
          tokenId: log.args.tokenId,
          recipient: log.args.to,
        });
      }
      if (chunkStart === fromBlock) break;
      cursor = chunkStart - 1n;
    }

    events.sort((a, b) => Number(a.blockNumber - b.blockNumber));
    return {
      chain: this.chain,
      requestedSince: requestedSince.toISOString(),
      fromBlock,
      toBlock,
      truncated: requestedFrom < boundedFrom || events.length >= this.maxEvents,
      events: events.slice(-this.maxEvents),
    };
  }
}
