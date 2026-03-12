import type { Plugin, Action, IAgentRuntime, Memory, HandlerCallback, State } from "@elizaos/core";

const ORACLE_API_URL = process.env.JUGAAD_ORACLE_URL || "https://jugaad-oracle.fly.dev";

interface VerifyResult {
  verdict: {
    pass: boolean;
    qualityScore: number;
    reasoning: string;
  };
  onchain: {
    txHash: string;
    blockNumber: string;
    contract: string;
  };
}

/**
 * VERIFY_WORK action — sends task+delivery to Jugaad Oracle for AI verification
 */
const verifyWorkAction: Action = {
  name: "VERIFY_WORK",
  similes: [
    "CHECK_DELIVERY",
    "VERIFY_DELIVERY",
    "EVALUATE_WORK",
    "JUDGE_WORK",
    "ORACLE_VERIFY",
    "CHECK_WORK_QUALITY",
  ],
  description:
    "Verify the quality of delivered work against task requirements using the Jugaad Oracle. Returns an onchain verdict with pass/fail, quality score, and reasoning.",

  validate: async (runtime: IAgentRuntime, _message: Memory) => {
    const apiUrl = runtime.getSetting("JUGAAD_ORACLE_URL") || ORACLE_API_URL;
    if (!apiUrl) {
      return false;
    }
    return true;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    state: State | undefined,
    _options: any,
    callback?: HandlerCallback
  ) => {
    const apiUrl = runtime.getSetting("JUGAAD_ORACLE_URL") || ORACLE_API_URL;

    // Extract task and delivery from the message
    // Expected format: the agent should parse "task: ... delivery: ..." from context
    const text = message.content.text || "";

    // Try to parse structured input
    let task = "";
    let delivery = "";

    const taskMatch = text.match(/task[:\s]+(.+?)(?=delivery[:\s]|$)/is);
    const deliveryMatch = text.match(/delivery[:\s]+(.+?)$/is);

    if (taskMatch) task = taskMatch[1].trim();
    if (deliveryMatch) delivery = deliveryMatch[1].trim();

    if (!task || !delivery) {
      if (callback) {
        await callback({
          text: "I need both a task description and a delivery to verify. Please provide them in the format:\n\nTask: [what was requested]\nDelivery: [what was delivered]",
          source: message.content.source,
        });
      }
      return { text: "Missing task or delivery", success: false };
    }

    try {
      const response = await fetch(`${apiUrl}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, delivery }),
      });

      if (!response.ok) {
        throw new Error(`Oracle API returned ${response.status}`);
      }

      const result: VerifyResult = await response.json();

      const emoji = result.verdict.pass ? "✅" : "❌";
      const responseText = `${emoji} **Verification Verdict**

**Status:** ${result.verdict.pass ? "PASS" : "FAIL"}
**Quality Score:** ${result.verdict.qualityScore}/100
**Reasoning:** ${result.verdict.reasoning}

📍 **Onchain Proof**
TX: ${result.onchain.txHash}
Block: ${result.onchain.blockNumber}
Contract: ${result.onchain.contract}`;

      if (callback) {
        await callback({
          text: responseText,
          source: message.content.source,
        });
      }

      return { text: responseText, success: true, data: result };
    } catch (error: any) {
      const errorText = `Oracle verification failed: ${error.message}`;
      if (callback) {
        await callback({ text: errorText, source: message.content.source });
      }
      return { text: errorText, success: false };
    }
  },

  examples: [
    [
      {
        name: "Agent A",
        content: {
          text: "Task: Write a Python function to sort a list of dictionaries by a given key. Delivery: def sort_dicts(lst, key): return sorted(lst, key=lambda x: x[key])",
        },
      },
      {
        name: "Oracle",
        content: {
          text: "✅ Verification Verdict\nStatus: PASS\nQuality Score: 85/100\nReasoning: The delivery implements the required functionality correctly...",
          actions: ["VERIFY_WORK"],
        },
      },
    ],
  ],
};

/**
 * GET_VERDICT action — fetch an existing verdict by request ID
 */
const getVerdictAction: Action = {
  name: "GET_VERDICT",
  similes: ["CHECK_VERDICT", "LOOKUP_VERDICT", "VERDICT_STATUS"],
  description: "Look up an existing verification verdict by request ID from the Jugaad Oracle.",

  validate: async (runtime: IAgentRuntime) => {
    const apiUrl = runtime.getSetting("JUGAAD_ORACLE_URL") || ORACLE_API_URL;
    return !!apiUrl;
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: any,
    callback?: HandlerCallback
  ) => {
    const apiUrl = runtime.getSetting("JUGAAD_ORACLE_URL") || ORACLE_API_URL;
    const text = message.content.text || "";
    const idMatch = text.match(/\d+/);

    if (!idMatch) {
      if (callback) {
        await callback({ text: "Please provide a request ID to look up.", source: message.content.source });
      }
      return { text: "Missing request ID", success: false };
    }

    try {
      const response = await fetch(`${apiUrl}/verdict/${idMatch[0]}`);
      const result = await response.json();

      const responseText = `📋 **Verdict #${idMatch[0]}**\nStatus: ${result.status}\nQuality: ${result.qualityScore}/100`;

      if (callback) {
        await callback({ text: responseText, source: message.content.source });
      }
      return { text: responseText, success: true, data: result };
    } catch (error: any) {
      const errorText = `Failed to fetch verdict: ${error.message}`;
      if (callback) {
        await callback({ text: errorText, source: message.content.source });
      }
      return { text: errorText, success: false };
    }
  },

  examples: [],
};

/**
 * Jugaad Oracle Plugin for ElizaOS
 */
const jugaadOraclePlugin: Plugin = {
  name: "plugin-jugaad-oracle",
  description: "AI Verification Oracle — verify agent-to-agent work delivery with onchain verdicts on Celo",
  actions: [verifyWorkAction, getVerdictAction],
  providers: [],
  services: [],
};

export default jugaadOraclePlugin;
export { verifyWorkAction, getVerdictAction };
