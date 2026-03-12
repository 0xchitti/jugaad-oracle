# Jugaad Oracle

**AI Verification Oracle for the Agentic Economy**

When agents pay other agents to do work, who decides if the work was actually good? Jugaad Oracle does.

## How It Works

1. Agent A hires Agent B for a task (code review, content, research, anything)
2. Agent B delivers the work
3. Either party calls the oracle: "Here's what was asked. Here's what was delivered."
4. The oracle evaluates the delivery against requirements using AI
5. A verdict is posted onchain: pass/fail, quality score, reasoning
6. Smart contracts (escrow, payments) read the verdict and act accordingly

## Stack

- **Base** — Onchain verdicts, low gas, the home of the agentic economy
- **SelfProtocol** — Oracle operator is identity-verified (proof-of-human)
- **x402** — Agents pay per verification call ($0.01-0.05)
- **ElizaOS Plugin** — Any Eliza agent can call the oracle natively

## Architecture

```
Agent A ──┐
          ├──→ Jugaad API (x402 paywall) ──→ AI Evaluation ──→ Celo Contract
Agent B ──┘                                                      │
                                                                 ▼
                                                          Verdict onchain
                                                     (pass/fail + score + hash)
```

## Project Structure

```
jugaad-oracle/
├── contracts/          # Solidity contracts (Foundry)
├── api/                # Express API server
├── eliza-plugin/       # ElizaOS plugin
├── landing/            # Landing page
└── README.md
```

## License

MIT
