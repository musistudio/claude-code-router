/**
 * Docs wrapper that renders the REAL, UNMODIFIED ProvidersView + Add/Edit and
 * Delete dialogs from the UI package, wired to local state so the page is
 * fully interactive (add / edit / remove / enable-disable) — no UI source
 * changes, no backend. Bridge-only features (protocol probe, model discovery,
 * connection check, usage) safely no-op. Rendered client:only on an isolated
 * bare page (pages/guides/provider-app.astro) that loads the full UI stylesheet.
 */
import { useMemo, useState } from "react";
import { ProvidersView, AddProviderDialog, DeleteProviderDialog } from "@/pages/home/components/providers";
import { BaseUiProvider } from "@/lib/baseui-provider";
import { AppI18nContext, appCopy } from "@/pages/home/shared/i18n";
import {
  createProviderDraft,
  createProviderDraftFromProvider,
  mergeProviderModelLists,
  splitLines,
} from "@/pages/home/shared/providers";
import { setProviderPresets } from "@/pages/home/shared/external";
import type { AddProviderDraft } from "@/pages/home/shared/types";
import type { GatewayProviderConfig, ProviderAccountSnapshot } from "@ccr/core/contracts/app";
import {
  DemoShell,
  readDemoLocale,
  sleep,
  VirtualCursor,
  createCursorApi,
  findByAria,
  findByText,
  findInputByLabels,
} from "./demoRuntime";
// The UI's getProviderPresets() reads a runtime cache (shared/external.tsx) that
// the desktop app fills from the bridge on startup; with no bridge in docs it
// stays empty and the preset picker shows nothing. Seed it from the @ccr/core
// static list so the demo shows the real built-in presets.
import { getProviderPresets as getCoreProviderPresets } from "@ccr/core/providers/presets";
setProviderPresets(getCoreProviderPresets());

const notify = (_: string) => {};

function slugifyName(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .replace(/[\s_]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "provider"
  );
}

const INITIAL_PROVIDERS: GatewayProviderConfig[] = [
  {
    name: "OpenAI",
    provider: "openai",
    type: "openai_chat_completions",
    api_base_url: "https://api.openai.com/v1",
    api_key: "sk-••••••••••••••••••••",
    models: ["gpt-4o", "gpt-4o-mini"],
  },
  {
    name: "Anthropic",
    provider: "anthropic",
    type: "anthropic_messages",
    api_base_url: "https://api.anthropic.com/v1",
    api_key: "sk-ant-••••••••••••••••",
    models: ["claude-sonnet-4-20250514"],
  },
];

export default function ProvidersViewDemo() {
  const locale = readDemoLocale();
  const [providers, setProviders] = useState<GatewayProviderConfig[]>(INITIAL_PROVIDERS);
  const [draft, setDraft] = useState<AddProviderDraft>(() => createProviderDraft(INITIAL_PROVIDERS));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editIndex, setEditIndex] = useState<number | undefined>(undefined);
  const [deleteIndex, setDeleteIndex] = useState<number | undefined>(undefined);
  const [dialogMode, setDialogMode] = useState<"add" | "edit">("add");
  const [dialogTitle, setDialogTitle] = useState<string | undefined>(undefined);
  const [playing, setPlaying] = useState(false);
  const [cursor, setCursor] = useState({ x: -100, y: -100, clicking: false, visible: false });
  const cursorApi = useMemo(() => createCursorApi(setCursor), []);

  function openAdd() {
    setEditIndex(undefined);
    setDialogMode("add");
    setDialogTitle(undefined);
    setDraft(createProviderDraft(providers));
    setDialogOpen(true);
  }
  function openEdit(index: number) {
    setEditIndex(index);
    setDialogMode("edit");
    setDialogTitle(undefined);
    setDraft(createProviderDraftFromProvider(providers[index]));
    setDialogOpen(true);
  }
  function changeDraft(patch: Partial<AddProviderDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }
  function setEnabled(index: number, enabled: boolean) {
    setProviders((prev) =>
      prev.map((provider, idx) => (idx === index ? { ...provider, enabled: enabled ? undefined : false } : provider))
    );
  }
  async function submit(): Promise<boolean> {
    const models = mergeProviderModelLists(draft.selectedModels, splitLines(draft.modelsText));
    const provider: GatewayProviderConfig = {
      name: draft.name.trim() || "provider",
      provider: slugifyName(draft.name),
      type: draft.protocol,
      api_base_url: draft.baseUrl.trim(),
      api_key: draft.apiKey.trim(),
      models,
      id: slugifyName(draft.name),
    };
    setProviders((prev) =>
      editIndex === undefined ? [...prev, provider] : prev.map((item, idx) => (idx === editIndex ? provider : item))
    );
    setDialogOpen(false);
    setEditIndex(undefined);
    return true;
  }
  function confirmDelete() {
    if (deleteIndex === undefined) return;
    setProviders((prev) => prev.filter((_, idx) => idx !== deleteIndex));
    setDeleteIndex(undefined);
  }

  /**
   * Automated "add a provider" walkthrough with a VISIBLE, REAL-TIME cursor.
   * Every action is a REAL click/type on the actual element — the user sees the
   * mouse move to and click each thing, following the correct 4-step wizard:
   * 1) click Add → click preset combobox → click "OpenAI" option → click Next
   * 2) type API key → click Next
   * 3) click "Custom model" → type model ID → click ✓ → click Next
   * 4) click "Done"
   */
  async function play() {
    if (playing) return;
    setPlaying(true);
    try {
      const waitFor = async (findFn: () => HTMLElement | null, ms = 3000): Promise<HTMLElement | null> => {
        let el: HTMLElement | null = null;
        const t0 = Date.now();
        while (Date.now() - t0 < ms) {
          el = findFn();
          if (el) return el;
          await sleep(100);
        }
        return el;
      };

      // ── Step 1: open Add dialog ──
      const addBtn = await waitFor(() => findByAria("button", ["添加供应商", "Add provider"]));
      if (addBtn) await cursorApi.click(addBtn);
      await sleep(800);

      // ── Step 1: click preset combobox (opens dropdown) ──
      const combo = await waitFor(() =>
        findByText("span", ["预设供应商", "preset provider"])?.parentElement?.querySelector<HTMLElement>('[role="button"]') ?? null
      );
      if (combo) await cursorApi.click(combo);

      // ── Step 1: click "OpenAI" option ──
      const option = await waitFor(() => findByText('[role="option"]', ["OpenAI"]));
      if (option) await cursorApi.click(option);
      await sleep(500);

      // ── Step 1 → 2: click "Next" ──
      const next1 = await waitFor(() => findByText("button", ["下一步", "Next"]));
      if (next1) await cursorApi.click(next1);
      await sleep(500);

      // ── Step 2: type API key ──
      const keyInput = await waitFor(() => findInputByLabels(["API 密钥", "API key"])) as HTMLInputElement | null;
      if (keyInput) await cursorApi.type(keyInput, "sk-demo-tutorial-key");
      await sleep(300);

      // ── Step 2 → 3: click "Next" ──
      const next2 = await waitFor(() => findByText("button", ["下一步", "Next"]));
      if (next2) await cursorApi.click(next2);
      await sleep(500);

      // ── Step 3: click "Custom model" button ──
      const customBtn = await waitFor(() => findByAria("button", ["自定义模型", "Custom model"]));
      if (customBtn) await cursorApi.click(customBtn);

      // ── Step 3: type model ID ──
      const modelInput = await waitFor(() => findByAria("input", ["自定义模型", "Custom model"])) as HTMLInputElement | null;
      if (modelInput) await cursorApi.type(modelInput, "gpt-4o");
      await sleep(200);

      // ── Step 3: click "Add custom model" (✓) ──
      const addModelBtn = await waitFor(() => findByAria("button", ["添加自定义模型", "Add custom model"]));
      if (addModelBtn) await cursorApi.click(addModelBtn);
      await sleep(400);

      // ── Step 3 → 4: click "Next" ──
      const next3 = await waitFor(() => findByText("button", ["下一步", "Next"]));
      if (next3) await cursorApi.click(next3);
      await sleep(500);

      // ── Step 4: click "Done" (submit) ──
      const doneBtn = await waitFor(() => findByText("button", ["完成", "Done"]));
      if (doneBtn) await cursorApi.click(doneBtn);
    } finally {
      cursorApi.hide();
      setPlaying(false);
    }
  }

  const dialogModels = mergeProviderModelLists(draft.selectedModels, splitLines(draft.modelsText));
  const canSubmit = Boolean(draft.name.trim() && draft.baseUrl.trim()) && dialogModels.length > 0;
  const deleteItem = deleteIndex === undefined ? undefined : providers[deleteIndex];

  return (
    <AppI18nContext.Provider value={locale === "zh" ? appCopy.zh : appCopy.en}>
      <DemoShell
        locale={locale}
        title={{
          zh: "供应商管理 — 添加、编辑、移除上游模型供应商",
          en: "Provider management — add, edit, and remove upstream model providers",
        }}
        onPlay={play}
        playing={playing}
      >
        <VirtualCursor state={cursor} />
        <BaseUiProvider>
          <div className="docs-demo-app-surface docs-demo-app-surface--manager">
            <ProvidersView
              accountSnapshots={[] as ProviderAccountSnapshot[]}
              providers={providers.map((provider, index) => ({ provider, index }))}
              addProvider={openAdd}
              editProvider={openEdit}
              removeProvider={setDeleteIndex}
              setProviderEnabled={setEnabled}
              notify={notify}
            />
          </div>

          {dialogOpen && (
            <AddProviderDialog
              mode={dialogMode}
              title={dialogTitle}
              draft={draft}
              providers={providers}
              canSubmit={canSubmit}
              onChange={changeDraft}
              onClose={() => {
                setDialogOpen(false);
                setEditIndex(undefined);
              }}
              onSubmit={submit}
              error=""
              probeLoading={false}
              providerPlugins={[]}
            />
          )}

          {deleteItem && (
            <DeleteProviderDialog provider={deleteItem} onClose={() => setDeleteIndex(undefined)} onConfirm={confirmDelete} />
          )}
        </BaseUiProvider>
      </DemoShell>
    </AppI18nContext.Provider>
  );
}
