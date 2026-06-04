/**
 * Quality Scorer - 响应质量评分器
 *
 * Evaluates LLM response quality across multiple dimensions:
 * - Completeness: does the response address the query?
 * - Coherence: is the response logically consistent?
 * - Helpfulness: is the response actionable/useful?
 * - Safety: does the response contain harmful content?
 * - Hallucination: does the response contain factual errors?
 *
 * Design: Zero external dependencies. Heuristic scoring + optional LLM judge.
 */

export interface QualityScoreConfig {
  enabled: boolean;
  /** Minimum acceptable score (0-1) */
  minAcceptableScore: number;
  /** Enable LLM-based judge (slower but more accurate) */
  useLlmJudge: boolean;
  /** Proxy port for LLM judge calls */
  proxyPort: number;
  /** API key for LLM judge calls */
  apiKey: string;
  /** Judge model */
  judgeModel: string;
  /** Timeout for LLM judge in ms */
  judgeTimeoutMs: number;
}

const DEFAULT_CONFIG: QualityScoreConfig = {
  enabled: true,
  minAcceptableScore: 0.5,
  useLlmJudge: false,
  proxyPort: 3456,
  apiKey: '',
  judgeModel: 'openai,gpt-4o-mini',
  judgeTimeoutMs: 5000,
};

export interface QualityScore {
  overall: number;
  completeness: number;
  coherence: number;
  helpfulness: number;
  safety: number;
  flags: string[];
  feedback?: string;
}

export class QualityScorer {
  private config: QualityScoreConfig;
  private logger?: any;

  constructor(config: Partial<QualityScoreConfig> = {}, logger?: any) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = logger;
  }

  /**
   * Score a response for quality.
   */
  async score(query: string, response: string): Promise<QualityScore> {
    if (!this.config.enabled) {
      return { overall: 1, completeness: 1, coherence: 1, helpfulness: 1, safety: 1, flags: [] };
    }

    // Heuristic scoring
    const completeness = this.scoreCompleteness(query, response);
    const coherence = this.scoreCoherence(response);
    const helpfulness = this.scoreHelpfulness(query, response);
    const safety = this.scoreSafety(response);
    const flags: string[] = [];

    if (completeness < 0.3) flags.push('low_completeness');
    if (coherence < 0.3) flags.push('low_coherence');
    if (helpfulness < 0.3) flags.push('low_helpfulness');
    if (safety < 0.5) flags.push('safety_concern');

    // LLM judge for more accurate scoring (if enabled)
    let feedback: string | undefined;
    if (this.config.useLlmJudge && response.length > 50) {
      try {
        const judgeResult = await this.llmJudge(query, response);
        if (judgeResult) {
          feedback = judgeResult.feedback;
          // Blend heuristic and LLM scores
          return {
            overall: (completeness + coherence + helpfulness + safety + judgeResult.overall) / 5,
            completeness: (completeness + judgeResult.completeness) / 2,
            coherence: (coherence + judgeResult.coherence) / 2,
            helpfulness: (helpfulness + judgeResult.helpfulness) / 2,
            safety,
            flags,
            feedback,
          };
        }
      } catch (e: any) {
        this.logger?.debug(`QualityScorer LLM judge failed: ${e?.message}`);
      }
    }

    const overall = (completeness + coherence + helpfulness + safety) / 4;

    return { overall, completeness, coherence, helpfulness, safety, flags, feedback };
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<QualityScoreConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // =========================================================================
  // Heuristic Scorers
  // =========================================================================

  private scoreCompleteness(query: string, response: string): number {
    if (!response || response.length < 10) return 0.1;

    // Check if response addresses key terms from query
    const queryTerms = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const responseLower = response.toLowerCase();
    const matchedTerms = queryTerms.filter(t => responseLower.includes(t));
    const termCoverage = queryTerms.length > 0 ? matchedTerms.length / queryTerms.length : 0.5;

    // Length ratio check (very short responses to complex queries are incomplete)
    const lengthRatio = Math.min(response.length / Math.max(query.length * 2, 100), 1);

    return Math.min((termCoverage * 0.6 + lengthRatio * 0.4), 1);
  }

  private scoreCoherence(response: string): number {
    if (!response || response.length < 10) return 0.5;

    let score = 1.0;

    // Check for repetitive content (sign of incoherence)
    const sentences = response.split(/[.!?]+/).filter(s => s.trim().length > 10);
    if (sentences.length > 2) {
      const uniqueSentences = new Set(sentences.map(s => s.trim().toLowerCase()));
      const uniqueness = uniqueSentences.size / sentences.length;
      score *= Math.max(uniqueness, 0.3);
    }

    // Check for contradictory signals
    const contradictionPatterns = [
      /\byes\b.*\bno\b/i,
      /\bno\b.*\byes\b/i,
      /\bcorrect\b.*\bincorrect\b/i,
      /\bincorrect\b.*\bcorrect\b/i,
    ];
    for (const pattern of contradictionPatterns) {
      if (pattern.test(response)) {
        score *= 0.7;
        break;
      }
    }

    return Math.min(score, 1);
  }

  private scoreHelpfulness(query: string, response: string): number {
    if (!response || response.length < 10) return 0.2;

    let score = 0.5;

    // Check for actionable content (code blocks, lists, steps)
    if (/```/.test(response)) score += 0.15; // Code blocks
    if (/\d+\.\s/.test(response)) score += 0.1; // Numbered lists
    if (/^[-*]\s/m.test(response)) score += 0.1; // Bullet lists
    if (/step|步骤|first|首先/i.test(response)) score += 0.1; // Instructions

    // Check for refusal patterns (lower helpfulness)
    if (/I cannot|I'm unable|I can't|无法|不能/i.test(response)) {
      score *= 0.5;
    }

    return Math.min(score, 1);
  }

  private scoreSafety(response: string): number {
    if (!response) return 1;

    const unsafePatterns = [
      /\b(hack|exploit|inject|malware|virus)\b/i,
      /\b(kill|murder|suicide|self-harm)\b/i,
      /\b(illegal|criminal|fraud)\b/i,
    ];

    for (const pattern of unsafePatterns) {
      if (pattern.test(response)) return 0.3;
    }

    return 1;
  }

  // =========================================================================
  // LLM Judge
  // =========================================================================

  private async llmJudge(query: string, response: string): Promise<{
    overall: number;
    completeness: number;
    coherence: number;
    helpfulness: number;
    feedback: string;
  } | null> {
    const prompt = `Rate this AI response on a scale of 0.0 to 1.0 for each dimension.

User query: ${query.slice(0, 500)}

AI response: ${response.slice(0, 1000)}

Rate each dimension (0.0-1.0):
COMPLETENESS: <score>
COHERENCE: <score>
HELPFULNESS: <score>
OVERALL: <score>
FEEDBACK: <one sentence feedback>`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.judgeTimeoutMs);

    try {
      const res = await fetch(`http://127.0.0.1:${this.config.proxyPort}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey,
        },
        body: JSON.stringify({
          model: this.config.judgeModel,
          messages: [{ role: 'user', content: prompt }],
          stream: false,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) return null;
      const data = await res.json();
      const text = data.content?.[0]?.text || '';

      const completeness = parseFloat(text.match(/COMPLETENESS:\s*([\d.]+)/)?.[1] || '0.5');
      const coherence = parseFloat(text.match(/COHERENCE:\s*([\d.]+)/)?.[1] || '0.5');
      const helpfulness = parseFloat(text.match(/HELPFULNESS:\s*([\d.]+)/)?.[1] || '0.5');
      const overall = parseFloat(text.match(/OVERALL:\s*([\d.]+)/)?.[1] || '0.5');
      const feedback = text.match(/FEEDBACK:\s*(.+)/)?.[1] || '';

      return { overall, completeness, coherence, helpfulness, feedback };
    } catch {
      clearTimeout(timeout);
      return null;
    }
  }
}

let globalScorer: QualityScorer | null = null;

export function getQualityScorer(config?: Partial<QualityScoreConfig>, logger?: any): QualityScorer {
  if (!globalScorer) {
    globalScorer = new QualityScorer(config, logger);
  } else if (config) {
    globalScorer.updateConfig(config);
  }
  return globalScorer;
}
