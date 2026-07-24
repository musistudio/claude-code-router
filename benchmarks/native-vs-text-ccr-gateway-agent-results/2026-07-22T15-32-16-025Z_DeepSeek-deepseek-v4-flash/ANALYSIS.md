# CCR Gateway-Agent Rerun Analysis

Run: `2026-07-22T15-32-16-025Z_DeepSeek-deepseek-v4-flash`

## Setup

- Gateway: local CCR `/v1/responses` at `http://127.0.0.1:3456/v1/responses`
- Runtime: CCR Electron runtime service, using the persisted `~/.claude-code-router` config
- Model: `DeepSeek/deepseek-v4-flash`
- Fixtures: original `native-vs-text` fixtures, 6 fixtures x 2 trials
- Questions: 900 total
- Scorer: lenient exact-value containment, not the original exact string scorer
- Output cap: no benchmark `max_output_tokens` limit for compaction or evaluation
- Tool behavior: fixture tools remained available with `tool_choice: auto`; `ccr_history_ask` was injected and executed inside CCR gateway

## Main Result

| Arm | Correct | Accuracy |
|---|---:|---:|
| CCR gateway-agent | 729/900 | 81.0% |

Gateway-executed history retrieval calls: 12 total.

## By Category

| Category | Correct | Accuracy |
|---|---:|---:|
| exact_recall | 148/180 | 82.2% |
| relational_state | 140/180 | 77.8% |
| tool_history | 150/180 | 83.3% |
| distractor_resolution | 150/180 | 83.3% |
| task_continuation | 141/180 | 78.3% |

## By Fixture

| Fixture | Correct | Accuracy |
|---|---:|---:|
| fixture-01 | 142/150 | 94.7% |
| fixture-02 | 150/150 | 100.0% |
| fixture-03 | 150/150 | 100.0% |
| fixture-04 | 74/150 | 49.3% |
| fixture-05 | 75/150 | 50.0% |
| fixture-06 | 138/150 | 92.0% |

## Original Report Comparison

The original report used `openai/gpt-5.6-sol`, `tool_choice: none`, `max_output_tokens: 4096` for evaluation, and exact string scoring.

| Condition | Correct | Accuracy |
|---|---:|---:|
| Original full context | 900/900 | 100.0% |
| Original native compaction | 900/900 | 100.0% |
| Original balanced text summary | 745/900 | 82.8% |
| Original dense task-first text | 690/900 | 76.7% |
| This CCR gateway-agent run | 729/900 | 81.0% |

This run is not directly equivalent to the original native-compaction arm because it allows ordinary fixture tools with `tool_choice: auto`. That tests the more realistic agent behavior requested here: the model can choose between normal tools and the gateway-injected history retrieval tool.

## Failure Breakdown

- `fixture-04 trial 1`: scored 0/75, but the model placed the complete final JSON inside a `bash` function call argument instead of a final message. Post-hoc parsing that JSON scores 75/75. This is an output-channel/tool-selection failure, not a retrieval-content failure.
- `fixture-05 trial 2`: scored 0/75 with 0 history retrieval calls. The model said it needed to gather data and called fixture `read` tools instead of the gateway history retrieval tool. The benchmark runner does not execute fixture tools, so no final answers were produced.
- `fixture-01 trial 2`: 67/75. Errors were mostly task-state values collapsed to `pending`, plus one owner mismatch.
- `fixture-06 trial 1`: 64/75. Most relational-state errors dropped the required `relation-target-6-*` prefix and returned only the suffix.
- `fixture-04 trial 2`: 74/75. One task continuation value was replaced by a work item id.
- `fixture-06 trial 2`: 74/75. One exact recall owner mismatch.

If the `fixture-04 trial 1` tool-call JSON is counted post-hoc, the diagnostic score would be 804/900 (89.3%). The primary benchmark score remains 729/900 because the runner only scores final message text.
