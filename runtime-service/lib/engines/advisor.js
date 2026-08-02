import { skillByIndex } from "../skills.js";

export function normalizeAdvisorInput(input) {
  return skillByIndex(6).inputSchema.parse(input);
}

export async function runAdvisor({ input, now = () => new Date() }) {
  const normalized = normalizeAdvisorInput(input);
  const sources = normalized.evidence.map((item, index) => ({
    id: index + 1,
    title: item.title,
    url: item.url,
    summary: item.summary,
  }));

  const suggestions = [
    {
      priority: 1,
      action: "Review the linked evidence and verify that it is current before making a decision.",
      sourceIds: sources.map(({ id }) => id),
    },
    {
      priority: 2,
      action: normalized.constraints.length
        ? "Compare every option against the stated constraints and discard any option that violates one."
        : "Write down budget, timing, and downside constraints before choosing an option.",
      sourceIds: [],
    },
    {
      priority: 3,
      action: normalized.riskTolerance === "low"
        ? "Prefer the reversible or lowest-downside next step and independently verify contract addresses and permissions."
        : "Treat the selected risk tolerance as a review preference, not permission to skip verification.",
      sourceIds: [],
    },
  ];

  return {
    skill: "Advisor",
    generatedAt: now().toISOString(),
    reportOnly: true,
    goal: normalized.goal,
    riskTolerance: normalized.riskTolerance,
    constraints: normalized.constraints,
    suggestions,
    sources,
    limitations: [
      "Suggestions are based only on the supplied evidence and may be incomplete or outdated.",
      "Census does not provide legal, tax, or financial guarantees.",
      "No calldata, approval, signature request, transaction, trade, transfer, or contract call is prepared or submitted.",
    ],
  };
}
