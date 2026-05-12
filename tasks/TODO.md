# Gemini Nano Bridge: Future Optimizations

This document tracks potential improvements for the `chrome-device-bridge.ts` to further enhance stability and model performance.

## 📖 Core Concepts & Mechanics

### Whitespace Stalling (`MAX_WS_STALL`)
Gemini Nano can enter deterministic loops when emitting highly structured content (e.g., deeply indented code), producing an endless stream of whitespace.
- **Handling**: The bridge monitors `nonWsChars`. If `stallChars` exceeds `MAX_WS_STALL` (currently 1000) without any non-whitespace content, the bridge calls `controller.abort()` to kill the session.
- **Recovery**: This triggers a `truncated: true` signal to the server, which initiates a fallback retry without `responseConstraint` and with a dynamic temperature increase.

## 🛠 Potential Optimizations

### 1. Assistant History Management
- [ ] Implement selective inclusion of assistant messages in `buildTurnPrompt` to preserve conversation memory.
- **Problem**: `buildTurnPrompt` currently skips assistant messages to conserve the limited context window. While efficient for tool-use, this may cause the model to lose "memory" of its own reasoning or previous answers in long, chatty conversations.
- **Potential Fix**: Modify the message filtering logic to selectively include previous assistant messages during session rebuilds or when a specific "conversation memory" threshold is met.

### 2. Time-Based Stall Detection
- [ ] Implement hybrid stall detection (time + char count) to prevent premature aborts on indented files.
- **Problem**: The current `MAX_WS_STALL` is based purely on the number of whitespace characters (1000). Highly indented files (e.g., deeply nested JSON or Python) might trigger this abort prematurely.
- **Potential Fix**: Implement a hybrid stall detection mechanism that combines the character count with a time-based check (e.g., if no non-whitespace content is produced for 15-20 seconds, regardless of the char count).

### 3. Dynamic Top-K Scaling
- [ ] Implement Top-K increase during fallback retries to break deterministic loops.
- **Problem**: We currently only increase temperature during fallback retries. In some deterministic loops, the model may be stuck between a few high-probability tokens.
- **Potential Fix**: Increase `DEFAULT_TOPK` (e.g., from 40 to 60) during the fallback retry (alongside the temperature increase) to provide the model with a wider selection of tokens to break the loop.

## ✅ Current Status (Baseline)
- [x] Operational Override for hallucination prevention.
- [x] Dynamic temperature scaling for stall recovery.
- [x] JSON-robust extraction (`extractJson`).
- [x] Persistent session management with parameter clamping.
- [x] Tool Result labeling and result-checking guidelines.
