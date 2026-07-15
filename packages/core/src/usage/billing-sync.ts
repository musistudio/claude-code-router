import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AppConfig } from "@ccr/core/contracts/app";
import { readHeader, readRequestBody, sendJson } from "@ccr/core/gateway/http/io";
import { billingUsageSyncHeader } from "@ccr/core/gateway/internal/shared";
import { isRecord, numberValue, stringValue } from "@ccr/core/gateway/internal/value";
import { findProviderByPublicOrInternalName, resolveResponseProviderProtocol } from "@ccr/core/providers/runtime-topology";
import { normalizeUsageInputTokens } from "@ccr/core/usage/normalization";
import { UsageStore, usageStore, type UsageEventInput } from "@ccr/core/usage/store";

type GatewayBillingSynchronizerOptions = {
  getConfig?: () => AppConfig | undefined;
  getGlobalBillingConfig?: () => unknown;
  store?: UsageStore;
};

const maxSeenEventIds = 1_000;
const fusionUsageEventSchema = "ccr.fusion-usage.v1";
const modelGenerationAdapters = new Set([
  "agent_model_client",
  "agent_model_client_streaming",
  "anthropic_messages",
  "gemini_generate",
  "gemini_interactions",
  "gemini_stream",
  "openai_chat",
  "openai_responses"
]);

export class GatewayBillingSynchronizer {
  readonly token = randomUUID();
  private readonly getConfig: () => AppConfig | undefined;
  private readonly getGlobalBillingConfig: () => unknown;
  private readonly inFlightEventIds = new Map<string, Promise<boolean>>();
  private readonly seenEventIds = new Set<string>();
  private readonly store: UsageStore;

  constructor(options: GatewayBillingSynchronizerOptions = {}) {
    this.getConfig = options.getConfig ?? (() => undefined);
    this.getGlobalBillingConfig = options.getGlobalBillingConfig ?? (() => undefined);
    this.store = options.store ?? usageStore;
  }

  async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.method !== "POST") {
      sendJson(response, 405, { error: { message: "Method not allowed." } });
      return;
    }
    if (readHeader(request.headers[billingUsageSyncHeader]) !== this.token) {
      sendJson(response, 401, { error: { message: "Unauthorized billing usage sync." } });
      return;
    }

    let event: unknown;
    try {
      event = JSON.parse((await readRequestBody(request)).toString("utf8")) as unknown;
    } catch {
      sendJson(response, 400, { error: { message: "Invalid billing event." } });
      return;
    }
    const applied = await this.ingest(event);
    sendJson(response, 200, { applied, ok: true });
  }

  async ingest(value: unknown): Promise<boolean> {
    if (!isRecord(value)) {
      return false;
    }
    if (stringValue(value.schema) !== fusionUsageEventSchema) {
      return false;
    }
    const eventId = stringValue(value.eventId);
    if (!eventId) {
      return false;
    }
    if (this.seenEventIds.has(eventId)) {
      return true;
    }

    const target = isRecord(value.target) ? value.target : {};
    const model = stringValue(target.model);
    const providerSelector = stringValue(target.providerName) ?? stringValue(target.provider);
    const config = this.getConfig();
    const configuredProvider = config && providerSelector
      ? findProviderByPublicOrInternalName(config, providerSelector)
      : undefined;
    const provider = configuredProvider?.name ?? providerSelector;
    const providerProtocol = providerSelector
      ? resolveResponseProviderProtocol(
          new Headers({ "x-gateway-target-provider-name": providerSelector }),
          config
        )
      : undefined;
    const source = isRecord(value.source) ? value.source : {};
    const sourceAdapter = stringValue(source.adapterKey);
    if (!model || !sourceAdapter || !modelGenerationAdapters.has(sourceAdapter)) {
      return false;
    }

    const inFlight = this.inFlightEventIds.get(eventId);
    if (inFlight) {
      return inFlight;
    }

    const ingestion = this.ingestValidatedEvent(
      value,
      eventId,
      model,
      provider,
      providerProtocol,
      configuredProvider?.billing
    );
    this.inFlightEventIds.set(eventId, ingestion);
    try {
      return await ingestion;
    } finally {
      this.inFlightEventIds.delete(eventId);
    }
  }

  private async ingestValidatedEvent(
    event: Record<string, unknown>,
    eventId: string,
    model: string,
    provider: string | undefined,
    providerProtocol: ReturnType<typeof resolveResponseProviderProtocol>,
    providerBilling: unknown
  ): Promise<boolean> {
    if (await this.store.hasRequestId(eventId)) {
      this.rememberEventId(eventId);
      return true;
    }
    await this.recordInternalUsageEvent(
      event,
      eventId,
      model,
      provider,
      providerProtocol,
      providerBilling
    );
    this.rememberEventId(eventId);
    return true;
  }

  private async recordInternalUsageEvent(
    event: Record<string, unknown>,
    eventId: string,
    model: string,
    provider: string | undefined,
    providerProtocol: ReturnType<typeof resolveResponseProviderProtocol>,
    providerBilling: unknown
  ): Promise<void> {
    const route = isRecord(event.route) ? event.route : {};
    const outcome = isRecord(event.outcome) ? event.outcome : {};
    const performance = isRecord(event.performance) ? event.performance : {};
    const billing = isRecord(event.billing) ? event.billing : {};
    const usage = isRecord(billing.usage) ? billing.usage : {};
    const cost = isRecord(billing.cost) ? billing.cost : {};
    const status = stringValue(outcome.status);
    const statusCode = numberValue(outcome.statusCode) ?? (status === "success" ? 200 : 502);
    const path = pathFromUrl(stringValue(route.url));
    const normalizedUsage = normalizeUsageInputTokens({
      cacheReadTokens: numberValue(usage.cache_read_tokens),
      cacheWriteTokens: numberValue(usage.cache_write_tokens),
      inputTokens: numberValue(usage.input_tokens),
      outputTokens: numberValue(usage.output_tokens),
      totalTokens: numberValue(usage.total_tokens)
    }, {
      path,
      providerProtocol
    });
    const reportedCost = finiteNumber(cost.total);
    const input: UsageEventInput = {
      client: "Fusion (internal)",
      costSource: "gateway_billing",
      costUsd: authoritativeUsageCost(
        reportedCost,
        normalizedUsage,
        providerBilling,
        this.getGlobalBillingConfig(),
        providerProtocol,
        model
      ),
      createdAt: stringValue(event.emittedAt),
      credentialId: stringValue(targetCredentialId(event)),
      durationMs: numberValue(performance.latency_ms) ?? 0,
      logicalModel: model,
      method: stringValue(route.method) ?? "POST",
      model,
      modelIsRouteSelector: false,
      path,
      provider,
      requestId: eventId,
      statusCode,
      usage: normalizedUsage
    };
    await this.store.record(input);
  }

  private rememberEventId(eventId: string): void {
    this.seenEventIds.add(eventId);
    while (this.seenEventIds.size > maxSeenEventIds) {
      const oldest = this.seenEventIds.values().next().value;
      if (!oldest) {
        break;
      }
      this.seenEventIds.delete(oldest);
    }
  }
}

function targetCredentialId(event: Record<string, unknown>): string | undefined {
  const target = isRecord(event.target) ? event.target : {};
  return stringValue(target.credentialId);
}

function finiteNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function authoritativeUsageCost(
  reportedCost: number | undefined,
  usage: UsageEventInput["usage"],
  providerBilling: unknown,
  globalBilling: unknown,
  providerProtocol: ReturnType<typeof resolveResponseProviderProtocol>,
  model: string
): number | undefined {
  if (
    reportedCost !== 0 ||
    !hasUsageTokens(usage) ||
    hasConfiguredBillingRate(providerBilling, model) ||
    hasConfiguredGlobalBillingRate(globalBilling, providerProtocol) ||
    hasConfiguredGlobalBillingEnvironmentRate(providerProtocol)
  ) {
    return reportedCost;
  }
  return undefined;
}

function hasConfiguredGlobalBillingEnvironmentRate(
  providerProtocol: ReturnType<typeof resolveResponseProviderProtocol>
): boolean {
  const provider = billingProviderForProtocol(providerProtocol);
  if (!provider) {
    return false;
  }
  const prefix = provider.toUpperCase();
  return [
    `${prefix}_INPUT_PRICE_PER_1M`,
    `${prefix}_OUTPUT_PRICE_PER_1M`,
    `${prefix}_CACHE_READ_PRICE_PER_1M`,
    `${prefix}_CACHE_WRITE_PRICE_PER_1M`
  ].some((name) => {
    const value = process.env[name];
    return Boolean(value?.trim()) && finiteNumber(value) !== undefined;
  });
}

function hasConfiguredGlobalBillingRate(
  value: unknown,
  providerProtocol: ReturnType<typeof resolveResponseProviderProtocol>
): boolean {
  if (!isRecord(value) || !isRecord(value.rates)) {
    return false;
  }
  const provider = billingProviderForProtocol(providerProtocol);
  return Boolean(provider && hasBillingRate(value.rates[provider]));
}

function billingProviderForProtocol(
  value: ReturnType<typeof resolveResponseProviderProtocol>
): "anthropic" | "gemini" | "openai" | undefined {
  if (value === "anthropic_messages") {
    return "anthropic";
  }
  if (value === "gemini_generate_content" || value === "gemini_interactions") {
    return "gemini";
  }
  if (value === "openai_chat_completions" || value === "openai_responses") {
    return "openai";
  }
  return undefined;
}

function hasUsageTokens(usage: UsageEventInput["usage"]): boolean {
  return Boolean(
    usage && [
      usage.cacheReadTokens,
      usage.cacheWriteTokens,
      usage.inputTokens,
      usage.outputTokens,
      usage.totalTokens
    ].some((value) => typeof value === "number" && value > 0)
  );
}

function hasConfiguredBillingRate(value: unknown, model: string): boolean {
  if (!isRecord(value)) {
    return false;
  }
  const byModel = isRecord(value.byModel) ? value.byModel : undefined;
  return [
    byModel?.[model],
    value[model],
    value.default,
    value
  ].some(hasBillingRate);
}

function hasBillingRate(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return [
    value.inputPerMillionUsd,
    value.outputPerMillionUsd,
    value.cacheReadPerMillionUsd,
    value.cacheWritePerMillionUsd
  ].some((rate) => finiteNumber(rate) !== undefined) || hasBillingTiers(value.tiers);
}

function hasBillingTiers(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  return [value.input, value.output, value.cacheRead, value.cacheWrite]
    .some((tiers) => Array.isArray(tiers) && tiers.some((tier) =>
      isRecord(tier) && finiteNumber(tier.perMillionUsd) !== undefined
    ));
}

function pathFromUrl(value: string | undefined): string {
  if (!value) {
    return "/v1/messages";
  }
  try {
    return new URL(value, "http://gateway.local").pathname;
  } catch {
    return value.startsWith("/") ? value : "/v1/messages";
  }
}
