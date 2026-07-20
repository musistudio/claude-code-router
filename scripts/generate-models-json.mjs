#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const outputPath = path.join(projectRoot, "packages", "core", "models.json");

const sources = {
  litellm: {
    id: "litellm",
    name: "LiteLLM model prices and context window",
    url: "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json"
  },
  modelsDev: {
    id: "models.dev",
    name: "models.dev API",
    url: "https://models.dev/api.json"
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter models API",
    url: "https://openrouter.ai/api/v1/models"
  }
};

const sourceOrder = ["models.dev", "litellm", "openrouter"];
const support1MContextThreshold = 1_000_000;
const schemaVersion = 2;

const firstPartyProviderAliases = new Map(Object.entries({
  ai21: "ai21",
  alibaba: "alibaba",
  anthropic: "anthropic",
  amazon: "amazon",
  bedrock: "amazon",
  cohere: "cohere",
  deepseek: "deepseek",
  "deepseek-ai": "deepseek",
  gemini: "google",
  google: "google",
  "google-vertex": "google",
  llama: "meta-llama",
  meta: "meta-llama",
  "meta-llama": "meta-llama",
  "meta-llama3": "meta-llama",
  mistral: "mistral",
  mistralai: "mistral",
  minimax: "minimax",
  minimaxai: "minimax",
  moonshot: "moonshotai",
  moonshotai: "moonshotai",
  openai: "openai",
  perplexity: "perplexity",
  qwen: "alibaba",
  xai: "x-ai",
  "x-ai": "x-ai",
  zai: "z-ai",
  "z-ai": "z-ai",
  "zai-org": "z-ai",
  zhipuai: "z-ai"
}));

const providerHints = [
  [/^(chatgpt|codex|dall-e|gpt-|gpt_|o[1345](?:-|$)|omni-|text-embedding-|tts-|whisper-)/i, "openai"],
  [/^claude-/i, "anthropic"],
  [/^(gemini-|imagen-|veo-)/i, "google"],
  [/^grok-/i, "x-ai"],
  [/^deepseek[-_]/i, "deepseek"],
  [/^kimi[-_]/i, "moonshotai"],
  [/^(glm-|charglm-|codegeex-|cogview-)/i, "z-ai"],
  [/^(qwen|qwq|wanx|wan[-_])/i, "alibaba"],
  [/^(llama-|codellama|meta-llama)/i, "meta-llama"],
  [/^(mistral|mixtral|codestral|devstral|magistral|ministral|pixtral|voxtral)/i, "mistral"],
  [/^(minimax|abab)/i, "minimax"],
  [/^command[-_]/i, "cohere"],
  [/^sonar(?:-|$)/i, "perplexity"],
  [/^(nova-|titan-|amazon\\.)/i, "amazon"]
];

async function main() {
  const [modelsDevPayload, liteLlmPayload, openRouterPayload] = await Promise.all([
    fetchJson(sources.modelsDev.url),
    fetchJson(sources.litellm.url),
    fetchJson(sources.openrouter.url)
  ]);

  const entries = new Map();
  ingestModelsDev(entries, modelsDevPayload);
  ingestLiteLlm(entries, liteLlmPayload);
  ingestOpenRouter(entries, openRouterPayload);

  const providerModelRecords = Array.from(entries.values())
    .map(finalizeEntry)
    .sort((a, b) => a.id.localeCompare(b.id));
  const models = dedupeModels(providerModelRecords);
  assertUniqueModelCatalog(models);

  const payload = {
    schemaVersion,
    generatedAt: new Date().toISOString(),
    generatedBy: "scripts/generate-models-json.mjs",
    sources: Object.values(sources).map(({ id, name, url }) => ({ id, name, url })),
    summary: buildSummary(models, providerModelRecords.length),
    models
  };

  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Wrote ${models.length} model records to ${path.relative(projectRoot, outputPath)}`);
  console.log(`Merged ${providerModelRecords.length - models.length} duplicate provider/model records`);
  console.log(`Providers: ${payload.summary.providerCount}`);
  console.log(`Models with >=1M context: ${payload.summary.modelsWith1MContext}`);
  console.log(`Models with image input: ${payload.summary.modelsWithImageInput}`);
  console.log(`Models with image output/generation: ${payload.summary.modelsWithImageOutput}`);
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  }
  return response.json();
}

function ingestModelsDev(entries, payload) {
  if (!isRecord(payload)) return;

  for (const [providerId, provider] of Object.entries(payload)) {
    if (!isRecord(provider) || !isRecord(provider.models)) continue;

    for (const [modelKey, model] of Object.entries(provider.models)) {
      if (!isRecord(model)) continue;

      const modelId = readString(model.id) || modelKey;
      const entry = ensureEntry(entries, providerId, modelId);
      const modalities = normalizeModalities(model.modalities);
      const limits = compactObject({
        contextTokens: readNumber(model.limit?.context),
        inputTokens: readNumber(model.limit?.input),
        outputTokens: readNumber(model.limit?.output)
      });
      const capabilities = compactObject({
        attachments: readBoolean(model.attachment),
        audioInput: modalities.input.includes("audio"),
        audioOutput: modalities.output.includes("audio"),
        imageInput: modalities.input.includes("image"),
        imageOutput: modalities.output.includes("image"),
        interleaved: readBoolean(model.interleaved),
        openWeights: readBoolean(model.open_weights),
        pdfInput: modalities.input.includes("pdf"),
        reasoning: readBoolean(model.reasoning),
        ...reasoningEffortCapabilities(model.reasoning_options),
        structuredOutput: readBoolean(model.structured_output),
        temperature: readBoolean(model.temperature),
        toolCalling: readBoolean(model.tool_call),
        videoInput: modalities.input.includes("video")
      });

      entry.sourceRecords.push(compactObject({
        source: "models.dev",
        sourceUrl: sources.modelsDev.url,
        provider: providerId,
        providerName: readString(provider.name),
        providerApi: readString(provider.api),
        providerDoc: readString(provider.doc),
        model: modelId,
        modelKey,
        displayName: readString(model.name),
        family: readString(model.family),
        status: readString(model.status),
        metadata: compactObject({
          experimental: readBoolean(model.experimental),
          knowledgeCutoff: readString(model.knowledge),
          lastUpdated: readString(model.last_updated),
          openWeights: readBoolean(model.open_weights),
          releaseDate: readString(model.release_date),
          reasoningOptions: model.reasoning_options
        }),
        limits,
        modalities,
        capabilities,
        pricing: pricingFromModelsDev(model.cost)
      }));
    }
  }
}

function ingestLiteLlm(entries, payload) {
  if (!isRecord(payload)) return;

  for (const [modelId, model] of Object.entries(payload)) {
    if (modelId === "sample_spec" || !isRecord(model)) continue;

    const provider = readString(model.litellm_provider) || "unknown";
    const entry = ensureEntry(entries, provider, modelId);
    const mode = readString(model.mode);
    const modalities = inferLiteLlmModalities(model, mode);
    const limits = compactObject({
      contextTokens: readNumber(model.max_input_tokens) ?? readNumber(model.max_tokens),
      inputTokens: readNumber(model.max_input_tokens),
      outputTokens: readNumber(model.max_output_tokens) ?? readNumber(model.max_tokens),
      maxTokens: readNumber(model.max_tokens),
      maxAudioLengthHours: readNumber(model.max_audio_length_hours),
      maxAudioPerPrompt: readNumber(model.max_audio_per_prompt),
      maxDocumentChunksPerQuery: readNumber(model.max_document_chunks_per_query),
      maxImagesPerPrompt: readNumber(model.max_images_per_prompt),
      maxPdfSizeMB: readNumber(model.max_pdf_size_mb),
      maxQueryTokens: readNumber(model.max_query_tokens),
      maxTokensPerDocumentChunk: readNumber(model.max_tokens_per_document_chunk),
      maxVideoLength: readNumber(model.max_video_length),
      maxVideosPerPrompt: readNumber(model.max_videos_per_prompt),
      outputVectorSize: readNumber(model.output_vector_size)
    });

    entry.sourceRecords.push(compactObject({
      source: "litellm",
      sourceUrl: sources.litellm.url,
      provider,
      model: modelId,
      mode,
      metadata: compactObject({
        comment: readString(model.comment),
        deprecationDate: readString(model.deprecation_date),
        metadata: isRecord(model.metadata) ? model.metadata : undefined,
        providerSpecificEntry: model.provider_specific_entry,
        source: readString(model.source),
        supportedEndpoints: readStringArray(model.supported_endpoints),
        supportedRegions: readStringArray(model.supported_regions)
      }),
      limits,
      modalities,
      capabilities: capabilitiesFromLiteLlm(model, mode, modalities),
      pricing: pricingFromLiteLlm(model)
    }));
  }
}

function ingestOpenRouter(entries, payload) {
  if (!isRecord(payload) || !Array.isArray(payload.data)) return;

  for (const model of payload.data) {
    if (!isRecord(model)) continue;

    const modelId = readString(model.id) || readString(model.canonical_slug);
    if (!modelId) continue;

    const provider = "openrouter";
    const entry = ensureEntry(entries, provider, modelId);
    const modalities = normalizeModalities({
      input: model.architecture?.input_modalities,
      output: model.architecture?.output_modalities
    });
    const supportedParameters = readStringArray(model.supported_parameters);
    const limits = compactObject({
      contextTokens: readNumber(model.context_length) ?? readNumber(model.top_provider?.context_length),
      outputTokens: readNumber(model.top_provider?.max_completion_tokens)
    });

    entry.sourceRecords.push(compactObject({
      source: "openrouter",
      sourceUrl: sources.openrouter.url,
      provider,
      model: modelId,
      displayName: readString(model.name),
      metadata: compactObject({
        canonicalSlug: readString(model.canonical_slug),
        createdAt: epochSecondsToIso(model.created),
        expirationDate: readString(model.expiration_date),
        huggingFaceId: readString(model.hugging_face_id),
        instructType: readString(model.architecture?.instruct_type),
        knowledgeCutoff: readString(model.knowledge_cutoff),
        links: isRecord(model.links) ? model.links : undefined,
        perRequestLimits: model.per_request_limits,
        reasoning: isRecord(model.reasoning) ? model.reasoning : undefined,
        supportedParameters,
        supportedVoices: model.supported_voices,
        tokenizer: readString(model.architecture?.tokenizer),
        topProvider: isRecord(model.top_provider) ? model.top_provider : undefined
      }),
      limits,
      modalities,
      capabilities: compactObject({
        audioInput: modalities.input.includes("audio"),
        audioOutput: modalities.output.includes("audio"),
        imageInput: modalities.input.includes("image"),
        imageOutput: modalities.output.includes("image"),
        parallelFunctionCalling: supportedParameters.includes("parallel_tool_calls"),
        reasoning: supportedParameters.includes("reasoning") ||
          supportedParameters.includes("include_reasoning") ||
          isRecord(model.reasoning),
        responseSchema: supportedParameters.includes("response_format"),
        structuredOutput: supportedParameters.includes("structured_outputs"),
        temperature: supportedParameters.includes("temperature"),
        toolCalling: supportedParameters.includes("tools"),
        toolChoice: supportedParameters.includes("tool_choice"),
        webSearch: supportedParameters.includes("web_search_options"),
        videoInput: modalities.input.includes("video")
      }),
      pricing: pricingFromOpenRouter(model.pricing)
    }));
  }
}

function ensureEntry(entries, provider, model) {
  const entryId = composeEntryId(provider, model);
  const key = normalizeEntryKey(entryId);
  const existing = entries.get(key);
  if (existing) return existing;

  const entry = {
    id: entryId,
    provider,
    model,
    sourceRecords: []
  };
  entries.set(key, entry);
  return entry;
}

function finalizeEntry(entry) {
  const records = entry.sourceRecords.sort(compareSourceRecords);
  const displayName = firstDefined(records.map((record) => record.displayName));
  const family = firstDefined(records.map((record) => record.family));
  const mode = firstDefined(records.map((record) => record.mode));
  const limits = mergeLimits(records.map((record) => record.limits));
  const modalities = mergeModalities(records.map((record) => record.modalities));
  const capabilities = mergeCapabilities(records.map((record) => record.capabilities), modalities, limits, mode);
  const pricingOffers = records
    .filter((record) => isRecord(record.pricing) && Object.keys(record.pricing).length > 0)
    .map((record) => compactObject({
      source: record.source,
      provider: record.provider,
      model: record.model,
      sourceUrl: record.sourceUrl,
      ...record.pricing
    }));

  return compactObject({
    id: entry.id,
    provider: entry.provider,
    model: entry.model,
    displayName,
    family,
    mode,
    sources: uniqueStrings(records.map((record) => record.source)),
    limits,
    modalities,
    capabilities,
    pricing: pricingOffers.length > 0 ? {
      currency: "USD",
      normalizedUnit: "per1MTokens values are USD per 1,000,000 tokens; non-token values keep the unit named by their object key.",
      offers: pricingOffers
    } : undefined,
    metadata: mergeMetadata(records),
    sourceRecords: records.map((record) => omit(record, ["pricing", "limits", "modalities", "capabilities"]))
  });
}

function dedupeModels(providerModelRecords) {
  const groups = new Map();
  for (const record of providerModelRecords) {
    const identity = canonicalIdentityForRecord(record);
    const existing = groups.get(identity.key);
    if (existing) {
      existing.records.push(record);
    } else {
      groups.set(identity.key, { identity, records: [record] });
    }
  }

  return Array.from(groups.values())
    .map(({ identity, records }) => mergeDedupedModel(identity, records))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function assertUniqueModelCatalog(models) {
  const modelIds = new Map();
  const aliases = new Map();

  for (const model of models) {
    const id = normalizeEntryKey(model.id);
    const previousId = modelIds.get(id);
    if (previousId) {
      throw new Error(`Duplicate model ID after deduplication: ${model.id} (${previousId})`);
    }
    modelIds.set(id, model.id);

    for (const alias of model.aliases ?? []) {
      const key = normalizeEntryKey(alias);
      const previousModel = aliases.get(key);
      if (previousModel && previousModel !== model.id) {
        throw new Error(`Alias collision after deduplication: ${alias} (${previousModel}, ${model.id})`);
      }
      aliases.set(key, model.id);
    }
  }
}

function mergeDedupedModel(identity, records) {
  const sortedRecords = records.slice().sort((a, b) => providerModelRecordScore(a, identity) - providerModelRecordScore(b, identity));
  const representative = sortedRecords[0];
  const sourceRecords = dedupeSourceRecords(sortedRecords.flatMap((record) => record.sourceRecords ?? []))
    .sort(compareSourceRecords);
  const pricingOffers = dedupePricingOffers(sortedRecords.flatMap((record) => record.pricing?.offers ?? []));
  const limits = mergeLimits(sortedRecords.map((record) => record.limits));
  const modalities = mergeModalities(sortedRecords.map((record) => record.modalities));
  const mode = firstDefined(sortedRecords.map((record) => record.mode));
  const capabilities = mergeCapabilities(sortedRecords.map((record) => record.capabilities), modalities, limits, mode);
  const metadata = mergeMetadata(sourceRecords);

  return compactObject({
    id: identity.id,
    provider: identity.provider,
    model: identity.model,
    displayName: firstDefined(sortedRecords.map((record) => record.displayName)) || representative.displayName,
    family: firstDefined(sortedRecords.map((record) => record.family)),
    mode,
    sources: uniqueStrings(sortedRecords.flatMap((record) => record.sources ?? [])),
    providers: uniqueStrings([
      ...sortedRecords.map((record) => record.provider),
      ...sourceRecords.map((record) => record.provider),
      ...pricingOffers.map((offer) => offer.provider)
    ]),
    aliases: uniqueStrings([
      ...sortedRecords.map((record) => record.id),
      ...sortedRecords.map((record) => composeEntryId(record.provider, record.model)),
      ...sourceRecords.map((record) => composeEntryId(record.provider, record.model))
    ]),
    mergedProviderModelRecords: sortedRecords.length,
    limits,
    modalities,
    capabilities,
    pricing: pricingOffers.length > 0 ? {
      currency: "USD",
      normalizedUnit: "per1MTokens values are USD per 1,000,000 tokens; non-token values keep the unit named by their object key.",
      offers: pricingOffers
    } : undefined,
    metadata: compactObject({
      ...metadata,
      providerModelRecordCount: sortedRecords.length
    }),
    sourceRecords
  });
}

function canonicalIdentityForRecord(record) {
  const segments = modelPathSegments(record.model || record.id);
  const model = canonicalModelSlug(segments.at(-1) || record.model || record.id);
  const providerFromPath = firstDefined(segments.map(canonicalKnownProvider));
  const providerFromName = inferProviderFromModelName(model, record.displayName, record.family);
  const providerFromRecord = canonicalProviderToken(record.provider);
  const provider = providerFromPath || providerFromName || providerFromRecord || "unknown";
  const id = `${provider}/${model}`;
  return {
    id,
    key: normalizeEntryKey(id),
    model,
    provider
  };
}

function providerModelRecordScore(record, identity) {
  let score = 0;
  if (record.provider !== identity.provider) score += 20;
  if (canonicalModelSlug(modelPathSegments(record.model).at(-1) || record.model) !== identity.model) score += 10;
  if (!record.pricing?.offers?.length) score += 5;
  if (!record.sources?.includes("models.dev")) score += 2;
  if (!record.sources?.includes("litellm")) score += 1;
  return score;
}

function dedupeSourceRecords(records) {
  const seen = new Set();
  const output = [];
  for (const record of records) {
    const key = JSON.stringify([
      record.source,
      record.provider,
      record.model,
      record.modelKey,
      record.displayName,
      record.family,
      record.mode,
      record.status
    ]);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(record);
  }
  return output;
}

function dedupePricingOffers(offers) {
  const seen = new Set();
  const output = [];
  for (const offer of offers) {
    const key = JSON.stringify(offer);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(offer);
  }
  return output.sort((a, b) => {
    const sourceDiff = sourceOrder.indexOf(a.source) - sourceOrder.indexOf(b.source);
    if (sourceDiff !== 0) return sourceDiff;
    return `${a.provider}/${a.model}`.localeCompare(`${b.provider}/${b.model}`);
  });
}

function modelPathSegments(value) {
  return String(value || "")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function canonicalKnownProvider(value) {
  const normalized = normalizeProviderToken(value);
  return firstPartyProviderAliases.get(normalized);
}

function canonicalProviderToken(value) {
  const normalized = normalizeProviderToken(value);
  return firstPartyProviderAliases.get(normalized) || normalized || undefined;
}

function normalizeProviderToken(value) {
  return String(value || "")
    .trim()
    .replace(/^hf:/i, "")
    .replace(/^@/, "")
    .replace(/_/g, "-")
    .replace(/\s+/g, "-")
    .toLowerCase();
}

function canonicalModelSlug(value) {
  return String(value || "unknown")
    .trim()
    .replace(/^hf:/i, "")
    .replace(/_/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}

function inferProviderFromModelName(...values) {
  const haystack = values
    .filter((value) => typeof value === "string" && value.trim())
    .join(" ")
    .trim();
  for (const [pattern, provider] of providerHints) {
    if (pattern.test(haystack)) return provider;
  }
  return undefined;
}

function compareSourceRecords(a, b) {
  const sourceDiff = sourceOrder.indexOf(a.source) - sourceOrder.indexOf(b.source);
  if (sourceDiff !== 0) return sourceDiff;
  return `${a.provider}/${a.model}`.localeCompare(`${b.provider}/${b.model}`);
}

function buildSummary(models, rawProviderModelCount) {
  const providerCount = new Set(models.map((model) => model.provider)).size;
  const availabilityProviderCount = new Set(models.flatMap((model) => model.providers ?? [model.provider])).size;
  return {
    modelCount: models.length,
    rawProviderModelCount,
    duplicateProviderModelRecordsMerged: rawProviderModelCount - models.length,
    providerCount,
    availabilityProviderCount,
    sourceCounts: Object.fromEntries(
      sourceOrder.map((source) => [
        source,
        models.reduce((count, model) => count + (model.sources.includes(source) ? 1 : 0), 0)
      ])
    ),
    pricingOfferCount: models.reduce((count, model) => count + (model.pricing?.offers?.length ?? 0), 0),
    modelsWithPricing: models.filter((model) => model.pricing?.offers?.length > 0).length,
    modelsWithoutPricing: models.filter((model) => !model.pricing?.offers?.length).length,
    modelsWith1MContext: models.filter((model) => model.limits?.supports1MContext).length,
    modelsWithImageInput: models.filter((model) => model.capabilities?.imageInput).length,
    modelsWithImageOutput: models.filter((model) => model.capabilities?.imageOutput || model.capabilities?.imageGeneration).length,
    modelsWithAudioInput: models.filter((model) => model.capabilities?.audioInput).length,
    modelsWithToolCalling: models.filter((model) => model.capabilities?.toolCalling || model.capabilities?.functionCalling).length,
    modelsWithReasoning: models.filter((model) => model.capabilities?.reasoning).length
  };
}

function pricingFromModelsDev(cost) {
  if (!isRecord(cost)) return undefined;

  const per1MTokens = compactObject({
    cacheRead: readNumber(cost.cache_read),
    cacheWrite: readNumber(cost.cache_write),
    cacheWrite1h: readNumber(cost.cache_write_1h),
    cacheWrite5m: readNumber(cost.cache_write_5m) ?? readNumber(cost.cache_write),
    input: readNumber(cost.input),
    inputAudio: readNumber(cost.input_audio),
    output: readNumber(cost.output),
    outputAudio: readNumber(cost.output_audio),
    reasoningOutput: readNumber(cost.reasoning)
  });

  const known = new Set(["cache_read", "cache_write", "cache_write_1h", "cache_write_5m", "input", "input_audio", "output", "output_audio", "reasoning", "tiers", "context_over_200k"]);
  const extra = numericObjectExcept(cost, known);

  return compactObject({
    sourceUnit: "usd_per_1m_tokens",
    per1MTokens,
    tiered: compactObject({
      contextOver200K: normalizeNestedNumbers(cost.context_over_200k),
      tiers: normalizeNestedNumbers(cost.tiers)
    }),
    extra
  });
}

function pricingFromLiteLlm(model) {
  const consumed = new Set();
  const per1MTokens = compactObject({
    cacheRead: per1MFromPerToken(firstNumber(model, consumed, [
      "cache_read_input_token_cost",
      "input_cache_read_cost_per_token",
      "cache_read_cost_per_token"
    ])),
    cacheWrite: per1MFromPerToken(firstNumber(model, consumed, [
      "cache_creation_input_token_cost",
      "input_cache_write_cost_per_token",
      "cache_write_cost_per_token"
    ])),
    cacheWrite1h: per1MFromPerToken(firstNumber(model, consumed, [
      "cache_creation_input_token_cost_above_1hr",
      "input_cache_write_1h"
    ])),
    cacheWrite5m: per1MFromPerToken(firstNumber(model, consumed, [
      "cache_creation_input_token_cost",
      "input_cache_write_cost_per_token",
      "cache_write_cost_per_token"
    ])),
    input: per1MFromPerToken(firstNumber(model, consumed, [
      "input_cost_per_token",
      "prompt_cost_per_token"
    ])),
    inputAudio: per1MFromPerToken(firstNumber(model, consumed, ["input_cost_per_audio_token"])),
    inputImage: per1MFromPerToken(firstNumber(model, consumed, ["input_cost_per_image_token"])),
    output: per1MFromPerToken(firstNumber(model, consumed, [
      "output_cost_per_token",
      "completion_cost_per_token"
    ])),
    outputAudio: per1MFromPerToken(firstNumber(model, consumed, ["output_cost_per_audio_token"])),
    outputImage: per1MFromPerToken(firstNumber(model, consumed, ["output_cost_per_image_token"])),
    reasoningOutput: per1MFromPerToken(firstNumber(model, consumed, ["output_cost_per_reasoning_token"]))
  });

  const perImage = numericGroup(model, consumed, {
    input: "input_cost_per_image",
    output: "output_cost_per_image",
    outputAbove512x512: "output_cost_per_image_above_512_and_512_pixels",
    outputAbove512x512Premium: "output_cost_per_image_above_512_and_512_pixels_and_premium_image",
    outputAbove1024x1024: "output_cost_per_image_above_1024_and_1024_pixels",
    outputAbove1024x1024Premium: "output_cost_per_image_above_1024_and_1024_pixels_and_premium_image",
    outputPremium: "output_cost_per_image_premium_image"
  });
  const perPixel = numericGroup(model, consumed, {
    input: "input_cost_per_pixel",
    output: "output_cost_per_pixel"
  });
  const perAudioSecond = numericGroup(model, consumed, {
    input: "input_cost_per_audio_per_second",
    inputAbove128KTokens: "input_cost_per_audio_per_second_above_128k_tokens",
    output: "output_cost_per_second"
  });
  const perVideoSecond = numericGroup(model, consumed, {
    input: "input_cost_per_video_per_second",
    inputAbove128KTokens: "input_cost_per_video_per_second_above_128k_tokens",
    inputAbove8SInterval: "input_cost_per_video_per_second_above_8s_interval",
    inputAbove15SInterval: "input_cost_per_video_per_second_above_15s_interval",
    output: "output_cost_per_video_per_second",
    output1080p: "output_cost_per_second_1080p"
  });
  const perCharacter = numericGroup(model, consumed, {
    input: "input_cost_per_character",
    inputAbove128KTokens: "input_cost_per_character_above_128k_tokens",
    output: "output_cost_per_character",
    outputAbove128KTokens: "output_cost_per_character_above_128k_tokens"
  });
  const perRequest = numericGroup(model, consumed, {
    input: "input_cost_per_request"
  });
  const perQuery = numericGroup(model, consumed, {
    input: "input_cost_per_query"
  });
  const perPage = numericGroup(model, consumed, {
    annotation: "annotation_cost_per_page",
    ocr: "ocr_cost_per_page"
  });
  const perCredit = numericGroup(model, consumed, {
    ocr: "ocr_cost_per_credit"
  });
  const perSession = numericGroup(model, consumed, {
    codeInterpreter: "code_interpreter_cost_per_session"
  });
  const perGBPerDay = numericGroup(model, consumed, {
    fileSearch: "file_search_cost_per_gb_per_day",
    vectorStore: "vector_store_cost_per_gb_per_day"
  });
  const per1KCalls = numericGroup(model, consumed, {
    fileSearch: "file_search_cost_per_1k_calls"
  });

  if (isRecord(model.search_context_cost_per_query)) consumed.add("search_context_cost_per_query");

  return compactObject({
    sourceUnit: "usd_per_token_for_token_fields",
    per1MTokens,
    perImage,
    perPixel,
    perAudioSecond,
    perVideoSecond,
    perCharacter,
    perRequest,
    perQuery,
    perPage,
    perCredit,
    perSession,
    perGBPerDay,
    per1KCalls,
    searchContextPerQuery: normalizeNestedNumbers(model.search_context_cost_per_query),
    extra: numericPricingObjectExcept(model, consumed)
  });
}

function pricingFromOpenRouter(pricing) {
  if (!isRecord(pricing)) return undefined;

  const consumed = new Set();
  const per1MTokens = compactObject({
    cacheRead: per1MFromPerToken(firstNumber(pricing, consumed, ["input_cache_read"])),
    cacheWrite: per1MFromPerToken(firstNumber(pricing, consumed, ["input_cache_write"])),
    cacheWrite1h: per1MFromPerToken(firstNumber(pricing, consumed, ["input_cache_write_1h"])),
    cacheWrite5m: per1MFromPerToken(firstNumber(pricing, consumed, ["input_cache_write"])),
    input: per1MFromPerToken(firstNumber(pricing, consumed, ["prompt"])),
    internalReasoning: per1MFromPerToken(firstNumber(pricing, consumed, ["internal_reasoning"])),
    output: per1MFromPerToken(firstNumber(pricing, consumed, ["completion"]))
  });
  const other = numericGroup(pricing, consumed, {
    audio: "audio",
    image: "image",
    webSearch: "web_search"
  });

  return compactObject({
    sourceUnit: "usd_per_token_for_token_fields",
    per1MTokens,
    other,
    extra: numericObjectExcept(pricing, consumed)
  });
}

function capabilitiesFromLiteLlm(model, mode, modalities) {
  return compactObject({
    adaptiveThinking: readBoolean(model.supports_adaptive_thinking),
    assistantPrefill: readBoolean(model.supports_assistant_prefill),
    audioInput: readBoolean(model.supports_audio_input) || modalities.input.includes("audio"),
    audioOutput: readBoolean(model.supports_audio_output) || modalities.output.includes("audio"),
    codeExecution: readBoolean(model.supports_code_execution),
    computerUse: readBoolean(model.supports_computer_use),
    embedding: mode === "embedding",
    embeddingImageInput: readBoolean(model.supports_embedding_image_input),
    fileSearch: readBoolean(model.supports_file_search),
    functionCalling: readBoolean(model.supports_function_calling),
    imageEditing: readBoolean(model.supports_nova_canvas_image_edit),
    imageGeneration: mode === "image_generation",
    imageInput: readBoolean(model.supports_vision) ||
      readBoolean(model.supports_image_input) ||
      readBoolean(model.supports_embedding_image_input) ||
      modalities.input.includes("image"),
    imageOutput: mode === "image_generation" || modalities.output.includes("image"),
    highReasoningEffort: readBoolean(model.supports_high_reasoning_effort),
    lowReasoningEffort: readBoolean(model.supports_low_reasoning_effort),
    maxReasoningEffort: readBoolean(model.supports_max_reasoning_effort),
    mediumReasoningEffort: readBoolean(model.supports_medium_reasoning_effort),
    minimalReasoningEffort: readBoolean(model.supports_minimal_reasoning_effort),
    moderation: mode === "moderation",
    multimodal: readBoolean(model.supports_multimodal),
    nativeStreaming: readBoolean(model.supports_native_streaming),
    nativeStructuredOutput: readBoolean(model.supports_native_structured_output),
    noneReasoningEffort: readBoolean(model.supports_none_reasoning_effort),
    parallelFunctionCalling: readBoolean(model.supports_parallel_function_calling),
    pdfInput: readBoolean(model.supports_pdf_input) || modalities.input.includes("pdf"),
    promptCaching: readBoolean(model.supports_prompt_caching),
    reasoning: readBoolean(model.supports_reasoning),
    rerank: mode === "rerank",
    responseSchema: readBoolean(model.supports_response_schema),
    samplingParams: readBoolean(model.supports_sampling_params),
    serviceTier: readBoolean(model.supports_service_tier),
    speech: mode === "audio_speech",
    systemMessages: readBoolean(model.supports_system_messages),
    toolChoice: readBoolean(model.supports_tool_choice),
    transcription: mode === "audio_transcription",
    urlContext: readBoolean(model.supports_url_context),
    ultraReasoningEffort: readBoolean(model.supports_ultra_reasoning_effort),
    videoInput: readBoolean(model.supports_video_input) || modalities.input.includes("video"),
    vision: readBoolean(model.supports_vision),
    webSearch: readBoolean(model.supports_web_search),
    xhighReasoningEffort: readBoolean(model.supports_xhigh_reasoning_effort)
  });
}

function reasoningEffortCapabilities(value) {
  const efforts = new Set(
    (Array.isArray(value) ? value : [])
      .flatMap((option) => isRecord(option) && Array.isArray(option.values) ? option.values : [])
      .map((effort) => readString(effort)?.toLowerCase() ?? "")
      .filter(Boolean)
  );
  return compactObject({
    lowReasoningEffort: efforts.has("low") || undefined,
    mediumReasoningEffort: efforts.has("medium") || undefined,
    highReasoningEffort: efforts.has("high") || undefined,
    maxReasoningEffort: efforts.has("max") || undefined,
    minimalReasoningEffort: efforts.has("minimal") || undefined,
    noneReasoningEffort: efforts.has("none") || undefined,
    ultraReasoningEffort: efforts.has("ultra") || undefined,
    xhighReasoningEffort: efforts.has("xhigh") || undefined
  });
}

function inferLiteLlmModalities(model, mode) {
  const input = new Set();
  const output = new Set();

  if (mode === "audio_transcription") {
    input.add("audio");
    output.add("text");
  } else if (mode === "audio_speech") {
    input.add("text");
    output.add("audio");
  } else if (mode === "image_generation") {
    input.add("text");
    output.add("image");
  } else if (mode === "embedding") {
    input.add("text");
    output.add("embedding");
  } else if (mode === "rerank") {
    input.add("text");
    output.add("score");
  } else {
    input.add("text");
    output.add("text");
  }

  if (readBoolean(model.supports_vision) ||
    readBoolean(model.supports_image_input) ||
    readBoolean(model.supports_embedding_image_input) ||
    readNumber(model.input_cost_per_image) !== undefined ||
    readNumber(model.input_cost_per_image_token) !== undefined) {
    input.add("image");
  }
  if (readBoolean(model.supports_audio_input) || readNumber(model.input_cost_per_audio_token) !== undefined) {
    input.add("audio");
  }
  if (readBoolean(model.supports_audio_output) || readNumber(model.output_cost_per_audio_token) !== undefined) {
    output.add("audio");
  }
  if (readBoolean(model.supports_video_input) || readNumber(model.input_cost_per_video_per_second) !== undefined) {
    input.add("video");
  }
  if (readBoolean(model.supports_pdf_input)) {
    input.add("pdf");
  }

  return { input: Array.from(input).sort(), output: Array.from(output).sort() };
}

function mergeLimits(limitsList) {
  const output = {};
  const numericKeys = [
    "contextTokens",
    "inputTokens",
    "maxAudioLengthHours",
    "maxAudioPerPrompt",
    "maxDocumentChunksPerQuery",
    "maxImagesPerPrompt",
    "maxPdfSizeMB",
    "maxQueryTokens",
    "maxTokens",
    "maxTokensPerDocumentChunk",
    "maxVideoLength",
    "maxVideosPerPrompt",
    "outputTokens",
    "outputVectorSize"
  ];

  for (const key of numericKeys) {
    const values = limitsList.map((limits) => readNumber(limits?.[key])).filter((value) => value !== undefined);
    if (values.length > 0) output[key] = Math.max(...values);
  }

  const contextCandidates = [output.contextTokens, output.inputTokens, output.maxTokens]
    .filter((value) => Number.isFinite(value));
  output.supports1MContext = contextCandidates.some((value) => value >= support1MContextThreshold);

  return compactObject(output);
}

function mergeModalities(modalityList) {
  const input = new Set();
  const output = new Set();
  for (const modalities of modalityList) {
    for (const value of modalities?.input ?? []) input.add(value);
    for (const value of modalities?.output ?? []) output.add(value);
  }
  return {
    input: Array.from(input).sort(),
    output: Array.from(output).sort()
  };
}

function mergeCapabilities(capabilitiesList, modalities, limits, mode) {
  const merged = {};
  for (const capabilities of capabilitiesList) {
    if (!isRecord(capabilities)) continue;
    for (const [key, value] of Object.entries(capabilities)) {
      if (value === true) merged[key] = true;
      else if (value === false && merged[key] !== true) merged[key] = false;
    }
  }

  merged.audioInput = merged.audioInput || modalities.input.includes("audio");
  merged.audioOutput = merged.audioOutput || modalities.output.includes("audio");
  merged.imageInput = merged.imageInput || modalities.input.includes("image");
  merged.imageOutput = merged.imageOutput || modalities.output.includes("image");
  merged.pdfInput = merged.pdfInput || modalities.input.includes("pdf");
  merged.videoInput = merged.videoInput || modalities.input.includes("video");
  merged.supports1MContext = Boolean(limits.supports1MContext);
  if (mode === "image_generation") merged.imageGeneration = true;

  return compactObject(merged);
}

function mergeMetadata(records) {
  const output = compactObject({
    displayNames: uniqueStrings(records.map((record) => record.displayName)),
    families: uniqueStrings(records.map((record) => record.family)),
    modes: uniqueStrings(records.map((record) => record.mode)),
    statuses: uniqueStrings(records.map((record) => record.status)),
    knowledgeCutoff: firstDefined(records.map((record) => record.metadata?.knowledgeCutoff)),
    releaseDate: firstDefined(records.map((record) => record.metadata?.releaseDate)),
    lastUpdated: firstDefined(records.map((record) => record.metadata?.lastUpdated)),
    deprecationDate: firstDefined(records.map((record) => record.metadata?.deprecationDate)),
    supportedParameters: uniqueStrings(records.flatMap((record) => record.metadata?.supportedParameters ?? [])),
    supportedEndpoints: uniqueStrings(records.flatMap((record) => record.metadata?.supportedEndpoints ?? [])),
    supportedRegions: uniqueStrings(records.flatMap((record) => record.metadata?.supportedRegions ?? []))
  });

  return output;
}

function normalizeModalities(value) {
  if (!isRecord(value)) return { input: [], output: [] };
  return {
    input: readStringArray(value.input).sort(),
    output: readStringArray(value.output).sort()
  };
}

function composeEntryId(provider, model) {
  const normalizedProvider = String(provider || "unknown").trim() || "unknown";
  const normalizedModel = String(model || "unknown").trim() || "unknown";
  const lowerProviderPrefix = `${normalizedProvider.toLowerCase()}/`;
  if (normalizedModel.toLowerCase().startsWith(lowerProviderPrefix)) {
    return normalizedModel;
  }
  return `${normalizedProvider}/${normalizedModel}`;
}

function normalizeEntryKey(value) {
  return String(value).trim().replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/").toLowerCase();
}

function firstNumber(record, consumed, keys) {
  for (const key of keys) {
    const value = readNumber(record?.[key]);
    if (value !== undefined) {
      consumed.add(key);
      return value;
    }
  }
  return undefined;
}

function numericGroup(record, consumed, mapping) {
  const output = {};
  for (const [targetKey, sourceKey] of Object.entries(mapping)) {
    const value = readNumber(record?.[sourceKey]);
    if (value !== undefined) {
      output[targetKey] = value;
      consumed.add(sourceKey);
    }
  }
  return compactObject(output);
}

function numericObjectExcept(record, excludedKeys) {
  if (!isRecord(record)) return undefined;
  const output = {};
  for (const [key, value] of Object.entries(record)) {
    if (excludedKeys.has(key)) continue;
    const normalized = normalizeNestedNumbers(value);
    if (normalized !== undefined) output[key] = normalized;
  }
  return compactObject(output);
}

function numericPricingObjectExcept(record, excludedKeys) {
  if (!isRecord(record)) return undefined;
  const output = {};
  for (const [key, value] of Object.entries(record)) {
    if (excludedKeys.has(key) || !looksLikePricingKey(key)) continue;
    const normalized = normalizeNestedNumbers(value);
    if (normalized !== undefined) output[key] = normalized;
  }
  return compactObject(output);
}

function looksLikePricingKey(key) {
  return key.includes("cost") ||
    key.includes("price") ||
    key.includes("_per_") ||
    key.includes("dbu") ||
    key.includes("uplift_multiplier");
}

function normalizeNestedNumbers(value) {
  const number = readNumber(value);
  if (number !== undefined) return number;
  if (Array.isArray(value)) {
    const items = value
      .map((item) => normalizeNestedNumbers(item))
      .filter((item) => item !== undefined);
    return items.length > 0 ? items : undefined;
  }
  if (isRecord(value)) {
    const output = {};
    for (const [key, nested] of Object.entries(value)) {
      const normalized = normalizeNestedNumbers(nested);
      if (normalized !== undefined) output[key] = normalized;
    }
    return Object.keys(output).length > 0 ? output : undefined;
  }
  return undefined;
}

function per1MFromPerToken(value) {
  return value === undefined ? undefined : roundNumber(value * 1_000_000);
}

function readNumber(value) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function readString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readBoolean(value) {
  return typeof value === "boolean" ? value : undefined;
}

function readStringArray(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim())
    : [];
}

function firstDefined(values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function uniqueStrings(values) {
  return Array.from(new Set(values.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))).sort();
}

function compactObject(object) {
  if (!isRecord(object)) return undefined;
  const output = {};
  for (const [key, value] of Object.entries(object)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (isRecord(value) && Object.keys(value).length === 0) continue;
    output[key] = value;
  }
  return Object.keys(output).length > 0 ? output : undefined;
}

function omit(object, keys) {
  const keySet = new Set(keys);
  const output = {};
  for (const [key, value] of Object.entries(object)) {
    if (!keySet.has(key)) output[key] = value;
  }
  return output;
}

function roundNumber(value) {
  return Number(value.toPrecision(12));
}

function epochSecondsToIso(value) {
  const seconds = readNumber(value);
  if (seconds === undefined) return undefined;
  return new Date(seconds * 1000).toISOString();
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
