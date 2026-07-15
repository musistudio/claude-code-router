import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import {
  Activity,
  Clock3,
  Globe2,
  ListChecks,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Webhook,
  X
} from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AutomationDefinition,
  AutomationListResult,
  AutomationPollCondition,
  AutomationTrigger,
  AutomationTriggerType
} from "../../../../shared/automation-types";
import { getSidebarProjectLabel, type SidebarProject } from "../../../../shared/sidebar-data";
import type { AgentProviderOption } from "../utils/core";

type AutomationFormState = {
  approvalMode: "auto" | "full" | "request";
  concurrencyPolicy: "queue" | "skip";
  cronExpression: string;
  enabled: boolean;
  every: string;
  id: string;
  model: string;
  name: string;
  pollBody: string;
  pollConditionType: "json-equals" | "json-exists" | "text-contains";
  pollDedupeKeyPath: string;
  pollMethod: "GET" | "POST";
  pollPath: string;
  pollTriggerOnRepeatedMatch: boolean;
  pollUrl: string;
  pollValue: string;
  projectId: string;
  prompt: string;
  providerId: string;
  threadPolicy: "new" | "reuse";
  timezone: string;
  triggerType: AutomationTriggerType;
  webhookSecret: string;
  webhookSlug: string;
};

const defaultCronExpression = "0 * * * * *";
const defaultEvery = "1m";
const pollMethodOptions = [
  { label: "GET", value: "GET" },
  { label: "POST", value: "POST" }
];

export function AutomationsPage({
  agentProviders,
  leftOpen,
  projects
}: {
  agentProviders: AgentProviderOption[];
  leftOpen: boolean;
  onBack: () => void;
  projects: SidebarProject[];
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [automations, setAutomations] = useState<AutomationDefinition[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [webhookBaseUrl, setWebhookBaseUrl] = useState<string | null>(null);
  const defaultDraftName = t("automations.new");
  const previousDefaultDraftNameRef = useRef(defaultDraftName);
  const [draft, setDraft] = useState<AutomationFormState>(() => createDefaultDraft(agentProviders, projects, defaultDraftName));
  const [dialogOpen, setDialogOpen] = useState(false);
  const selectedProvider = agentProviders.find((provider) => provider.id === draft.providerId) ?? agentProviders[0];
  const webhookUrl = draft.triggerType === "webhook" && webhookBaseUrl && draft.webhookSlug
    ? `${webhookBaseUrl}/${draft.webhookSlug}`
    : "";

  const applyListResult = useCallback((result: AutomationListResult) => {
    setAutomations(result.automations);
    setWebhookBaseUrl(result.webhookBaseUrl);
  }, []);

  const reloadAutomations = useCallback(async () => {
    const api = window.agentConsole?.automations;
    if (!api) return;
    applyListResult(await api.list());
  }, [applyListResult]);

  useEffect(() => {
    reloadAutomations().catch((error) => {
      console.warn("[automation] Failed to load automations.", error);
    });
  }, [reloadAutomations]);

  useEffect(() => {
    const previousDefaultDraftName = previousDefaultDraftNameRef.current;
    previousDefaultDraftNameRef.current = defaultDraftName;
    setDraft((currentDraft) => {
      if (currentDraft.id || currentDraft.name !== previousDefaultDraftName) {
        return currentDraft;
      }
      return {
        ...currentDraft,
        name: defaultDraftName
      };
    });
  }, [defaultDraftName]);

  useEffect(() => {
    const api = window.agentConsole?.automations;
    if (!api?.onEvent) return undefined;
    return api.onEvent(() => {
      reloadAutomations().catch((error) => {
        console.warn("[automation] Failed to reload after event.", error);
      });
    });
  }, [reloadAutomations]);

  const startNewAutomation = () => {
    setDraft(createDefaultDraft(agentProviders, projects, defaultDraftName));
    setDialogOpen(true);
  };

  const editAutomation = (automation: AutomationDefinition) => {
    setDraft(formStateFromAutomation(automation, agentProviders, projects, defaultDraftName));
    setDialogOpen(true);
  };

  const saveAutomation = async () => {
    const api = window.agentConsole?.automations;
    if (!api) return;
    setSubmitting(true);
    try {
      const payload = automationPayloadFromDraft(draft, agentProviders, projects);
      const result = draft.id ? await api.update(payload as AutomationDefinition & { id: string }) : await api.create(payload);
      applyListResult(result);
      setDialogOpen(false);
      toast.success({ content: t("automations.saved"), title: t("automations.title") });
    } catch (error) {
      toast.error({ content: error instanceof Error ? error.message : String(error), title: t("automations.title") });
    } finally {
      setSubmitting(false);
    }
  };

  const deleteAutomation = async (id: string) => {
    if (!id) return;
    const api = window.agentConsole?.automations;
    if (!api) return;
    setSubmitting(true);
    try {
      applyListResult(await api.delete({ id }));
      setDraft(createDefaultDraft(agentProviders, projects, defaultDraftName));
      setDialogOpen(false);
      toast.success({ content: t("automations.deleted"), title: t("automations.title") });
    } catch (error) {
      toast.error({ content: error instanceof Error ? error.message : String(error), title: t("automations.title") });
    } finally {
      setSubmitting(false);
    }
  };

  const setEnabled = async (id: string, enabled: boolean) => {
    const api = window.agentConsole?.automations;
    if (!api || !id) return;
    setSubmitting(true);
    try {
      applyListResult(await api.setEnabled({ enabled, id }));
    } catch (error) {
      toast.error({ content: error instanceof Error ? error.message : String(error), title: t("automations.title") });
    } finally {
      setSubmitting(false);
    }
  };

  const runNow = async (id: string) => {
    const api = window.agentConsole?.automations;
    if (!api || !id) return;
    setSubmitting(true);
    try {
      applyListResult(await api.runNow({ id }));
      toast.success({ content: t("automations.runStarted"), title: t("automations.title") });
    } catch (error) {
      toast.error({ content: error instanceof Error ? error.message : String(error), title: t("automations.title") });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="automations-page flex h-full min-w-0 flex-col bg-background">
      <header className={cn("automations-header drag-region flex h-[52px] shrink-0 items-center justify-between bg-background px-4 pr-[58px]", !leftOpen && "pl-[118px]")}>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <ListChecks className="h-5 w-5 shrink-0 text-primary" />
          <h1 className="min-w-0 truncate text-[15px] font-semibold text-foreground">{t("automations.title")}</h1>
        </div>
      </header>

      <section className="automations-content min-h-0 flex-1 overflow-auto border-t border-border">
        <main className="mx-auto flex w-full max-w-[920px] flex-col px-7 py-7">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-[12px] font-semibold uppercase text-muted-foreground">{t("automations.tasks")}</div>
            <button
              aria-label={t("automations.new")}
              className="no-drag inline-flex h-8 items-center gap-1.5 rounded-[7px] bg-primary px-3 text-[12px] font-semibold text-primary-foreground shadow-[0_1px_2px_rgba(0,0,0,.12)] transition hover:brightness-[1.04] active:scale-[.98]"
              onClick={startNewAutomation}
              title={t("automations.new")}
              type="button"
            >
              <Plus className="h-4 w-4" />
              <span>{t("automations.new")}</span>
            </button>
          </div>

          <div className="space-y-2">
            {automations.length ? automations.map((automation) => (
              <div
                className="automation-card flex min-w-0 items-start justify-between gap-4 rounded-xl border border-border bg-card px-4 py-3.5"
                key={automation.id}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <TriggerIcon triggerType={automation.trigger.type} />
                    <span className="min-w-0 truncate text-[13px] font-medium text-foreground">{automation.name}</span>
                    <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", automation.enabled ? "bg-emerald-500" : "bg-muted-foreground/50")} />
                  </div>
                  <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="shrink-0 font-medium uppercase">{t("automations.trigger")}</span>
                    <span className="min-w-0 truncate">{formatTrigger(automation.trigger)}</span>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <button
                    className={cn(
                      "inline-flex h-8 items-center rounded-md border px-2.5 text-[12px] font-medium transition disabled:opacity-50",
                      automation.enabled
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                        : "border-border bg-card text-muted-foreground hover:bg-muted"
                    )}
                    disabled={submitting}
                    onClick={() => void setEnabled(automation.id, !automation.enabled)}
                    type="button"
                  >
                    {automation.enabled ? t("automations.enabled") : t("automations.disabled")}
                  </button>
                  <button
                    aria-label={t("automations.runNamed", { name: automation.name })}
                    className="grid h-8 w-8 place-items-center rounded-md border border-border bg-card text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
                    disabled={submitting}
                    onClick={() => void runNow(automation.id)}
                    title={t("automations.run")}
                    type="button"
                  >
                    <Play className="h-[13px] w-[13px]" />
                  </button>
                  <button
                    aria-label={t("automations.editNamed", { name: automation.name })}
                    className="grid h-8 w-8 place-items-center rounded-md border border-border bg-card text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
                    disabled={submitting}
                    onClick={() => editAutomation(automation)}
                    title={t("automations.edit")}
                    type="button"
                  >
                    <Pencil className="h-[13px] w-[13px]" />
                  </button>
                </div>
              </div>
            )) : (
              <div className="automation-empty-state flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/55 px-6 py-16 text-center">
                <div className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-accent text-primary">
                  <ListChecks className="h-5 w-5" />
                </div>
                <div className="text-[13px] font-medium text-foreground">{t("automations.noTasks")}</div>
                <button
                  className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-[7px] border border-border bg-card px-3 text-[12px] font-medium text-foreground shadow-[0_1px_2px_rgba(0,0,0,.05)] transition hover:bg-muted active:scale-[.98]"
                  onClick={startNewAutomation}
                  type="button"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t("automations.new")}
                </button>
              </div>
            )}
          </div>
        </main>
      </section>

      <AutomationTaskDialog
        agentProviders={agentProviders}
        draft={draft}
        onClose={() => setDialogOpen(false)}
        onDelete={draft.id ? () => void deleteAutomation(draft.id) : undefined}
        onRun={draft.id ? () => void runNow(draft.id) : undefined}
        onSave={() => void saveAutomation()}
        open={dialogOpen}
        projects={projects}
        selectedProvider={selectedProvider}
        setDraft={setDraft}
        submitting={submitting}
        webhookUrl={webhookUrl}
      />
    </div>
  );
}

function AutomationTaskDialog({
  agentProviders,
  draft,
  onClose,
  onDelete,
  onRun,
  onSave,
  open,
  projects,
  selectedProvider,
  setDraft,
  submitting,
  webhookUrl
}: {
  agentProviders: AgentProviderOption[];
  draft: AutomationFormState;
  onClose: () => void;
  onDelete?: () => void;
  onRun?: () => void;
  onSave: () => void;
  open: boolean;
  projects: SidebarProject[];
  selectedProvider?: AgentProviderOption;
  setDraft: (draft: AutomationFormState) => void;
  submitting: boolean;
  webhookUrl: string;
}) {
  const { t } = useI18n();
  if (!open) return null;

  const approvalModeOptions = [
    { label: t("agent.permission.auto"), value: "auto" },
    { label: t("agent.permission.full"), value: "full" },
    { label: t("agent.permission.request"), value: "request" }
  ];
  const concurrencyPolicyOptions = [
    { label: t("automations.concurrency.skip"), value: "skip" },
    { label: t("automations.concurrency.queue"), value: "queue" }
  ];
  const threadPolicyOptions = [
    { label: t("automations.thread.reuse"), value: "reuse" },
    { label: t("automations.thread.new"), value: "new" }
  ];
  const triggerTypeLabels: Record<AutomationTriggerType, string> = {
    cron: t("automations.triggerType.cron"),
    interval: t("automations.triggerType.interval"),
    poll: t("automations.triggerType.poll"),
    webhook: t("automations.triggerType.webhook")
  };
  const title = draft.id ? t("automations.dialog.editTitle") : t("automations.dialog.newTitle");
  const handleKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/35 p-4 backdrop-blur-[2px]" onMouseDown={onClose}>
      <form
        aria-label={title}
        aria-modal="true"
        className="flex max-h-[88vh] w-full max-w-[860px] flex-col rounded-lg border border-border bg-popover text-foreground shadow-[0_18px_60px_rgba(0,0,0,.28)]"
        onKeyDown={handleKeyDown}
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
        role="dialog"
      >
        <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border px-4">
          <div className="min-w-0 truncate text-[14px] font-semibold text-foreground">{title}</div>
          <Button
            aria-label={t("automations.close")}
            className="h-7 w-7 shrink-0 bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            onClick={onClose}
            size="icon"
            title={t("automations.close")}
            type="button"
            variant="outline"
          >
            <X className="h-[14px] w-[14px]" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-auto p-4">
          <section className="space-y-3">
            <SectionTitle icon={Activity} title={t("automations.definition")} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={t("automations.name")}>
                <Input className="h-9 bg-background" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
              </Field>
              <Field label={t("automations.state")}>
                <Button
                  className={cn(
                    "h-9 px-3",
                    draft.enabled
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                      : "border-border bg-card text-muted-foreground hover:bg-muted"
                  )}
                  onClick={() => setDraft({ ...draft, enabled: !draft.enabled })}
                  type="button"
                  variant="outline"
                >
                  {draft.enabled ? t("automations.enabled") : t("automations.disabled")}
                </Button>
              </Field>
            </div>
          </section>

          <section className="space-y-3">
            <SectionTitle icon={Clock3} title={t("automations.trigger")} />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(["interval", "cron", "poll", "webhook"] as AutomationTriggerType[]).map((triggerType) => (
                <Button
                  className={cn(
                    "h-9 px-2",
                    draft.triggerType === triggerType ? "border-primary/30 bg-accent text-primary" : "border-border bg-card text-muted-foreground hover:bg-muted"
                  )}
                  key={triggerType}
                  onClick={() => setDraft({ ...draft, triggerType })}
                  type="button"
                  variant="outline"
                >
                  <TriggerIcon triggerType={triggerType} />
                  <span>{triggerTypeLabels[triggerType]}</span>
                </Button>
              ))}
            </div>
            <TriggerFields draft={draft} setDraft={setDraft} webhookUrl={webhookUrl} />
          </section>

          <section className="space-y-3">
            <SectionTitle icon={Globe2} title={t("automations.agent")} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={t("automations.provider")}>
                <Select
                  className="w-full"
                  onValueChange={(providerId) => setDraft({ ...draft, model: "", providerId })}
                  options={agentProviders.map((provider) => ({ label: provider.label, value: provider.id }))}
                  selectClassName="h-9 w-full max-w-none border border-input bg-background px-2.5"
                  value={draft.providerId}
                />
              </Field>
              <Field label={t("automations.model")}>
                <Select
                  className="w-full"
                  onValueChange={(model) => setDraft({ ...draft, model })}
                  options={[
                    { label: t("automations.default"), value: "" },
                    ...(selectedProvider?.models.map((model) => ({ label: model.label, value: model.value })) ?? [])
                  ]}
                  selectClassName="h-9 w-full max-w-none border border-input bg-background px-2.5"
                  value={draft.model}
                />
              </Field>
              <Field label={t("automations.project")}>
                <Select
                  className="w-full"
                  onValueChange={(projectId) => setDraft({ ...draft, projectId })}
                  options={[
                    { label: t("automations.currentWorkspace"), value: "" },
                    ...projects.map((project) => ({ label: getSidebarProjectLabel(project) || project.name, value: project.id }))
                  ]}
                  selectClassName="h-9 w-full max-w-none border border-input bg-background px-2.5"
                  value={draft.projectId}
                />
              </Field>
              <Field label={t("automations.approval")}>
                <Select
                  className="w-full"
                  onValueChange={(approvalMode) => setDraft({ ...draft, approvalMode: approvalMode as AutomationFormState["approvalMode"] })}
                  options={approvalModeOptions}
                  selectClassName="h-9 w-full max-w-none border border-input bg-background px-2.5"
                  value={draft.approvalMode}
                />
              </Field>
              <Field label={t("automations.thread")}>
                <Select
                  className="w-full"
                  onValueChange={(threadPolicy) => setDraft({ ...draft, threadPolicy: threadPolicy as AutomationFormState["threadPolicy"] })}
                  options={threadPolicyOptions}
                  selectClassName="h-9 w-full max-w-none border border-input bg-background px-2.5"
                  value={draft.threadPolicy}
                />
              </Field>
              <Field label={t("automations.concurrency")}>
                <Select
                  className="w-full"
                  onValueChange={(concurrencyPolicy) => setDraft({ ...draft, concurrencyPolicy: concurrencyPolicy as AutomationFormState["concurrencyPolicy"] })}
                  options={concurrencyPolicyOptions}
                  selectClassName="h-9 w-full max-w-none border border-input bg-background px-2.5"
                  value={draft.concurrencyPolicy}
                />
              </Field>
            </div>
            <Field label={t("automations.prompt")}>
              <Textarea
                className="min-h-[160px] resize-y bg-background text-[12px]"
                value={draft.prompt}
                onChange={(event) => setDraft({ ...draft, prompt: event.target.value })}
              />
            </Field>
          </section>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border px-4 py-3">
          <div className="flex items-center gap-2">
            {onRun ? (
              <Button
                className="h-9 bg-card"
                disabled={submitting}
                onClick={onRun}
                type="button"
                variant="outline"
              >
                <Play className="h-4 w-4" />
                <span>{t("automations.run")}</span>
              </Button>
            ) : null}
            {onDelete ? (
              <Button
                className="h-9 border-destructive/30 bg-card text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={submitting}
                onClick={onDelete}
                type="button"
                variant="outline"
              >
                <Trash2 className="h-4 w-4" />
                <span>{t("automations.delete")}</span>
              </Button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button
              className="h-9 bg-card"
              disabled={submitting}
              onClick={onClose}
              type="button"
              variant="outline"
            >
              {t("automations.cancel")}
            </Button>
            <Button
              className="h-9"
              disabled={submitting}
              type="submit"
            >
              <Save className="h-4 w-4" />
              <span>{t("automations.save")}</span>
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

function TriggerFields({
  draft,
  setDraft,
  webhookUrl
}: {
  draft: AutomationFormState;
  setDraft: (draft: AutomationFormState) => void;
  webhookUrl: string;
}) {
  const { t } = useI18n();
  const intervalOptions = [
    { label: t("automations.interval.1s"), value: "1s" },
    { label: t("automations.interval.5s"), value: "5s" },
    { label: t("automations.interval.10s"), value: "10s" },
    { label: t("automations.interval.30s"), value: "30s" },
    { label: t("automations.interval.1m"), value: "1m" },
    { label: t("automations.interval.5m"), value: "5m" },
    { label: t("automations.interval.15m"), value: "15m" },
    { label: t("automations.interval.1h"), value: "1h" },
    { label: t("automations.interval.1d"), value: "1d" }
  ];
  const pollConditionOptions = [
    { label: t("automations.condition.textContains"), value: "text-contains" },
    { label: t("automations.condition.jsonExists"), value: "json-exists" },
    { label: t("automations.condition.jsonEquals"), value: "json-equals" }
  ];

  if (draft.triggerType === "webhook") {
    return (
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("automations.slug")}>
          <Input className="h-9 bg-background" value={draft.webhookSlug} onChange={(event) => setDraft({ ...draft, webhookSlug: event.target.value })} />
        </Field>
        <Field label={t("automations.secret")}>
          <Input className="h-9 bg-background" value={draft.webhookSecret} onChange={(event) => setDraft({ ...draft, webhookSecret: event.target.value })} />
        </Field>
        <Field className="col-span-2" label={t("automations.url")}>
          <Input className="h-9 bg-background" readOnly value={webhookUrl} />
        </Field>
      </div>
    );
  }

  if (draft.triggerType === "poll") {
    return (
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("automations.cron")}>
          <Input className="h-9 bg-background" value={draft.cronExpression} onChange={(event) => setDraft({ ...draft, cronExpression: event.target.value })} />
        </Field>
        <Field label={t("automations.method")}>
          <Select
            className="w-full"
            onValueChange={(pollMethod) => setDraft({ ...draft, pollMethod: pollMethod as "GET" | "POST" })}
            options={pollMethodOptions}
            selectClassName="h-9 w-full max-w-none border border-input bg-background px-2.5"
            value={draft.pollMethod}
          />
        </Field>
        <Field className="col-span-2" label={t("automations.url")}>
          <Input className="h-9 bg-background" value={draft.pollUrl} onChange={(event) => setDraft({ ...draft, pollUrl: event.target.value })} />
        </Field>
        <Field label={t("automations.condition")}>
          <Select
            className="w-full"
            value={draft.pollConditionType}
            onValueChange={(pollConditionType) => setDraft({ ...draft, pollConditionType: pollConditionType as AutomationFormState["pollConditionType"] })}
            options={pollConditionOptions}
            selectClassName="h-9 w-full max-w-none border border-input bg-background px-2.5"
          />
        </Field>
        <Field label={t("automations.path")}>
          <Input className="h-9 bg-background" value={draft.pollPath} onChange={(event) => setDraft({ ...draft, pollPath: event.target.value })} />
        </Field>
        <Field label={t("automations.value")}>
          <Input className="h-9 bg-background" value={draft.pollValue} onChange={(event) => setDraft({ ...draft, pollValue: event.target.value })} />
        </Field>
        <Field label={t("automations.dedupePath")}>
          <Input className="h-9 bg-background" value={draft.pollDedupeKeyPath} onChange={(event) => setDraft({ ...draft, pollDedupeKeyPath: event.target.value })} />
        </Field>
        <Field className="col-span-2" label={t("automations.body")}>
          <Textarea className="min-h-[72px] resize-y bg-background text-[12px]" value={draft.pollBody} onChange={(event) => setDraft({ ...draft, pollBody: event.target.value })} />
        </Field>
      </div>
    );
  }

  if (draft.triggerType === "cron") {
    return (
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("automations.cron")}>
          <Input className="h-9 bg-background" value={draft.cronExpression} onChange={(event) => setDraft({ ...draft, cronExpression: event.target.value })} />
        </Field>
        <Field label={t("automations.timezone")}>
          <Input className="h-9 bg-background" value={draft.timezone} onChange={(event) => setDraft({ ...draft, timezone: event.target.value })} />
        </Field>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label={t("automations.every")}>
        <Select
          className="w-full"
          value={draft.every}
          onValueChange={(every) => {
            setDraft({ ...draft, cronExpression: cronExpressionForEvery(every), every });
          }}
          options={intervalOptions}
          selectClassName="h-9 w-full max-w-none border border-input bg-background px-2.5"
        />
      </Field>
      <Field label={t("automations.cron")}>
        <Input className="h-9 bg-background" value={draft.cronExpression} onChange={(event) => setDraft({ ...draft, cronExpression: event.target.value })} />
      </Field>
    </div>
  );
}

function Field({ children, className, label }: { children: ReactNode; className?: string; label: string }) {
  return (
    <label className={cn("block min-w-0 space-y-1.5", className)}>
      <span className="block text-[11px] font-medium uppercase text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function SectionTitle({ icon: Icon, title }: { icon: typeof Activity; title: string }) {
  return (
    <div className="flex items-center gap-2 text-[12px] font-semibold uppercase text-muted-foreground">
      <Icon className="h-4 w-4" />
      <span>{title}</span>
    </div>
  );
}

function TriggerIcon({ triggerType }: { triggerType: AutomationTriggerType }) {
  if (triggerType === "webhook") return <Webhook className="h-4 w-4 shrink-0" />;
  if (triggerType === "poll") return <RefreshCw className="h-4 w-4 shrink-0" />;
  return <Clock3 className="h-4 w-4 shrink-0" />;
}

function createDefaultDraft(agentProviders: AgentProviderOption[], projects: SidebarProject[], defaultName: string): AutomationFormState {
  return {
    approvalMode: "auto",
    concurrencyPolicy: "skip",
    cronExpression: defaultCronExpression,
    enabled: false,
    every: defaultEvery,
    id: "",
    model: "",
    name: defaultName,
    pollBody: "",
    pollConditionType: "text-contains",
    pollDedupeKeyPath: "",
    pollMethod: "GET",
    pollPath: "",
    pollTriggerOnRepeatedMatch: false,
    pollUrl: "",
    pollValue: "",
    projectId: projects[0]?.id ?? "",
    prompt: "",
    providerId: agentProviders[0]?.id ?? "codex",
    threadPolicy: "reuse",
    timezone: "",
    triggerType: "interval",
    webhookSecret: "",
    webhookSlug: "new-automation"
  };
}

function formStateFromAutomation(automation: AutomationDefinition, agentProviders: AgentProviderOption[], projects: SidebarProject[], defaultName: string): AutomationFormState {
  const base = createDefaultDraft(agentProviders, projects, defaultName);
  const trigger = automation.trigger;
  const pollCondition = trigger.type === "poll" ? trigger.condition : null;
  return {
    ...base,
    approvalMode: automation.task.approvalMode,
    concurrencyPolicy: automation.concurrencyPolicy,
    cronExpression: trigger.type === "cron" || trigger.type === "interval" || trigger.type === "poll" ? trigger.cronExpression : base.cronExpression,
    enabled: automation.enabled,
    every: trigger.type === "interval" ? trigger.every : base.every,
    id: automation.id,
    model: automation.task.model ?? "",
    name: automation.name,
    pollBody: trigger.type === "poll" ? trigger.request.body ?? "" : "",
    pollConditionType: pollCondition?.type ?? "text-contains",
    pollDedupeKeyPath: pollCondition?.dedupeKeyPath ?? "",
    pollMethod: trigger.type === "poll" ? trigger.request.method ?? "GET" : "GET",
    pollPath: pollCondition?.type === "json-equals" || pollCondition?.type === "json-exists" ? pollCondition.path ?? "" : "",
    pollTriggerOnRepeatedMatch: pollCondition?.triggerOnRepeatedMatch ?? false,
    pollUrl: trigger.type === "poll" ? trigger.request.url : "",
    pollValue: pollCondition?.type === "json-equals" || pollCondition?.type === "text-contains" ? pollCondition.value : "",
    projectId: automation.task.projectId ?? "",
    prompt: automation.task.prompt,
    providerId: automation.task.providerId,
    threadPolicy: automation.task.threadPolicy,
    timezone: trigger.type === "cron" || trigger.type === "interval" || trigger.type === "poll" ? trigger.timezone ?? "" : "",
    triggerType: trigger.type,
    webhookSecret: trigger.type === "webhook" ? trigger.secret ?? "" : "",
    webhookSlug: trigger.type === "webhook" ? trigger.slug : base.webhookSlug
  };
}

function automationPayloadFromDraft(draft: AutomationFormState, agentProviders: AgentProviderOption[], projects: SidebarProject[]): Partial<AutomationDefinition> {
  const project = projects.find((candidate) => candidate.id === draft.projectId);
  const trigger = triggerFromDraft(draft);
  return {
    concurrencyPolicy: draft.concurrencyPolicy,
    enabled: draft.enabled,
    id: draft.id || undefined,
    name: draft.name,
    task: {
      approvalMode: draft.approvalMode,
      model: draft.model || undefined,
      projectId: project?.id,
      projectName: project ? getSidebarProjectLabel(project) || project.name : undefined,
      projectPath: project?.path,
      prompt: draft.prompt,
      providerId: agentProviders.some((provider) => provider.id === draft.providerId) ? draft.providerId : "codex",
      threadPolicy: draft.threadPolicy
    },
    trigger
  };
}

function triggerFromDraft(draft: AutomationFormState): AutomationTrigger {
  if (draft.triggerType === "webhook") {
    return {
      secret: draft.webhookSecret || undefined,
      slug: draft.webhookSlug,
      type: "webhook"
    };
  }

  if (draft.triggerType === "poll") {
    return {
      condition: pollConditionFromDraft(draft),
      cronExpression: draft.cronExpression,
      request: {
        body: draft.pollMethod === "POST" ? draft.pollBody || undefined : undefined,
        method: draft.pollMethod,
        url: draft.pollUrl
      },
      timezone: draft.timezone || undefined,
      type: "poll"
    };
  }

  if (draft.triggerType === "cron") {
    return {
      cronExpression: draft.cronExpression,
      timezone: draft.timezone || undefined,
      type: "cron"
    };
  }

  return {
    cronExpression: draft.cronExpression,
    every: draft.every,
    timezone: draft.timezone || undefined,
    type: "interval"
  };
}

function pollConditionFromDraft(draft: AutomationFormState): AutomationPollCondition {
  if (draft.pollConditionType === "json-exists") {
    return {
      dedupeKeyPath: draft.pollDedupeKeyPath || undefined,
      path: draft.pollPath || undefined,
      triggerOnRepeatedMatch: draft.pollTriggerOnRepeatedMatch,
      type: "json-exists"
    };
  }
  if (draft.pollConditionType === "json-equals") {
    return {
      dedupeKeyPath: draft.pollDedupeKeyPath || undefined,
      path: draft.pollPath,
      triggerOnRepeatedMatch: draft.pollTriggerOnRepeatedMatch,
      type: "json-equals",
      value: draft.pollValue
    };
  }
  return {
    dedupeKeyPath: draft.pollDedupeKeyPath || undefined,
    triggerOnRepeatedMatch: draft.pollTriggerOnRepeatedMatch,
    type: "text-contains",
    value: draft.pollValue
  };
}

function formatTrigger(trigger: AutomationTrigger): string {
  if (trigger.type === "webhook") return `webhook /${trigger.slug}`;
  if (trigger.type === "interval") return `interval ${trigger.every} (${trigger.cronExpression})`;
  if (trigger.type === "poll") return `poll ${trigger.cronExpression}`;
  return `cron ${trigger.cronExpression}`;
}

function cronExpressionForEvery(every: string): string {
  switch (every) {
    case "1s":
      return "* * * * * *";
    case "5s":
      return "*/5 * * * * *";
    case "10s":
      return "*/10 * * * * *";
    case "30s":
      return "*/30 * * * * *";
    case "5m":
      return "0 */5 * * * *";
    case "15m":
      return "0 */15 * * * *";
    case "1h":
      return "0 0 * * * *";
    case "1d":
      return "0 0 0 * * *";
    case "1m":
    default:
      return defaultCronExpression;
  }
}
