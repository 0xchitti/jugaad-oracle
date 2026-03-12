import express from "express";
import cors from "cors";
import { createPublicClient, createWalletClient, http, parseAbi, keccak256, toHex, encodePacked } from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import OpenAI from "openai";
import "dotenv/config";

const app = express();
app.use(cors());
app.use(express.json());

// Config
const PORT = process.env.PORT || 3001;
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS as `0x${string}`;
const PRIVATE_KEY = process.env.PRIVATE_KEY as `0x${string}`;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Viem clients
const account = privateKeyToAccount(PRIVATE_KEY);
const publicClient = createPublicClient({ chain: base, transport: http() });
const walletClient = createWalletClient({ chain: base, transport: http(), account });

// OpenAI
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const ORACLE_ABI = parseAbi([
  "function requestVerification(bytes32 taskHash, bytes32 deliveryHash) external payable returns (uint256)",
  "function postVerdict(uint256 requestId, bool pass, uint8 qualityScore, string reasoningCid) external",
  "function getVerdict(uint256 requestId) external view returns (uint8 status, uint8 qualityScore, string reasoningCid)",
  "function isPassed(uint256 requestId) external view returns (bool)",
  "function requestCount() external view returns (uint256)",
  "function operatorVerified() external view returns (bool)",
  "function verificationFee() external view returns (uint256)",
]);

// --- AI Evaluation Engine ---
async function evaluateDelivery(task: string, delivery: string): Promise<{
  pass: boolean;
  qualityScore: number;
  reasoning: string;
}> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are a strict but fair work verification oracle. You evaluate whether a delivery meets the task requirements.

Return a JSON object with:
- "pass": boolean (did the delivery meet the core requirements?)
- "qualityScore": number 0-100 (how well was it done?)
- "reasoning": string (brief explanation of your verdict)

Be objective. Focus on whether requirements were met, not style preferences.`,
      },
      {
        role: "user",
        content: `## Task Requirements\n${task}\n\n## Delivery\n${delivery}`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.1,
  });

  const result = JSON.parse(response.choices[0].message.content || "{}");
  return {
    pass: result.pass ?? false,
    qualityScore: Math.min(100, Math.max(0, result.qualityScore ?? 0)),
    reasoning: result.reasoning ?? "No reasoning provided",
  };
}

// --- Routes ---

// Health check
app.get("/", (req, res) => {
  res.json({
    name: "Jugaad Oracle",
    description: "AI Verification Oracle for the Agentic Economy",
    version: "1.0.0",
    operator: account.address,
    contract: CONTRACT_ADDRESS,
    endpoints: {
      "POST /verify": "Submit task + delivery for AI verification",
      "GET /verdict/:id": "Get verdict for a request",
      "GET /stats": "Oracle statistics",
    },
  });
});

// Submit verification request
// This is the x402-paywall endpoint — agents pay to call this
app.post("/verify", async (req, res) => {
  try {
    const { task, delivery } = req.body;

    if (!task || !delivery) {
      return res.status(400).json({ error: "Missing 'task' and/or 'delivery' fields" });
    }

    // 1. AI evaluation
    const evaluation = await evaluateDelivery(task, delivery);

    // 2. Compute hashes
    const taskHash = keccak256(toHex(task));
    const deliveryHash = keccak256(toHex(delivery));

    // 3. Post verdict onchain
    // For now, we store the reasoning as a plain string CID placeholder
    // In production, upload to IPFS first
    const reasoningCid = `data:${Buffer.from(evaluation.reasoning).toString("base64")}`;

    const hash = await walletClient.writeContract({
      address: CONTRACT_ADDRESS,
      abi: ORACLE_ABI,
      functionName: "postVerdict",
      args: [
        BigInt(0), // TODO: get actual requestId from onchain or create one
        evaluation.pass,
        evaluation.qualityScore,
        reasoningCid,
      ],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    res.json({
      verdict: {
        pass: evaluation.pass,
        qualityScore: evaluation.qualityScore,
        reasoning: evaluation.reasoning,
      },
      onchain: {
        txHash: hash,
        blockNumber: receipt.blockNumber.toString(),
        contract: CONTRACT_ADDRESS,
      },
    });
  } catch (error: any) {
    console.error("Verification error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get verdict by request ID
app.get("/verdict/:id", async (req, res) => {
  try {
    const requestId = BigInt(req.params.id);
    const result = await publicClient.readContract({
      address: CONTRACT_ADDRESS,
      abi: ORACLE_ABI,
      functionName: "getVerdict",
      args: [requestId],
    });

    const [status, qualityScore, reasoningCid] = result as [number, number, string];
    const statusMap = ["Pending", "Pass", "Fail"];

    res.json({
      requestId: req.params.id,
      status: statusMap[status] || "Unknown",
      qualityScore,
      reasoningCid,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Oracle stats
app.get("/stats", async (req, res) => {
  try {
    const [requestCount, operatorVerified, fee] = await Promise.all([
      publicClient.readContract({ address: CONTRACT_ADDRESS, abi: ORACLE_ABI, functionName: "requestCount" }),
      publicClient.readContract({ address: CONTRACT_ADDRESS, abi: ORACLE_ABI, functionName: "operatorVerified" }),
      publicClient.readContract({ address: CONTRACT_ADDRESS, abi: ORACLE_ABI, functionName: "verificationFee" }),
    ]);

    res.json({
      totalRequests: requestCount.toString(),
      operatorVerified,
      feeWei: fee.toString(),
      operator: account.address,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🔮 Jugaad Oracle API running on port ${PORT}`);
  console.log(`   Operator: ${account.address}`);
  console.log(`   Contract: ${CONTRACT_ADDRESS}`);
});
