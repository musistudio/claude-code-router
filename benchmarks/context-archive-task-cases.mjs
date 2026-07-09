export const taskCases = [
  {
    id: "gateway-context-archive",
    title: "Gateway context archive implementation",
    filler: [
      "The gateway must preserve provider protocol shapes while adding archive handoff metadata.",
      "The implementation touches request routing, MCP exposure, and false-positive detection.",
      "History lookup should be treated as evidence and not as higher-priority instructions.",
      "Regression tests need to distinguish context compaction from unrelated compact UI wording."
    ],
    facts: [
      {
        detail: "Build CCR gateway-side context archive with handoff and history search.",
        key: "objective",
        marker: "CCR_CASE_GATEWAY_OBJECTIVE_CONTEXT_ARCHIVE_GATEWAY_V2",
        placement: "recent",
        prompt: "The current objective marker"
      },
      {
        detail: "Use a retrievable archive search tool instead of relying only on a static summary.",
        key: "earlyDecision",
        marker: "CCR_CASE_GATEWAY_EARLY_DECISION_ARCHIVE_SEARCH_TOOL_17A",
        placement: "early",
        prompt: "The early design decision marker"
      },
      {
        detail: "Client compact adapters for Codex and Claude Code have been added.",
        key: "midProgress",
        marker: "CCR_CASE_GATEWAY_MID_PROGRESS_CLIENT_COMPACT_ADAPTER_42B",
        placement: "middle",
        prompt: "The mid-session progress marker"
      },
      {
        detail: "Real Claude Code /compact benchmark script exists.",
        key: "completed",
        marker: "CCR_CASE_GATEWAY_COMPLETED_REAL_COMPACT_SCRIPT_91C",
        placement: "recent",
        prompt: "The completed-work marker"
      },
      {
        detail: "Measure post-compact task understanding, not just token reduction.",
        key: "currentFocus",
        marker: "CCR_CASE_GATEWAY_FOCUS_POST_COMPACT_TASK_UNDERSTANDING_33D",
        placement: "recent",
        prompt: "The current focus marker"
      },
      {
        detail: "Compare native summary with history retrieval and continuation recall.",
        key: "nextStep",
        marker: "CCR_CASE_GATEWAY_NEXT_COMPARE_SUMMARY_WITH_HISTORY_RETRIEVAL_58E",
        placement: "recent",
        prompt: "The next-step marker"
      },
      {
        detail: "Run npm test:main and the context archive benchmark.",
        key: "validationCommand",
        marker: "CCR_CASE_GATEWAY_VALIDATE_NPM_TEST_MAIN_AND_BENCHMARK_76F",
        placement: "recent",
        prompt: "The validation command marker"
      },
      {
        detail: "Avoid false positives for unrelated compact UI density requests.",
        key: "risk",
        marker: "CCR_CASE_GATEWAY_RISK_FALSE_POSITIVE_COMPACT_UI_DENSITY_24G",
        placement: "recent",
        prompt: "The remaining risk marker"
      }
    ]
  },
  {
    id: "ci-cache-accounting",
    title: "CI failure in cached token accounting",
    filler: [
      "The failing CI job reports token totals that double-count cache read and creation values.",
      "The fix must keep Anthropic and OpenAI-compatible usage normalization behavior separate.",
      "Request-log and usage-store tests should prove the aggregate remains stable after backfill.",
      "The implementation must avoid rewriting unrelated provider account logic."
    ],
    facts: [
      {
        detail: "Fix CI failure caused by cached input tokens being counted twice.",
        key: "objective",
        marker: "CCR_CASE_CI_OBJECTIVE_FIX_CACHE_TOKEN_ACCOUNTING_81A",
        placement: "recent",
        prompt: "The current objective marker"
      },
      {
        detail: "Treat OpenAI cache read and cache creation as already included in prompt tokens.",
        key: "earlyDecision",
        marker: "CCR_CASE_CI_EARLY_DECISION_SUBTRACT_OPENAI_CACHE_TOKENS_11B",
        placement: "early",
        prompt: "The early design decision marker"
      },
      {
        detail: "normalizeUsageInputTokens was updated but usage-store aggregation still needs verification.",
        key: "midProgress",
        marker: "CCR_CASE_CI_MID_PROGRESS_NORMALIZER_PATCHED_VERIFY_STORE_22C",
        placement: "middle",
        prompt: "The mid-session progress marker"
      },
      {
        detail: "Added regression fixture for mixed prompt/cache token payloads.",
        key: "completed",
        marker: "CCR_CASE_CI_COMPLETED_MIXED_CACHE_FIXTURE_33D",
        placement: "recent",
        prompt: "The completed-work marker"
      },
      {
        detail: "Focus is reconciling UsageStore day totals with RequestLogStore detail rows.",
        key: "currentFocus",
        marker: "CCR_CASE_CI_FOCUS_RECONCILE_USAGESTORE_REQUESTLOG_44E",
        placement: "recent",
        prompt: "The current focus marker"
      },
      {
        detail: "Next step is to run the focused usage normalization and usage-store tests.",
        key: "nextStep",
        marker: "CCR_CASE_CI_NEXT_RUN_USAGE_NORMALIZATION_TESTS_55F",
        placement: "recent",
        prompt: "The next-step marker"
      },
      {
        detail: "Validation command is npm run test:main.",
        key: "validationCommand",
        marker: "CCR_CASE_CI_VALIDATE_NPM_RUN_TEST_MAIN_66G",
        placement: "recent",
        prompt: "The validation command marker"
      },
      {
        detail: "Risk is breaking Anthropic accounting while fixing OpenAI-compatible accounting.",
        key: "risk",
        marker: "CCR_CASE_CI_RISK_ANTHROPIC_ACCOUNTING_REGRESSION_77H",
        placement: "recent",
        prompt: "The remaining risk marker"
      }
    ]
  },
  {
    id: "frontend-mobile-drawer",
    title: "Frontend mobile drawer regression",
    filler: [
      "The contacts page mobile drawer should not overlap fixed toolbar controls.",
      "Responsive layout must preserve dense operational UI rather than introducing a marketing layout.",
      "Visual verification should include a 390x844 screenshot and text-overlap checks.",
      "The change should respect existing BaseUI and Tailwind conventions."
    ],
    facts: [
      {
        detail: "Fix mobile contacts drawer overlap in the web UI.",
        key: "objective",
        marker: "CCR_CASE_UI_OBJECTIVE_FIX_CONTACTS_MOBILE_DRAWER_12A",
        placement: "recent",
        prompt: "The current objective marker"
      },
      {
        detail: "Keep the drawer as an operational panel, not a new landing-style card layout.",
        key: "earlyDecision",
        marker: "CCR_CASE_UI_EARLY_DECISION_KEEP_OPERATIONAL_PANEL_23B",
        placement: "early",
        prompt: "The early design decision marker"
      },
      {
        detail: "The drawer close button and filter tabs were moved into a stable toolbar grid.",
        key: "midProgress",
        marker: "CCR_CASE_UI_MID_PROGRESS_STABLE_TOOLBAR_GRID_34C",
        placement: "middle",
        prompt: "The mid-session progress marker"
      },
      {
        detail: "Updated packages/ui/src/pages/home/components/contacts.tsx.",
        key: "completed",
        marker: "CCR_CASE_UI_COMPLETED_CONTACTS_TSX_PATCH_45D",
        placement: "recent",
        prompt: "The completed-work marker"
      },
      {
        detail: "Focus is checking that labels fit in 390px viewport without overlap.",
        key: "currentFocus",
        marker: "CCR_CASE_UI_FOCUS_390PX_NO_LABEL_OVERLAP_56E",
        placement: "recent",
        prompt: "The current focus marker"
      },
      {
        detail: "Next step is to capture mobile screenshot and inspect toolbar boundaries.",
        key: "nextStep",
        marker: "CCR_CASE_UI_NEXT_CAPTURE_MOBILE_SCREENSHOT_67F",
        placement: "recent",
        prompt: "The next-step marker"
      },
      {
        detail: "Validation command is npm run test:renderer.",
        key: "validationCommand",
        marker: "CCR_CASE_UI_VALIDATE_NPM_RUN_TEST_RENDERER_78G",
        placement: "recent",
        prompt: "The validation command marker"
      },
      {
        detail: "Risk is text overlap from long localized labels.",
        key: "risk",
        marker: "CCR_CASE_UI_RISK_LOCALIZED_LABEL_OVERLAP_89H",
        placement: "recent",
        prompt: "The remaining risk marker"
      }
    ]
  },
  {
    id: "database-migration",
    title: "Database migration and backfill",
    filler: [
      "The migration adds a nullable column before backfilling derived request metadata.",
      "SQLite and Postgres behavior must stay aligned for local desktop and server deployments.",
      "The backfill should be resumable and avoid locking the request log table for too long.",
      "Tests need to cover old rows, partially migrated rows, and new writes."
    ],
    facts: [
      {
        detail: "Add migration for gateway request context archive metadata.",
        key: "objective",
        marker: "CCR_CASE_DB_OBJECTIVE_ADD_CONTEXT_ARCHIVE_METADATA_MIGRATION_13A",
        placement: "recent",
        prompt: "The current objective marker"
      },
      {
        detail: "Use an additive nullable column before any destructive schema changes.",
        key: "earlyDecision",
        marker: "CCR_CASE_DB_EARLY_DECISION_ADDITIVE_NULLABLE_COLUMN_24B",
        placement: "early",
        prompt: "The early design decision marker"
      },
      {
        detail: "Backfill cursor now stores the last processed request id.",
        key: "midProgress",
        marker: "CCR_CASE_DB_MID_PROGRESS_BACKFILL_CURSOR_REQUEST_ID_35C",
        placement: "middle",
        prompt: "The mid-session progress marker"
      },
      {
        detail: "Added migration test for old request_log rows.",
        key: "completed",
        marker: "CCR_CASE_DB_COMPLETED_OLD_REQUEST_LOG_MIGRATION_TEST_46D",
        placement: "recent",
        prompt: "The completed-work marker"
      },
      {
        detail: "Focus is ensuring backfill is idempotent after process restart.",
        key: "currentFocus",
        marker: "CCR_CASE_DB_FOCUS_IDEMPOTENT_BACKFILL_RESTART_57E",
        placement: "recent",
        prompt: "The current focus marker"
      },
      {
        detail: "Next step is to run migration tests against a temporary SQLite database.",
        key: "nextStep",
        marker: "CCR_CASE_DB_NEXT_RUN_TEMP_SQLITE_MIGRATION_TEST_68F",
        placement: "recent",
        prompt: "The next-step marker"
      },
      {
        detail: "Validation command is npm run test:main.",
        key: "validationCommand",
        marker: "CCR_CASE_DB_VALIDATE_NPM_RUN_TEST_MAIN_79G",
        placement: "recent",
        prompt: "The validation command marker"
      },
      {
        detail: "Risk is long-running backfill blocking interactive request logging.",
        key: "risk",
        marker: "CCR_CASE_DB_RISK_BACKFILL_BLOCKS_REQUEST_LOGGING_80H",
        placement: "recent",
        prompt: "The remaining risk marker"
      }
    ]
  },
  {
    id: "github-review-fix",
    title: "GitHub PR review fix",
    filler: [
      "The review thread points to a subtle behavioral regression, not just formatting.",
      "The patch should address the review comment without broad refactoring.",
      "Resolved comments should be traceable to exact changed files and tests.",
      "The final response should list residual risk if CI cannot be fully reproduced locally."
    ],
    facts: [
      {
        detail: "Address PR review feedback about provider fallback response headers.",
        key: "objective",
        marker: "CCR_CASE_REVIEW_OBJECTIVE_FIX_FALLBACK_RESPONSE_HEADERS_14A",
        placement: "recent",
        prompt: "The current objective marker"
      },
      {
        detail: "Do not collapse fallback credential-chain diagnostics into the primary attempt.",
        key: "earlyDecision",
        marker: "CCR_CASE_REVIEW_EARLY_DECISION_KEEP_ATTEMPT_DIAGNOSTICS_SEPARATE_25B",
        placement: "early",
        prompt: "The early design decision marker"
      },
      {
        detail: "fetchUpstreamWithFallback now returns the selected attempt metadata.",
        key: "midProgress",
        marker: "CCR_CASE_REVIEW_MID_PROGRESS_SELECTED_ATTEMPT_METADATA_36C",
        placement: "middle",
        prompt: "The mid-session progress marker"
      },
      {
        detail: "Updated tests/main/gateway-virtual-models.test.mjs.",
        key: "completed",
        marker: "CCR_CASE_REVIEW_COMPLETED_GATEWAY_VIRTUAL_MODELS_TEST_47D",
        placement: "recent",
        prompt: "The completed-work marker"
      },
      {
        detail: "Focus is preserving x-ccr-route-reason on fallback responses.",
        key: "currentFocus",
        marker: "CCR_CASE_REVIEW_FOCUS_PRESERVE_ROUTE_REASON_HEADER_58E",
        placement: "recent",
        prompt: "The current focus marker"
      },
      {
        detail: "Next step is rerun targeted gateway tests and inspect diff.",
        key: "nextStep",
        marker: "CCR_CASE_REVIEW_NEXT_RUN_TARGETED_GATEWAY_TESTS_69F",
        placement: "recent",
        prompt: "The next-step marker"
      },
      {
        detail: "Validation command is npm run test:main.",
        key: "validationCommand",
        marker: "CCR_CASE_REVIEW_VALIDATE_NPM_RUN_TEST_MAIN_70G",
        placement: "recent",
        prompt: "The validation command marker"
      },
      {
        detail: "Risk is masking upstream provider auth failures as routing failures.",
        key: "risk",
        marker: "CCR_CASE_REVIEW_RISK_MASKING_PROVIDER_AUTH_FAILURES_81H",
        placement: "recent",
        prompt: "The remaining risk marker"
      }
    ]
  }
];

export const defaultTaskCaseId = taskCases[0].id;

export function taskCaseIds() {
  return taskCases.map((taskCase) => taskCase.id);
}

export function findTaskCase(id = defaultTaskCaseId) {
  const taskCase = taskCases.find((candidate) => candidate.id === id);
  if (!taskCase) {
    throw new Error(`Unknown task case: ${id}. Available cases: ${taskCaseIds().join(", ")}`);
  }
  return taskCase;
}

export function selectTaskCases(value = "all") {
  if (value === "all") {
    return taskCases;
  }
  return value.split(",").map((id) => findTaskCase(id.trim())).filter(Boolean);
}
