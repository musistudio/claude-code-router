/**
 * Task Classifier - classifies incoming Claude Code requests into model tiers.
 *
 * Since Claude Code sends ALL requests with a single model name
 * (e.g. "astron-code-latest"), CCR must classify the actual task complexity
 * to route to the appropriate tier (haiku/sonnet/opus).
 */

import { ModelTier, TierRouteConfig } from '../config/provider-registry';

export interface ClassificationResult {
  tier: ModelTier;
  scenario: string;
  confidence: number;
  reason: string;
}

export interface ClassificationContext {
  tokenCount: number;
  hasThinking: boolean;
  toolCount: number;
  toolNames: string[];
  userMessage: string;
  messageCount: number;
  isSubagent: boolean;
  subagentType?: string;
  lastUsageTokens?: number;
}

export interface ClassifierThresholds {
  longContextThreshold: number;
  difficultTokenThreshold: number;
  toolHeavyThreshold: number;
  historyHeavyThreshold: number;
}

const DEFAULT_THRESHOLDS: ClassifierThresholds = {
  longContextThreshold: 60000,
  difficultTokenThreshold: 24000,
  toolHeavyThreshold: 16,
  historyHeavyThreshold: 20,
};

const OPUS_KEYWORDS = [
  'review', 'architecture', 'security', 'audit',
  'reasoning', 'debug', 'fix', 'design',
  'refactor', 'migrate', 'analyze',
];

const HAIKU_KEYWORDS = [
  'summarize', 'format', 'organize', 'list', 'count', 'simple',
];

export function classifyTask(
  ctx: ClassificationContext,
  thresholds: Partial<ClassifierThresholds> = {},
  tierConfig?: Map<ModelTier, TierRouteConfig>
): ClassificationResult {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };

  if (ctx.isSubagent) {
    if (ctx.subagentType === 'Explore' || ctx.subagentType === 'Plan') {
      return { tier: ModelTier.Haiku, scenario: 'subagent_explore', confidence: 0.8,
        reason: 'Subagent type ' + ctx.subagentType + ' -> haiku' };
    }
    if (ctx.subagentType === 'Verification') {
      return { tier: ModelTier.Opus, scenario: 'subagent_verify', confidence: 0.8,
        reason: 'Subagent type Verification -> opus' };
    }
    return { tier: ModelTier.Sonnet, scenario: 'subagent_default', confidence: 0.7,
      reason: 'Subagent type ' + (ctx.subagentType || 'general') + ' -> sonnet' };
  }

  if (ctx.hasThinking) {
    return { tier: ModelTier.Opus, scenario: 'thinking', confidence: 0.95,
      reason: 'Thinking mode requires deep reasoning -> opus' };
  }

  if (ctx.tokenCount >= t.longContextThreshold) {
    return { tier: ModelTier.Opus, scenario: 'long_context', confidence: 0.9,
      reason: 'Token count ' + ctx.tokenCount + ' >= ' + t.longContextThreshold + ' -> opus' };
  }

  const lowerMsg = ctx.userMessage.toLowerCase();
  const opusKeyword = OPUS_KEYWORDS.find(kw => lowerMsg.includes(kw));
  if (opusKeyword && tierConfig?.get(ModelTier.Opus)) {
    return { tier: ModelTier.Opus, scenario: 'keyword_opus', confidence: 0.75,
      reason: 'Keyword "' + opusKeyword + '" detected -> opus' };
  }

  if (ctx.tokenCount >= t.difficultTokenThreshold) {
    return { tier: ModelTier.Opus, scenario: 'high_complexity', confidence: 0.7,
      reason: 'Token count ' + ctx.tokenCount + ' >= ' + t.difficultTokenThreshold + ' -> opus' };
  }

  if (ctx.toolCount >= t.toolHeavyThreshold) {
    return { tier: ModelTier.Opus, scenario: 'tool_heavy', confidence: 0.65,
      reason: 'Tool count ' + ctx.toolCount + ' >= ' + t.toolHeavyThreshold + ' -> opus' };
  }

  if (ctx.messageCount >= t.historyHeavyThreshold) {
    return { tier: ModelTier.Opus, scenario: 'history_heavy', confidence: 0.6,
      reason: 'Message count ' + ctx.messageCount + ' >= ' + t.historyHeavyThreshold + ' -> opus' };
  }

  const haikuKeyword = HAIKU_KEYWORDS.find(kw => lowerMsg.includes(kw));
  if (haikuKeyword && ctx.tokenCount < t.difficultTokenThreshold) {
    return { tier: ModelTier.Haiku, scenario: 'keyword_haiku', confidence: 0.7,
      reason: 'Keyword "' + haikuKeyword + '" detected + low tokens -> haiku' };
  }

  if (ctx.tokenCount < 5000 && ctx.toolCount <= 4 && ctx.messageCount <= 3) {
    return { tier: ModelTier.Haiku, scenario: 'simple_task', confidence: 0.6,
      reason: 'Simple task: ' + ctx.tokenCount + ' tokens, ' + ctx.toolCount + ' tools -> haiku' };
  }

  return { tier: ModelTier.Sonnet, scenario: 'default', confidence: 0.5,
    reason: 'Default balanced routing -> sonnet' };
}

export function extractContext(req: any): ClassificationContext {
  const body = req.body || {};
  const userMessage = extractLatestUserText(body.messages);
  const tools = Array.isArray(body.tools) ? body.tools : [];
  const toolNames = tools.map((t: any) => t.name || '');
  const subagentInfo = extractSubagentInfo(body);

  return {
    tokenCount: Number(req.tokenCount || 0),
    hasThinking: !!body.thinking,
    toolCount: tools.length,
    toolNames,
    userMessage,
    messageCount: Array.isArray(body.messages) ? body.messages.length : 0,
    isSubagent: subagentInfo.isSubagent,
    subagentType: subagentInfo.subagentType,
    lastUsageTokens: req.lastUsageTokens,
  };
}

function extractLatestUserText(messages: any[]): string {
  if (!Array.isArray(messages)) return '';
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role === 'user') return textFromContent(msg.content);
  }
  return '';
}

function textFromContent(content: any): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((part: any) => {
    if (!part) return '';
    if (typeof part === 'string') return part;
    if (part.type === 'text') return part.text || '';
    if (part.type === 'tool_result') {
      return typeof part.content === 'string' ? part.content : JSON.stringify(part.content || '');
    }
    return '';
  }).filter(Boolean).join('\n');
}

function extractSubagentInfo(body: any): { isSubagent: boolean; subagentType?: string } {
  if (!Array.isArray(body?.system) || body.system.length <= 1) {
    return { isSubagent: false };
  }
  for (const block of body.system) {
    if (block?.type === 'text' && typeof block.text === 'string') {
      const match = block.text.match(/<CCR-SUBAGENT-MODEL>(.*?)<\/CCR-SUBAGENT-MODEL>/s);
      if (match) return { isSubagent: true, subagentType: 'general' };
      if (block.text.includes('background sub-agent')) {
        const typeMatch = block.text.match(/type `(\w+)`/);
        return { isSubagent: true, subagentType: typeMatch?.[1] || 'general' };
      }
    }
  }
  return { isSubagent: false };
}
