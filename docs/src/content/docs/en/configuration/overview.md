---
title: Overview dashboard
pageTitle: Overview dashboard
eyebrow: Detailed configuration
lead: Customize the CCR home dashboard to inspect system status, account balance, requests, tokens, cost, and model distribution.
---

## When to use it

| Scenario | What to inspect |
| --- | --- |
| Check gateway health | System status, success rate, errors, average latency |
| Estimate recent spend | Requests, input / output / cache tokens, estimated cost |
| Compare upstream usage | Provider analysis, model distribution, client analysis |
| Watch account quota | Balance, subscription quota, remaining quota, account status |
| Report or share usage | AI Usage Wrapped, CCR Route Map, Model Leaderboard, Spend Receipt, and other share cards |

## Time range

The `Usage over time` control at the top drives every widget that depends on usage stats. After you switch ranges, requests, tokens, cost, trends, distribution, and share cards are recomputed for the selected window.

| Option | Window |
| --- | --- |
| `Today` | Current local date from 00:00 to now, bucketed hourly. |
| `24h` | Last 24 hours, bucketed hourly. |
| `7d` | Last 7 days, bucketed daily. |
| `30d` | Last 30 days, bucketed daily. |

The account balance widget does not use this time range. It shows the latest snapshot returned by provider account connectors.

## Edit layout

Click the pencil button in the upper-right corner to enter editing mode. Editing mode has three columns:

| Area | Purpose |
| --- | --- |
| Components | Left palette. Click a template to add it to the dashboard. |
| Preview | Middle layout preview. Drag widgets to reorder them or click a widget to select it. |
| Component properties | Right property panel for changing type, data, size, style, or removing the selected widget. |

Common operations:

1. Add a widget: click a template in `Components`.
2. Reorder widgets: drag them in `Preview`.
3. Resize a widget: select it, then drag the right, bottom, or bottom-right resize handle.
4. Change data: use `Component category` and `Data` in `Component properties`.
5. Change presentation: choose `Widget size` and `Style`.
6. Save the result: click `Done`; the layout is persisted in app configuration.
7. Restore defaults: click `Reset layout` while editing.

Removing a widget only removes that card from the overview layout. It does not delete request logs, providers, account connectors, or upstream configuration. If all widgets are removed, the page shows `No widgets configured`.

## Widget catalog

Sizes are written as `width:height`, with both dimensions from `1` to `4`. The overview grid has up to 4 columns on desktop and collapses automatically on narrow screens.

| Widget | Data | Default size | Default style | Styles |
| --- | --- | --- | --- | --- |
| Status component | System status | `4:1` | Timeline | Timeline, Compact |
| Account component | All accounts or one account | `4:2` | Cards | Cards, Compact, Bars, Ring, Semicircle, Arc, Nested rings |
| Metric component | Requests, tokens, cost | `1:1` | Cards | Cards, Compact, Bar, Ring |
| Trend component | Usage over time | `3:2` | Composed | Composed, Area, Line, Bar |
| Activity component | Token activity | `4:2` | Heatmap | Heatmap |
| Breakdown component | Token distribution / Model distribution | Token distribution: `1:2`; Model distribution: `2:2` | Token distribution: Bars; Model distribution: Pie | Bars, Stacked, Donut, Pie |
| Analysis component | Client Analysis / Provider Analysis | `2:2` | Table | Table, Compact |
| Share card | AI Usage Wrapped, CCR Route Map, Model Leaderboard, AI Fuel Cockpit, Token Calendar Poster, Spend Receipt | `1:4` | Card | Card |

Size constraints:

| Rule | Reason |
| --- | --- |
| Share cards have a minimum size of `1:4`. | PNG export uses a vertical poster ratio and needs enough height. |
| The account widget has a minimum size of `2:2` when showing All accounts with the Compact style. | Multi-account lists need readable space. |
| Legacy aliases are still accepted: `small` -> `1:1`, `medium` / `large` -> `2:2`, `wide` -> `3:2`, `full` -> `4:1` or `4:2`. | Backward compatibility for older config. |

## Metric data

`metric` widgets use the `metric` field to choose the displayed value.

| `metric` | Meaning |
| --- | --- |
| `requests` | Request count |
| `total-tokens` | Total tokens |
| `input-tokens` | Input tokens |
| `output-tokens` | Output tokens |
| `cache-tokens` | Cache tokens |
| `cache-ratio` | Cache ratio |
| `estimated-cost` | Estimated cost, calculated from model pricing data |
| `success-rate` | Success rate |
| `errors` | Error count |
| `avg-latency` | Average latency |

## Account widget

The account widget reads provider account / usage connectors. To show balance or remaining quota, first enable and test `Fetch usage` in provider configuration.

| Data selection | Behavior |
| --- | --- |
| `All accounts` | Shows every available account snapshot. |
| One account | Shows only one provider or credential snapshot. The internal config value is usually `provider` or `provider::credentialId`. |

If the account widget is empty, check:

1. Whether the provider has an account / usage connector configured.
2. Whether the `Fetch usage` test succeeds.
3. Whether the API key or account endpoint is still valid.
4. Whether the selected account was deleted or renamed.

## Share cards

Share card widgets can export PNGs through the download button in the card header. The desktop app uses native export when available; browser environments fall back to frontend canvas export. The exported image size is `1080 x 1350`.

| Card | `type` | Content |
| --- | --- | --- |
| AI Usage Wrapped | `share-usage-wrapped` | Total tokens, requests, estimated cost, cache ratio, longest activity streak, top model, top provider, peak day. |
| CCR Route Map | `share-route-map` | Main client-to-provider/model route relationships, plus client, provider, and model counts. |
| Model Leaderboard | `share-model-leaderboard` | Models ranked by tokens. |
| AI Fuel Cockpit | `share-fuel-cockpit` | Up to 3 account quota gauges. Requires account / usage connectors. |
| Token Calendar Poster | `share-token-calendar` | Contribution-calendar style token activity poster. |
| Spend Receipt | `share-spend-receipt` | Estimated cost, requests, tokens, latency, and success rate for the selected range. |

## Data sources and troubleshooting

| Symptom | Likely cause | What to do |
| --- | --- | --- |
| Requests, tokens, or cost are 0 | No requests went through CCR in the selected range, or usage capture has not recorded data yet. | Try `24h` / `7d`, and confirm the client is actually using CCR. |
| Cost shows `$0.00` | The model has no pricing data, or usage is very small. | Check model catalog matching and provider model names; values under 0.01 USD are shown with extra decimals. |
| Success rate or errors look unexpected | The overview only aggregates request results captured by CCR. | Compare with records on the Logs page. |
| Account balance is empty | No account connector exists, or `Fetch usage` failed. | Test account / usage field mapping in provider configuration. |
| Distribution charts have no data | Request logs lack model, provider, or token information. | Confirm requests go through CCR and upstream responses include token usage. |
| PNG export fails | Canvas export is unavailable, the element has no size, or the save dialog was canceled. | Retry in the desktop app, and make sure the card is visible and not resized too small. |
