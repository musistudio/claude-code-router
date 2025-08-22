# GPT-5 Reasoning Parameter Debug Session - Knowledge Base & Action Plan

## 🎯 Core Problem Statement

Claude Code interactive mode consistently fails with "Unknown parameter: 'reasoning'" error when using "Think hard" prompts through CCR → GPT-5, while print mode (`-p`) succeeds.

## 📋 Crucial Knowledge & Verified Facts

### **Environment Setup**
- **CCR Version**: Latest built from `/Users/fredrikbranstrom/ccr-dev`
- **LLMS Package**: v1.0.26 via yalc from `/Users/fredrikbranstrom/llms-dev`
- **Transformer Order**: Fixed to `["reasoning", "openai"]` in config.json
- **CCR Config**: Intentionally missing `"background"` route to test main GPT-5 routing first

### **Transformer Chain Status**
- ✅ **Reasoning transformer is registered** (visible in startup logs)
- ✅ **Transformer order fixed** from `["openai", "reasoning"]` to `["reasoning", "openai"]`
- ✅ **Reasoning transformer logic updated** to handle `reasoning: {effort: "..."}` → `reasoning_effort: "..."`
- ✅ **Direct curl tests work** (reasoning parameter gets stripped out entirely)

### **Observed Behavior Patterns**
- ✅ **`claude -p "Think hard..."` print mode**: Works consistently, outputs to stdout, no reasoning parameter errors
- ❌ **`claude "Think hard..."` interactive mode (default)**: Fails consistently with "Unknown parameter: 'reasoning'"
- ❌ **`claude --continue` (resume session)**: When resuming with "Think hard" prompts, also fails with reasoning parameter error
- ✅ **Direct CCR curl tests**: Work but reasoning parameter disappears entirely

### **Log Evidence from 11:11 Requests**
- **Successful Request (reqId="req-2")**: Complex conversation with tools, worked fine
- **Failed Request (reqId="req-1")**: Simple "Think hard" prompt, failed despite NO reasoning parameter visible in final request logs
- **Critical Discovery**: Failed request shows clean final request body but still gets OpenAI reasoning parameter error

## 🔍 Key Hypotheses to Verify

### **PRIMARY HYPOTHESIS (User's)**
**Print Mode Uses Background Routing, Interactive Uses Main Routing**
- `claude -p` (print mode) → background route → falls back to Claude Haiku (no reasoning) → Works
- `claude` (interactive mode, default) → main route → GPT-5 (adds reasoning parameters) → Fails
- `claude --continue` (resume session) → main route → GPT-5 (adds reasoning parameters) → Fails
- **Testable**: Check actual models used in logs for each mode

### **SECONDARY HYPOTHESES**

**1. Request Type Differentiation**
- Simple prompts vs tool-heavy conversations get different routing
- Background requests vs main conversation requests handled differently

**2. Session Context Dependency**
- Fresh sessions behave differently than continued sessions
- Parameter addition happens at session level, not request level

**3. Hidden Parameter Addition**
- Reasoning parameters added after final logging point
- Claude Code client library adding parameters not visible in CCR logs

**4. Transformer Chain Bypass**
- Some request types bypass transformer chain entirely
- Race conditions causing inconsistent transformer execution

## 🎯 Structured Verification Plan

### **Phase 1: Model Routing Verification**
**Objective**: Confirm which models are actually used in each mode

**Tasks:**
1. **Subagent A**: Analyze CCR router logic for print vs interactive mode differences
2. **Test**: Monitor logs during `claude -p` vs `claude --continue` to identify actual models used
3. **Verify**: Background route fallback behavior when route is undefined

### **Phase 2: Parameter Flow Analysis**
**Objective**: Trace exact point where reasoning parameters are added/removed

**Tasks:**
1. **Subagent B**: Deep dive into Claude Code client → CCR request flow
2. **Add Debug Logging**: Insert logging at every transformer stage
3. **Compare**: Request bodies at different pipeline stages for failed vs successful requests

### **Phase 3: Session State Investigation**
**Objective**: Determine if session persistence affects parameter handling

**Tasks:**
1. **Test**: Fresh `claude` (new interactive session) vs `claude --continue` (resume last session) behavior
2. **Subagent C**: Analyze session state management in Claude Code
3. **Verify**: Whether conversation context affects routing decisions

### **Phase 4: Client Library Analysis**
**Objective**: Check if Claude Code adds reasoning parameters at client level

**Tasks:**
1. **Subagent D**: Examine Claude Code source for reasoning parameter injection
2. **Network Trace**: Capture actual HTTP requests to verify parameter presence
3. **Version Check**: Confirm Claude Code version and recent changes

## 🔬 Immediate Next Steps

1. **Assign 4 subagents** to verify the core hypotheses above
2. **Set up detailed logging** to capture model routing decisions
3. **Run controlled tests** comparing print vs interactive mode with identical prompts
4. **Document all findings** in this single source of truth

## 📊 Success Criteria

**Verification Complete When:**
- [ ] Confirmed which models are used in each mode
- [ ] Identified exact point of reasoning parameter addition
- [ ] Understood why transformer chain behaves inconsistently
- [ ] Reproduced the issue with clear logging evidence
- [ ] Validated or refuted the background routing hypothesis

**Problem Solved When:**
- [ ] Interactive "Think hard" prompts work consistently
- [ ] No more "Unknown parameter: 'reasoning'" errors
- [ ] Reasoning transformer chain functions reliably for all request types

---

## 📝 Research Log

*This section will be updated with findings from each verification phase*

### **Research Session 1 - Initial Analysis** *(2025-08-21)*
- Discovered transformer order issue and fixed to `["reasoning", "openai"]`
- Identified that direct curl tests work but reasoning parameter gets stripped entirely
- Found inconsistent behavior between print mode (works) and interactive mode (fails)
- Located critical log evidence showing failed requests have clean request bodies but still generate reasoning parameter errors

### **Research Session 2 - TRANSFORMER CHAIN BUG FOUND & FIXED** *(2025-08-22)*

**🎯 ACTUAL ROOT CAUSE - TRANSFORMER METHOD MISMATCH:**

**The Real Bug:**
- LLMS routes.ts called `transformRequestIn()` but transformers implement `transformRequestOut()`
- Provider transformer chain was **completely bypassed** - no transformers ran at all
- Anthropic transformer (main endpoint) created reasoning object, but cleanup transformers never executed

**Error Progression (All Fixed):**
1. ✅ "Unknown parameter: 'reasoning'" → Fixed transformer method names
2. ✅ "Unknown parameter: 'debug_reasoning_input'" → Removed debug parameter  
3. 🔄 "Missing required parameter: 'tools[0].function.name'" → **Current: Tools format issue**

**Working Transformer Chain:**
1. **Anthropic Transformer** (endpoint `/v1/messages`): `thinking` → `reasoning` object
2. **Reasoning Transformer** (provider chain): `reasoning` object → `reasoning_effort` string + cleanup
3. **OpenAI Transformer** (provider chain): Final parameter cleanup + tool format conversion

**Fixes Applied:**
- Changed `transformRequestIn` → `transformRequestOut` in routes.ts:109,113
- Removed debug parameter from reasoning transformer
- All transformers now execute in correct sequence

**Current Status:** ✅ **REASONING PARAMETERS FULLY FIXED** - Now debugging tools format