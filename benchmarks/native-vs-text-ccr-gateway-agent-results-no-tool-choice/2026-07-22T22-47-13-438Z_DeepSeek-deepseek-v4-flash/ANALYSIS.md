# CCR Gateway-Agent No Tool Choice Rerun

Run: `2026-07-22T22-47-13-438Z_DeepSeek-deepseek-v4-flash`

## Setup

- Gateway: local CCR `/v1/responses` at `http://127.0.0.1:3456/v1/responses`
- Runtime: CCR Electron runtime service, using the persisted `~/.claude-code-router` config
- Model: `DeepSeek/deepseek-v4-flash`
- Fixtures: original `native-vs-text` fixtures, 6 fixtures x 2 trials
- Questions: 900 total
- Scorer: lenient exact-value containment
- Output cap: no benchmark `max_output_tokens` limit for compaction or evaluation
- Evaluation `tool_choice`: omitted from the request body
- Tool behavior: fixture tools remained available; `ccr_history_ask` was injected and executed inside CCR gateway

## Main Result

| Arm | Correct | Accuracy |
|---|---:|---:|
| CCR gateway-agent, no `tool_choice` field | 885/900 | 98.3% |

Gateway-executed history retrieval calls: 15 total.

## By Category

| Category | Correct | Accuracy |
|---|---:|---:|
| exact_recall | 177/180 | 98.3% |
| relational_state | 170/180 | 94.4% |
| tool_history | 180/180 | 100.0% |
| distractor_resolution | 180/180 | 100.0% |
| task_continuation | 178/180 | 98.9% |

## By Fixture

| Fixture | Correct | Accuracy |
|---|---:|---:|
| fixture-01 | 150/150 | 100.0% |
| fixture-02 | 149/150 | 99.3% |
| fixture-03 | 149/150 | 99.3% |
| fixture-04 | 138/150 | 92.0% |
| fixture-05 | 149/150 | 99.3% |
| fixture-06 | 150/150 | 100.0% |

## Comparison

| Run | Correct | Accuracy | Gateway history calls |
|---|---:|---:|---:|
| Previous explicit `tool_choice: "auto"` run | 729/900 | 81.0% | 12 |
| This no-`tool_choice` run | 885/900 | 98.3% | 15 |

The selected `fixture-05 trial2` case changed from 0/75 with 0 history calls in the explicit-auto run to 75/75 with 1 history call in this run.

## Remaining Errors

- `fixture-02 trial1`: one owner mismatch, `Devon` expected but `Harper` returned.
- `fixture-03 trial2`: one owner mismatch, `Ellis` expected but `Avery` returned.
- `fixture-04 trial1`: two task continuation errors. One task id was shifted to `backfill-project-4`; one approval id dropped the `approval-` prefix.
- `fixture-04 trial2`: ten relational state errors. The model returned the relation target suffix but dropped the required `relation-target-4-*` prefix.
- `fixture-05 trial1`: one owner mismatch, `Gray` expected but `Casey` returned.

No 0-score structural failure occurred in this run.
