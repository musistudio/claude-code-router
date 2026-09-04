import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OnboardingView } from "@ccr/ui/pages/home/components/onboarding.tsx";
import { AppI18nContext, appCopy } from "@ccr/ui/pages/home/shared/i18n.tsx";
import {
  createProfileDraft,
  createProviderDraft,
  fallbackGatewayStatus
} from "@ccr/ui/pages/home/shared/index.tsx";
import { appConfigFixture } from "../fixtures/index.ts";

test("Onboarding provider step renders only the active provider setup section", () => {
  const config = appConfigFixture();
  const providerDraft = {
    ...createProviderDraft([]),
    baseUrl: "https://gateway.example/v1",
    modelsText: "example-model",
    name: "Example Provider"
  };
  const html = renderToStaticMarkup(
    <AppI18nContext.Provider value={appCopy.en}>
      <OnboardingView
        activeStep="provider"
        canSubmitProfile={false}
        canSubmitProvider={false}
        config={config}
        endpoint="http://127.0.0.1:3456"
        gatewayStatus={fallbackGatewayStatus}
        onCheckProvider={async () => ({ failed: [], passed: [], results: [] })}
        onChangeProfile={() => undefined}
        onChangeProvider={() => undefined}
        onComplete={() => undefined}
        onSelectStep={() => undefined}
        onSubmitProfile={async () => false}
        onSubmitProvider={async () => false}
        profileDraft={createProfileDraft()}
        profileError=""
        providerConnectivityLoading={false}
        providerDraft={providerDraft}
        providerError=""
        providerProbeLoading={false}
      />
    </AppI18nContext.Provider>
  );

  assert.match(html, /Choose provider/);
  assert.match(html, /Add credentials/);
  assert.match(html, /Pick models/);
  assert.match(html, /Verify connection/);
  assert.match(html, /Connect agent/);
  assert.match(html, /Let&#x27;s start/);
  assert.match(html, /aria-label="Step 1 \/ 6"/);
  assert.match(html, /1 \/ 4/);
  assert.doesNotMatch(html, /Setup readiness/);
  assert.doesNotMatch(html, /Choose a provider preset or endpoint, enter an API key, and add at least one model/);
  assert.doesNotMatch(html, /Choose how this provider authenticates model requests/);
  assert.doesNotMatch(html, /Choose the models that should be available through this provider/);
  assert.doesNotMatch(html, /Run a real model request before relying on this provider/);
});

test("Onboarding profile step does not prompt to save before continuing", () => {
  const config = appConfigFixture();
  config.Providers = [{
    api_base_url: "https://gateway.example/v1",
    api_key: "sk-test",
    models: ["example-model"],
    name: "Example Provider",
    type: "openai_chat_completions"
  }];
  const providerDraft = {
    ...createProviderDraft([]),
    baseUrl: "https://gateway.example/v1",
    modelsText: "example-model",
    name: "Example Provider"
  };
  const html = renderToStaticMarkup(
    <AppI18nContext.Provider value={appCopy.en}>
      <OnboardingView
        activeStep="profile"
        canSubmitProfile
        canSubmitProvider={false}
        config={config}
        endpoint="http://127.0.0.1:3456"
        gatewayStatus={fallbackGatewayStatus}
        onCheckProvider={async () => ({ failed: [], passed: [], results: [] })}
        onChangeProfile={() => undefined}
        onChangeProvider={() => undefined}
        onComplete={() => undefined}
        onSelectStep={() => undefined}
        onSubmitProfile={async () => false}
        onSubmitProvider={async () => false}
        profileDraft={createProfileDraft()}
        profileError=""
        providerConnectivityLoading={false}
        providerDraft={providerDraft}
        providerError=""
        providerProbeLoading={false}
      />
    </AppI18nContext.Provider>
  );

  assert.doesNotMatch(html, /Save this agent profile to continue/);
  assert.doesNotMatch(html, /Choose an agent, model, and required profile settings/);
  assert.doesNotMatch(html, /provider identity/);
  assert.match(html, /Models, paths, routing, bot, compact, and env/);
});
