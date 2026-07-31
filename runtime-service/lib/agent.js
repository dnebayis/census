import { hexToString } from "viem";
import { skillByIndex } from "./skills.js";

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
    name: "skillOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "classOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "metadata",
    stateMutability: "view",
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "key", type: "string" },
    ],
    outputs: [{ name: "", type: "bytes" }],
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
          { name: "tokenId", type: "uint256" },
        ],
      },
    ],
  },
];

export async function readAgent({ client, censusAddress, adapterAddress, tokenId }) {
  await client.getBlockNumber();

  let owner;
  try {
    owner = await client.readContract({
      address: censusAddress,
      abi: censusAbi,
      functionName: "ownerOf",
      args: [tokenId],
    });
  } catch {
    throw new TokenNotFoundError();
  }

  const [agentId, skillIndex, className, contextHex] = await Promise.all([
    client.readContract({
      address: censusAddress,
      abi: censusAbi,
      functionName: "agentIdOf",
      args: [tokenId],
    }),
    client.readContract({
      address: censusAddress,
      abi: censusAbi,
      functionName: "skillOf",
      args: [tokenId],
    }),
    client.readContract({
      address: censusAddress,
      abi: censusAbi,
      functionName: "classOf",
      args: [tokenId],
    }),
    client.readContract({
      address: censusAddress,
      abi: censusAbi,
      functionName: "metadata",
      args: [tokenId, "context"],
    }),
  ]);

  const binding = await client.readContract({
    address: adapterAddress,
    abi: adapterAbi,
    functionName: "bindingOf",
    args: [agentId],
  });
  const boundContract = Array.isArray(binding) ? binding[1] : binding.tokenContract;
  const boundTokenId = Array.isArray(binding) ? binding[2] : binding.tokenId;
  if (
    agentId === 0n ||
    boundContract.toLowerCase() !== censusAddress.toLowerCase() ||
    boundTokenId !== tokenId
  ) {
    throw new MissingBindingError();
  }

  return {
    censusAddress,
    tokenId,
    owner,
    agentId,
    className,
    context: hexToString(contextHex),
    skillIndex: Number(skillIndex),
    skill: skillByIndex(skillIndex),
  };
}
