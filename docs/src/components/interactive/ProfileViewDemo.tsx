/**
 * Docs wrapper rendering the REAL, UNMODIFIED ProfileView + AddProfileDialog.
 * The "Play tutorial" cursor: clicks "Add profile" → dialog opens → clicks the
 * ModelSelector → picks a model → clicks "Add" — the real intermediate form.
 * Includes demo providers so the ModelSelector has models to pick.
 */
import { useMemo, useState } from "react";
import { AddProfileDialog, ProfileView } from "@/pages/home/components/profiles";
import { BaseUiProvider } from "@/lib/baseui-provider";
import { AppI18nContext, appCopy } from "@/pages/home/shared/i18n";
import { fallbackConfig } from "@/pages/home/shared/fallbacks";
import { createProfileDraft } from "@/pages/home/shared/profiles";
import { profileAgentOptions } from "@/pages/home/shared/options";
import {
  DemoShell,
  readDemoLocale,
  sleep,
  VirtualCursor,
  createCursorApi,
  findByText,
} from "./demoRuntime";
import type { AppConfig, GatewayProviderConfig, ProfileConfig, ProfileRuntimeStatus } from "@ccr/core/contracts/app";
import type { AddProfileDraft } from "@/pages/home/shared/types";

const noop = () => {};

const DEMO_PROVIDERS: GatewayProviderConfig[] = [
  { name: "OpenAI", provider: "openai", type: "openai_chat_completions", api_base_url: "https://api.openai.com/v1", api_key: "sk-••••", models: ["gpt-4o", "gpt-4o-mini"] },
  { name: "Anthropic", provider: "anthropic", type: "anthropic_messages", api_base_url: "https://api.anthropic.com/v1", api_key: "sk-ant-••••", models: ["claude-sonnet-4-20250514"] },
];

const DEMO_CONFIG: AppConfig = { ...fallbackConfig, Providers: DEMO_PROVIDERS };

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/[\s_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "profile";
}

export default function ProfileViewDemo() {
  const locale = readDemoLocale();
  const [config, setConfig] = useState<AppConfig>(DEMO_CONFIG);
  const [draft, setDraft] = useState<AddProfileDraft>(() => createProfileDraft());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [cursor, setCursor] = useState({ x: -100, y: -100, clicking: false, visible: false });
  const cursorApi = useMemo(() => createCursorApi(setCursor), []);

  function openAddProfile() {
    setDraft(createProfileDraft());
    setDialogOpen(true);
  }
  function changeDraft(patch: Partial<AddProfileDraft>) {
    setDraft((d) => ({ ...d, ...patch }));
  }
  async function submitProfile(): Promise<boolean> {
    const profile = {
      id: slugify(draft.name || draft.agent),
      name: draft.name || draft.agent,
      agent: draft.agent,
      model: draft.model,
      enabled: true,
    } as ProfileConfig;
    setConfig((cfg) => ({ ...cfg, profile: { ...cfg.profile, profiles: [...(cfg.profile?.profiles ?? []), profile] } }));
    setDialogOpen(false);
    return true;
  }

  const canSubmit = Boolean(draft.model.trim());

  async function play() {
    if (playing) return;
    setPlaying(true);
    try {
      const waitFor = async (findFn: () => HTMLElement | null, ms = 3000): Promise<HTMLElement | null> => {
        let el: HTMLElement | null = null;
        const t0 = Date.now();
        while (Date.now() - t0 < ms) { el = findFn(); if (el) return el; await sleep(100); }
        return el;
      };

      // 1) click "Add profile" (text button — NO aria-label)
      const addBtn = await waitFor(() => findByText("button", ["添加配置", "Add profile"]));
      if (addBtn) await cursorApi.click(addBtn);
      await sleep(800);

      // 2) click the ModelSelector trigger (button[aria-haspopup="dialog"] in the dialog)
      const modelTrigger = await waitFor(() =>
        document.querySelector('[role="dialog"]')?.querySelector<HTMLElement>('button[aria-haspopup="dialog"]') ?? null
      );
      if (modelTrigger) await cursorApi.click(modelTrigger);

      // 3) click a model button in the ModelSelector popover (contains "gpt-4o")
      const modelBtn = await waitFor(() => findByText("button", ["gpt-4o"]), 4000);
      if (modelBtn) await cursorApi.click(modelBtn);
      // safety: ensure draft.model is set so canSubmit becomes true
      changeDraft({ model: "OpenAI/gpt-4o" });
      await sleep(600);

      // 4) click "Add" button (must be ENABLED — wait for canSubmit)
      const saveBtn = await waitFor(() => {
        const dlg = document.querySelector('[role="dialog"]');
        if (!dlg) return null;
        return Array.from(dlg.querySelectorAll<HTMLElement>("button")).find(
          (b) => {
            const t = (b.textContent || "").trim().toLowerCase();
            return (t === "添加" || t === "add") && !b.disabled;
          }
        ) ?? null;
      }, 5000);
      if (saveBtn) await cursorApi.click(saveBtn);
    } finally {
      cursorApi.hide();
      setPlaying(false);
    }
  }

  return (
    <AppI18nContext.Provider value={locale === "zh" ? appCopy.zh : appCopy.en}>
      <DemoShell
        locale={locale}
        title={{
          zh: "Agent 配置 — 为 Claude Code / Codex 等创建配置并选择默认模型",
          en: "Agent configuration — create a profile for Claude Code / Codex and choose its default model",
        }}
        onPlay={play}
        playing={playing}
      >
        <VirtualCursor state={cursor} />
        <BaseUiProvider>
          <div className="docs-demo-app-surface docs-demo-app-surface--manager">
            <ProfileView
              addProfile={openAddProfile}
              applyError=""
              config={config}
              copyProfileCliCommand={noop}
              editProfile={noop}
              openProfileApp={noop}
              profileRuntimeStatus={{ profiles: [] } as ProfileRuntimeStatus}
              removeProfile={noop}
              stopProfileApp={noop}
              updateProfileItem={noop}
            />
          </div>
          {dialogOpen && (
            <AddProfileDialog
              agentOptions={profileAgentOptions}
              botConfigs={[]}
              canSubmit={canSubmit}
              draft={draft}
              error=""
              mode="add"
              onChange={changeDraft}
              onCreateBot={noop}
              onClose={() => setDialogOpen(false)}
              providers={config.Providers ?? []}
              onSubmit={submitProfile}
            />
          )}
        </BaseUiProvider>
      </DemoShell>
    </AppI18nContext.Provider>
  );
}
