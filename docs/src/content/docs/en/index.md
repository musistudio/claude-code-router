---
title: Claude Code Router Guide
pageTitle: Guide
eyebrow: Getting Started
lead: A hands-on, step-by-step guide to getting Claude Code Router running. We start from the download, add your first model, wire an agent into CCR, and actually watch a request flow through it. You will not need to edit any config file by hand.
---

If this is your first time with CCR, read it top to bottom — about ten minutes and the whole pipeline will be live. If you already know the basics, jump straight to the section you need. Every step includes a "how to tell it worked" check so you never have to guess whether you did it right.

## What CCR Helps You Do

In one sentence: **it lets you manage the models and keys used by Claude Code, Codex, ZCode, and other agents in one place, then choose the right model for each kind of work.**

Why that's worth it:

- No more configuring the model and key in every single agent.
- Different work can use different models: cheap fast models for simple tasks, stronger models for hard problems, multimodal models for images, and search-capable models when you need fresh info.
- When one model fails, CCR can switch to a backup automatically.
- Logs show which model each request used, whether it succeeded, and where your spend is going.

The steps below walk you through three things: connecting a model provider, setting up routing, and making your agents use those CCR settings. For normal use, you can stay in the app and follow the steps without editing config files by hand.

## Step 1: Install And Start CCR

### Download And Install

1. Open the [GitHub Releases](https://github.com/musistudio/claude-code-router/releases) page.
2. Grab the package for your platform:
   - macOS: `.dmg` or `.zip`
   - Windows: `.exe`
   - Linux: `.AppImage`
3. Install and launch **Claude Code Router** like any normal app.

### Start CCR

Once the app is open, go to the **Server** page and click **Start**.

> **How to tell it worked:** The Server page shows CCR running. If you want it to start automatically whenever the app opens, turn on **Auto start**.

CCR itself is now running, but it cannot handle requests yet because you have not connected a model provider. That's the next step.

## Step 2: Connect Your First Provider

A Provider is the upstream model service that CCR forwards requests to — OpenRouter, DeepSeek, Z.AI, or anything that speaks the OpenAI / Anthropic / Gemini protocols.

### Add A Provider

1. Go to **Providers** and click **Add Provider**.
2. First, pick a **Provider preset** from the built-in list. Presets are nice because they auto-fill the common Base URL, icon, and protocol so you don't have to look them up. If your service isn't listed, choose **Other / custom API endpoint**.
3. Fill in the fields:
   - **Name**: the label shown inside CCR. Keep it short and recognizable, like `openrouter` or `deepseek`.
   - **Base URL**: the upstream endpoint. For custom providers, double-check this includes the correct API path.
   - **Protocol**: the protocol the upstream actually supports. Get this wrong and the connectivity check usually fails. If you're unsure, run the protocol probe below.
   - **API Key**: your key. One key lives here; use Credentials only when you need several.
   - **Models**: list the models this provider should expose to CCR. The model picker reads from here.
4. Don't save just yet — run the connectivity checks first.

### Picking A Protocol

| Protocol | When to use it |
| --- | --- |
| OpenAI Chat Completions | Almost any OpenAI-compatible service (most common) |
| OpenAI Responses | Services that support the Responses API |
| Anthropic Messages | Anthropic itself, or services compatible with it |
| Gemini Generate Content | Gemini itself, or services compatible with it |

> **Not sure which protocol?** Run the built-in Protocol probe and let it scan the Base URL. The result is a hint, not a verdict — confirm against the provider's docs and the connectivity check.

### Three Checks Before You Save

Catching problems here keeps them from masquerading as Routing or Agent issues later:

1. **Protocol probe**: confirm which protocols the Base URL actually supports.
2. **Model connectivity check**: send a test request to one or two models and see if they respond.
3. **Account usage test** (optional): if you've enabled usage meters, confirm balance and quota come back correctly.

When all three are green, hit save.

> **How to tell it worked:** The provider appears in your list and at least one model shows as available. Fire off a test request and you should get a normal response back.

### Want Multiple Keys? (Optional)

A single key is fine for personal use. For a team or high-volume traffic, open **Credentials** and add several — CCR rotates them for you:

1. Open **Credentials** in the provider form.
2. Click **Add credential**.
3. Give each key a **Label** so you can recognize it in Logs.
4. Set **Priority**: lower numbers are tried first.
5. Set **Weight**: at the same priority, higher weight gets more requests.
6. If a key has quota limits, fill in **Limits** so you can see when it's near the cap.
7. Save, send a few test requests, then filter Logs by Credential to confirm rotation behaves as expected.

### Want To See Balance In The Dashboard? (Optional)

If you'd like Overview to display a provider's balance and remaining quota, turn on **Account / Usage**:

1. Pick a usage connector. Prefer a built-in standard endpoint when one exists; fall back to HTTP JSON or a plugin otherwise.
2. Fill in auth mode and endpoint.
3. Click **Test** to pull one reading.
4. From the result, select the fields you care about (balance, remaining quota, used amount, reset time, etc.).
5. Back in Overview, add an **Account balance** widget.

> **Security note:** Never send your provider API key to an untrusted usage endpoint. Verify the domain and permission scope of any custom endpoint before filling it in.

CCR now knows which models are available. What it doesn't know yet is which one to use — that's routing.

## Step 3: Configure Routing (Which Model Handles What)

Go to the **Routing** page. This is where you decide **which model handles which kind of request.**

The one item that matters most is **Default route** — the fallback model used when no special rule matches. Set this and you already have a working minimal config.

### Recommended Order

1. **Default**: a stable model that can carry the main workload. This is your workhorse.
2. **Background**: a cheap, fast model for summaries, context compaction, and other low-priority work.
3. **Thinking**: a strong reasoning model for tasks that need depth.
4. **Long context**: a large-context model plus the threshold (how many tokens trigger the switch).
5. **Image**: a multimodal or Fusion model for image tasks, if you want those routed separately.
6. **Web search**: a Fusion model for search-augmented work, if applicable.
7. **Fallback**: what happens when the chosen model fails. A common pattern is to retry first, then walk a model chain of backups.

> **For your first setup:** Just set Default. You can come back and add Background, Thinking, and the rest whenever you actually need them.

### Want Finer Control? (Optional)

Click **Add Routing Rule**. What each rule type is for:

| Rule type | Use when |
| --- | --- |
| model-prefix | The client sends a specific model-name prefix and you want to route those requests apart |
| subagent | You want to route by subagent signal |
| thinking / long-context / image / web-search | You want to route by workload type |
| condition | You want to match on request fields, headers, or body content |
| rewrite | You need to adjust request-body fields for a compatibility edge case |

> **How to tell it worked:** Save, send any request, then open **Logs** and read the `request model`, `resolved provider`, `resolved model`, and status code on that row. If it didn't hit the model you expected, check rule order, match conditions, and fallback first.

CCR now knows both *which models exist* and *which one each request should use*. The last step is making your agent actually send its traffic through CCR.

## Step 4: Point Your Agent At CCR (Profiles)

Go to the **Profiles** page. A Profile lets a chosen agent (Claude Code / Codex / ZCode) use the models and routing settings you configured in CCR, so its requests can be recorded and managed there.

Before you start, two options that apply to every profile:

- **Scope**:
  - **Only opened from CCR**: traffic only goes through CCR when you launch the agent from inside CCR. Your system's default agent setup is untouched. **Strongly recommended for your first try** — easy to experiment, easy to walk back.
  - **System default**: the agent uses CCR by default. Switch to this once you're confident the setup is stable.
- **Surface**: APP, CLI, or automatic — pick based on how you intend to start the agent.
- **Model**: can be a provider model or a Fusion model.

> **One habit to keep:** After you Apply, launch the agent from CCR's "open agent" button. That's what lets Bot and app-related features work.

### Claude Code

1. Select **Claude Code** in Profiles.
2. Pick the **Model** for normal requests.
3. If you want a cheaper model for lightweight background work, set **Small fast model**.
4. Confirm **Settings file** points at your local Claude Code settings path (the default is usually right).
5. Add **Env** variables if you need any.
6. Click **Apply**.
7. Launch Claude Code via **Open Agent** from CCR.

> **Verify:** Send one request, then open **Logs**. The Client should read Claude Code, and the provider/model should match your Routing. If so, the whole chain is live.

### Codex

1. Select **Codex** in Profiles.
2. Confirm **Provider ID** and **Provider Name** (defaults are usually fine).
3. Pick the **Model** — a provider model or a Fusion model.
4. Confirm **Config file** (the default is Codex's config path).
5. If you use a specific Codex CLI build, fill in **Codex CLI path** and **Codex home**; otherwise leave them.
6. Toggle **CLI middleware** and **Show all sessions** as needed.
7. Click **Apply** and open Codex from CCR.

Use **Only opened from CCR** while trialing. Switch to **System default** once you're happy.

### ZCode

ZCode uses the app surface. Focus on **Model**, **Provider ID**, **Provider Name**, and whether you open it from CCR. The Codex-CLI-only fields don't apply here.

### Reuse An Agent You're Already Logged Into (Optional)

If your machine is already logged into Claude Code, Codex, or ZCode, you can import it from **Providers** as a **Local Agent Provider**. It then shows up in the model picker like any normal provider — handy for reusing an existing local authorization instead of fetching a new key.

At this point you have a **complete, working minimal system**: providers connected → routing set → agent wired in. Next, let's open the observability panels and confirm everything really is behaving the way you configured.

## Step 5: Open The Observability Panels And Confirm Traffic

The goal of this step is to make things *visible* — whether requests are arriving, which model they hit, how much they cost, and whether anything errored.

### Turn The Switches On First

Overview can't show data until CCR is allowed to record it. Go to **Settings → Observability**:

1. Turn on **Request logs** — this feeds Logs and most Overview widgets. **Turn it on.**
2. Turn on **Agent analysis** if you want agent-level summaries in Observability.
3. **Capture network** (under Server → Proxy) is only for inspecting raw traffic. Turn it on solely while debugging, and turn it off when you're done — it records more complete, and therefore more sensitive, information.

### What To Look At: Overview

Go to **Overview** and click **Edit widgets** to add components. The most useful ones:

| Widget | The question it answers |
| --- | --- |
| System status | Is the gateway running, is there recent activity |
| Requests / Success rate | How much traffic, what's the success rate |
| Estimated cost | How much money have I spent |
| Token mix | Input / output / cache / reasoning token split |
| Model distribution | Which models get used the most |
| Provider analysis | Which provider has the most traffic, highest latency, most errors |
| Account balance | How much balance and quota is left per provider |

You can drag widgets around, resize them, switch display variants, delete, or reset to the default layout. A few ready-made layouts:

- **Daily glance:** System status, Requests, Success rate, Usage trend, Provider analysis.
- **Cost watch:** Estimated cost, Token mix, Model distribution, Account balance.
- **Performance hunt:** Average latency, Errors, Provider analysis, Logs.

> **What Overview is for:** It answers "is the overall trend healthy." When a number looks off (a model's cost suddenly spikes, say), jump to Logs to inspect the individual requests. Don't try to diagnose a single failure from Overview alone.

### What To Look At: Logs

**Logs** is your main tool for debugging individual requests. It requires Request logs to be on.

The moves you'll use most:

- Filter by **status** to isolate successes or failures.
- Filter by **Provider / Model** to focus on one upstream.
- Filter by **Credential** to focus on one API key.
- Use the search box for request id, model name, request content, or response content.
- Click any row to drill into headers, request body, response body, errors, duration, tokens, and cost.

That's the full usage loop. You're now a competent CCR user. Everything below is "advanced" — come back to it when you need it.

## Advanced: Compose A Model With Tools Using Fusion

Go to the **Fusion** page. Its job: **bundle a base model with a tool capability into a new model option** you can then select in Routing or Profiles just like any normal model.

Typical use cases: give a model the ability to see images, search the web, or call an MCP tool.

### Create A Fusion Model

1. Click **Add Fusion**.
2. Enter a **New model** alias. Name it after the capability — something with a `vision`, `search`, or `tool` suffix.
3. Pick the **Base model** — the one that gives the final answer.
4. Pick a built-in tool or a custom MCP tool under **Tools**.
5. If you chose the image tool, configure the **Vision model**; if you chose search, configure the **Search provider** and its environment variables.
6. Save, then select this Fusion model in Routing or Profiles.

> **Play it safe:** Validate a Fusion model in a dedicated profile first. Once you're sure it behaves, promote it into global Default or a special route.

### Built-In Vision

Select `ccr-fusion-builtins / vision_understand`. Good for screenshot diagnosis, OCR, UI comparison, chart reading, and multi-image analysis.

Key points:

- The **Vision model** must genuinely support image understanding — it's the one that "reads" the image.
- The **Base model** is the one that "answers."
- Test with a single screenshot before dropping it into a complex agent workflow.

### Built-In Web Search

Select `ccr-fusion-builtins / web_search`. Supported providers: Brave, Bing, Google CSE, Serper, SerpAPI, Tavily, and Exa.

Key points:

- Pick a **Search provider** you've actually enabled.
- Fill the API key or environment variables it requires under **Provider configuration**.
- Test with a question that needs current information (today's weather somewhere, for instance).
- If search fails, check the search API key first, then look at Fusion tool errors in Logs.

### Custom MCP Tools

Click **Add custom MCP** and choose a transport:

- **stdio**: a local command-line tool. Fill Command, Arguments, Working directory, and Environment variables.
- **streamable-http / sse**: a remote MCP service. Fill URL and Headers.
- **Discover tools**: lists the tools the MCP server exposes.
- **Request timeout / Startup timeout**: bump these up if the tool or server is slow.

> **Tip:** Only wire stable, predictably-fast MCP tools into Fusion. Validate anything risky in a separate profile first.

## Advanced: Relay Agent Messages Into IM With Bots

Go to **Bots**, configure one, then attach it in **Profiles**.

A Bot forwards an agent's messages into IM, and can hand the task off to your phone after you've been idle for a while. Great for long-running jobs, checking progress remotely, or letting a human take over.

### Setup Steps

1. Open **Bots** and click **Add Bot**.
2. Pick a platform. Supported: Weixin iLink, WeCom, Slack, Discord, Telegram, LINE, Feishu, DingTalk.
3. Pick an auth method — the fields differ by platform (Bot Token, OAuth, App Secret, QR Login, and so on).
4. Fill in whatever the platform asks for: IDs, tokens, secrets, signing secrets, or robot code.
5. Save the bot.
6. Open **Profiles** and edit the agent profile you want to attach it to.
7. Turn on **Bot** and select the bot you just created.
8. Turn on **Forward agent messages** if you want the agent's output relayed too.
9. Turn on **Handoff**, set **Idle seconds**, and pick a scanned Wi-Fi or Bluetooth target if you want phone handoff.

> **Note:** Bots currently only forward agent messages produced inside an app opened through CCR. Messages from the CLI are not forwarded. Handoff target scanning is available in the Electron desktop app.

### Per-Platform Guides

Every platform has its own page with the full walk-through (how to create the app on the platform, a field-by-field mapping, and a troubleshooting FAQ):

- [Slack](/en/relay-agents-in-im-with-bots/slack)
- [Discord](/en/relay-agents-in-im-with-bots/discord)
- [Telegram](/en/relay-agents-in-im-with-bots/telegram)
- [LINE](/en/relay-agents-in-im-with-bots/line)
- [Weixin](/en/relay-agents-in-im-with-bots/weixin-ilink)
- [WeCom](/en/relay-agents-in-im-with-bots/wecom)
- [Feishu](/en/relay-agents-in-im-with-bots/feishu)
- [DingTalk](/en/relay-agents-in-im-with-bots/dingtalk)

## When Something Goes Wrong, Look Here

CCR gives you three debugging surfaces: **Logs** (request history), **Observability** (agent summaries), and **Networking** (temporary raw captures).

### Quick Reference

| Symptom | Check first |
| --- | --- |
| Agent isn't using CCR | Is the Server running, did you Apply the profile, did you open the agent from CCR, is the Scope right |
| Request hits the wrong model | Routing Default, rule order, match conditions, fallback — then resolved model in Logs |
| Provider auth fails (401/403) | API key, credential, Base URL, protocol, extra headers |
| model not found (404) | Is the model in the provider's list, does the model Routing selected actually exist |
| Fusion tool never gets called | Fusion tool selection, does the Vision model support images, is the search key right, MCP Discover tools and timeout |
| Requests time out | Is the upstream itself slow, is a Fusion tool slow, did you set timeout too low |
| Cost suddenly spikes | Filter by model, then look at token mix and request body size |
| One key keeps failing | Filter by Credential; if it's really that key, disable it if needed |
| Bot receives no messages | Is Bot enabled in the profile, was the app opened from CCR, is Forward agent messages on, is the platform token still valid |
| Overview has no data | Are Request logs and Agent analysis on, have any new requests actually come in since |

### About Network Capture

If you need to inspect the rawest possible exchange (request/response summary, headers, query, body, raw), turn on **Server → Capture network** and open **Networking**. You can pause, resume, refresh, and clear captures.

> **Reminder:** Network capture records very complete — and therefore sensitive — information. **Turn it on only while debugging, and off when you're done.** Don't leave it running long-term.

## A Few Habits Worth Keeping

- **Treat secrets as secrets.** API keys, bot tokens, secrets, and usage endpoints are sensitive. Configure them only in a trusted environment, and never send them to an unverified service.
- **Test before you change globals.** Before touching global Routing or Default, validate the change in a separate profile first. Saves you from disrupting an agent that's actively in use.
- **Skim Logs now and then.** A periodic glance at errors, tokens, cost, and latency catches problems before they grow.
- **Keep backup keys for important providers.** Give critical providers several Credentials with priority, weight, and limits, so one dead key doesn't take everything down.
- **Verify deeplinks before importing.** Before importing a provider via a `ccr://provider?...` link, glance at the source, Base URL, protocol, and model list, then confirm.

---

That's the whole loop: **connect providers → set routing → wire in an agent → turn on observability → extend as needed.** From here it's just usage — come back to whichever section matches the problem in front of you. Enjoy.
