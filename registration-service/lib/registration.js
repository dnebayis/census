import { hexToString } from "viem";

export class ConfigurationError extends Error {}
export class TokenNotFoundError extends Error {}
export class MissingBindingError extends Error {}

export const censusAbi = [
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "agentIdOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "metadata",
    stateMutability: "view",
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "key", type: "string" }
    ],
    outputs: [{ name: "", type: "bytes" }],
  },
  {
    type: "function",
    name: "tokenURI",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
];

export const adapterAbi = [
  {
    type: "function",
    name: "bindingOf",
    stateMutability: "view",
    inputs: [{ name: "agentId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "standard", type: "uint8" },
          { name: "tokenContract", type: "address" },
          { name: "tokenId", type: "uint256" }
        ]
      }
    ]
  }
];

function decodeTokenMetadata(tokenUri) {
  const prefix = "data:application/json;base64,";
  if (!tokenUri.startsWith(prefix)) throw new Error("tokenURI is not an onchain JSON data URI");
  const metadata = JSON.parse(Buffer.from(tokenUri.slice(prefix.length), "base64").toString("utf8"));
  if (typeof metadata.image !== "string" || !metadata.image.startsWith("data:image/svg+xml;base64,")) {
    throw new Error("tokenURI has no onchain SVG image");
  }
  return metadata;
}

export function buildRegistration({
  tokenId,
  agentId,
  identityRegistryAddress,
  chainId,
  context,
  image,
}) {
  return {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: `Census #${tokenId}`,
    description: context,
    image,
    services: [],
    x402Support: false,
    active: false,
    registrations: [
      {
        agentId: Number(agentId),
        agentRegistry: `eip155:${chainId}:${identityRegistryAddress}`,
      },
    ],
    supportedTrust: [],
  };
}

export async function readRegistration({
  client,
  tokenId,
  censusAddress,
  adapterAddress,
  identityRegistryAddress,
  chainId,
}) {
  // A failed block read is an upstream failure, never proof that a token is absent.
  await client.getBlockNumber();

  try {
    await client.readContract({
      address: censusAddress,
      abi: censusAbi,
      functionName: "ownerOf",
      args: [tokenId],
    });
  } catch {
    throw new TokenNotFoundError();
  }

  const [agentId, contextHex, tokenUri] = await Promise.all([
    client.readContract({
      address: censusAddress,
      abi: censusAbi,
      functionName: "agentIdOf",
      args: [tokenId],
    }),
    client.readContract({
      address: censusAddress,
      abi: censusAbi,
      functionName: "metadata",
      args: [tokenId, "context"],
    }),
    client.readContract({
      address: censusAddress,
      abi: censusAbi,
      functionName: "tokenURI",
      args: [tokenId],
    }),
  ]);

  const binding = await client.readContract({
    address: adapterAddress,
    abi: adapterAbi,
    functionName: "bindingOf",
    args: [agentId],
  });
  const [, boundContract, boundTokenId] = binding;
  if (
    agentId === 0n ||
    boundContract.toLowerCase() !== censusAddress.toLowerCase() ||
    boundTokenId !== tokenId
  ) {
    throw new MissingBindingError();
  }

  const metadata = decodeTokenMetadata(tokenUri);
  return buildRegistration({
    tokenId: tokenId.toString(),
    agentId,
    identityRegistryAddress,
    chainId,
    context: hexToString(contextHex),
    image: metadata.image,
  });
}
