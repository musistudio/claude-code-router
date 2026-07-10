export type AutomationTriggerType = "cron" | "interval" | "poll" | "webhook";

export type AutomationCronTrigger = {
  cronExpression: string;
  timezone?: string;
  type: "cron";
};

export type AutomationIntervalTrigger = {
  cronExpression: string;
  every: string;
  timezone?: string;
  type: "interval";
};

export type AutomationWebhookTrigger = {
  secret?: string;
  slug: string;
  type: "webhook";
};

export type AutomationPollCondition =
  | {
      dedupeKeyPath?: string;
      path?: string;
      triggerOnRepeatedMatch?: boolean;
      type: "json-exists";
    }
  | {
      dedupeKeyPath?: string;
      path: string;
      triggerOnRepeatedMatch?: boolean;
      type: "json-equals";
      value: string;
    }
  | {
      dedupeKeyPath?: string;
      triggerOnRepeatedMatch?: boolean;
      type: "text-contains";
      value: string;
    };

export type AutomationPollRequest = {
  body?: string;
  headers?: Record<string, string>;
  method?: "GET" | "POST";
  url: string;
};

export type AutomationPollTrigger = {
  condition: AutomationPollCondition;
  cronExpression: string;
  request: AutomationPollRequest;
  timezone?: string;
  type: "poll";
};

export type AutomationTrigger =
  | AutomationCronTrigger
  | AutomationIntervalTrigger
  | AutomationPollTrigger
  | AutomationWebhookTrigger;

export type AutomationApprovalMode = "auto" | "full" | "request";
export type AutomationConcurrencyPolicy = "queue" | "skip";
export type AutomationRunStatus = "failed" | "queued" | "running" | "skipped" | "succeeded";
export type AutomationThreadPolicy = "new" | "reuse";

export type AutomationTask = {
  approvalMode: AutomationApprovalMode;
  cwd?: string;
  effort?: string;
  model?: string;
  projectId?: string;
  projectName?: string;
  projectPath?: string;
  prompt: string;
  providerId: string;
  threadId?: string;
  threadPolicy: AutomationThreadPolicy;
  timeoutMs?: number;
  title?: string;
};

export type AutomationDefinition = {
  concurrencyPolicy: AutomationConcurrencyPolicy;
  createdAt: number;
  enabled: boolean;
  id: string;
  lastRunAt?: number;
  name: string;
  nextRunAt?: number;
  state?: Record<string, unknown>;
  task: AutomationTask;
  trigger: AutomationTrigger;
  updatedAt: number;
};

export type AutomationRunRecord = {
  automationId: string;
  durationMs?: number;
  error?: string;
  finishedAt?: number;
  id: string;
  providerId?: string;
  runId?: string;
  startedAt?: number;
  status: AutomationRunStatus;
  threadId?: string;
  triggerLabel?: string;
  triggerType: AutomationTriggerType | "manual";
  triggeredAt: number;
};

export type AutomationListResult = {
  automations: AutomationDefinition[];
  runs: AutomationRunRecord[];
  success: boolean;
  webhookBaseUrl: string | null;
};

export type AutomationMutationResult = AutomationListResult & {
  automation?: AutomationDefinition;
};

export type AutomationRunResult = AutomationListResult & {
  run: AutomationRunRecord;
};

export type AutomationEvent =
  | {
      automation: AutomationDefinition;
      type: "automation_changed";
    }
  | {
      automationId: string;
      run: AutomationRunRecord;
      type: "run_changed";
    };
