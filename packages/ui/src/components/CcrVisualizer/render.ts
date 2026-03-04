// All render*() functions, HTML generation helpers, and generateHtml()/generateEmptyStateHtml()

import type { CcrRequest, ConvMessage, FallbackEntry, LogEvent } from './types';
import { esc, fmtMs, fmtTok, fmtNum, fmtAbsTime } from './utils';
import { VISUALIZER_CSS, VISUALIZER_JS } from './template';

// All badge/status colors use CSS classes defined in the generated <style> block
export function scenarioBadge(scenario: string): string {
  const labels: Record<string, string> = {
    think: 'THINK', background: 'BACKGROUND', longContext: 'LONG CTX', webSearch: 'WEB SEARCH', default: 'DEFAULT',
  };
  return `<span class="badge sc-${esc(scenario)}">${esc(labels[scenario] ?? scenario.toUpperCase())}</span>`;
}

export function thinkingBadge(req: CcrRequest): string {
  if (!req.thinkingMode && !req.thinkingChars) return '';
  let label: string;
  if (req.thinkingMode === 'adaptive') {
    label = 'adaptive';
  } else {
    const budget = req.thinkingBudget ?? 0;
    label = budget >= 10000 ? 'HIGH' : budget >= 3000 ? 'MED' : 'LOW';
  }
  const chars = req.thinkingChars > 0 ? ` \xb7 ${fmtTok(req.thinkingChars)} chars` : '';
  return `<span class="badge sc-thinking" title="reasoning/thinking mode">&#129504; ${label}${esc(chars)}</span>`;
}

export function reqStatus(req: CcrRequest): string {
  if (req.allFallbacksFailed) return `<span class="rs rs-err">[FAILED]</span>`;
  if (req.hasFallback) return `<span class="rs rs-warn">[${req.statusCode ?? '?'}&#x21A9;]</span>`;
  if (req.statusCode !== null && req.statusCode < 400) return `<span class="rs rs-ok">[${req.statusCode}]</span>`;
  if (req.statusCode !== null) return `<span class="rs rs-err">[${req.statusCode}]</span>`;
  return `<span class="rs rs-dim">[&#8230;]</span>`;
}

export function generateNarrative(reqs: CcrRequest[], turns: CcrRequest[][]): string {
  const total = reqs.length;
  const durations = reqs.filter(r => r.responseTime !== null).map(r => r.responseTime!);
  const allTimes = reqs.flatMap(r => [r.startTime, r.endTime ?? r.startTime]);
  const totalDur = allTimes.length > 0 ? Math.max(...allTimes) - Math.min(...allTimes) : 0;

  const scenarios: Record<string, { total: number; ok: number }> = {};
  for (const req of reqs) {
    const ok = req.statusCode !== null && req.statusCode < 400;
    if (!scenarios[req.scenario]) scenarios[req.scenario] = { total: 0, ok: 0 };
    scenarios[req.scenario].total++;
    if (ok) scenarios[req.scenario].ok++;
  }

  let html = `<p>${total} API request${total !== 1 ? 's' : ''} across ${turns.length} conversation turn${turns.length !== 1 ? 's' : ''} over ${fmtMs(totalDur)}.</p>`;

  for (const [scenario, stats] of Object.entries(scenarios)) {
    const bad = stats.total - stats.ok;
    let line = `${stats.total} ${scenario} request${stats.total !== 1 ? 's' : ''}`;
    if (bad === 0) line += ' \u2014 all succeeded.';
    else if (stats.ok === 0) line += ' \u2014 all failed.';
    else line += ` \u2014 ${stats.ok} succeeded, ${bad} failed.`;
    html += `<p>${esc(line)}</p>`;
  }

  const thinkReqs = reqs.filter(r => r.thinkingMode);
  if (thinkReqs.length > 0) {
    const totalThinking = thinkReqs.reduce((s, r) => s + r.thinkingChars, 0);
    html += `<p>${thinkReqs.length} request${thinkReqs.length !== 1 ? 's' : ''} used extended thinking \u2014 ${fmtNum(totalThinking)} chars of thinking output.</p>`;
  }

  const avgDur = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
  if (avgDur > 0) {
    const minDur = Math.min(...durations), maxDur = Math.max(...durations);
    html += `<p>Response times: avg ${fmtMs(avgDur)}, min ${fmtMs(minDur)}, max ${fmtMs(maxDur)}.</p>`;
  }

  return html;
}

export function renderCostTable(reqs: CcrRequest[]): string {
  interface MS { reqCount: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; isFree: boolean; }
  const modelMap = new Map<string, MS>();
  for (const req of reqs) {
    const model = req.routedModel ?? req.originalModel ?? 'unknown';
    const ex = modelMap.get(model) ?? { reqCount: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, isFree: model.includes(':free') };
    ex.reqCount++; ex.inputTokens += req.inputTokens; ex.outputTokens += req.outputTokens; ex.cacheReadTokens += req.cacheReadTokens;
    modelMap.set(model, ex);
  }
  if (modelMap.size === 0) return '';

  const defaultPrices: Record<string, [number, number]> = {
    'claude-opus-4-6': [15, 75], 'claude-sonnet-4-6': [3, 15], 'claude-haiku-4-5-20251001': [0.8, 4],
    'claude-3-5-sonnet-20241022': [3, 15], 'claude-3-5-haiku-20241022': [0.8, 4], 'claude-3-opus-20240229': [15, 75],
    'gpt-4o': [5, 15], 'gpt-4o-mini': [0.15, 0.6], 'gemini-1.5-pro': [3.5, 10.5], 'gemini-1.5-flash': [0.075, 0.3],
  };

  let rows = '', grandIn = 0, grandOut = 0, grandCache = 0, grandCost = 0;
  // Collect models that need OpenRouter price fetch
  const needsFetch: string[] = [];
  modelMap.forEach((s, model) => { if (!s.isFree && !defaultPrices[model]) needsFetch.push(model); });

  modelMap.forEach((s, model) => {
    grandIn += s.inputTokens; grandOut += s.outputTokens; grandCache += s.cacheReadTokens;
    const prices = defaultPrices[model] ?? [0, 0];
    const pIn = s.isFree ? 0 : prices[0], pOut = s.isFree ? 0 : prices[1];
    const cost = s.isFree ? 0 : (s.inputTokens * pIn + s.outputTokens * pOut) / 1_000_000;
    grandCost += cost;
    const rid = `cr-${model.replace(/[^a-zA-Z0-9]/g, '-')}`;
    const freeTag = s.isFree ? ' <span class="free-tag">free</span>' : '';
    const fetchingTag = (!s.isFree && !defaultPrices[model]) ? ' <span class="fetching-tag">fetching…</span>' : '';
    const pInCell = s.isFree ? `<td class="ct-c">&#8212;</td>` : `<td class="ct-c"><input class="pi" id="${rid}-pin" data-row="${rid}" data-type="in" type="number" step="0.001" min="0" value="${pIn.toFixed(4)}" onchange="recalcRow('${rid}')" /></td>`;
    const pOutCell = s.isFree ? `<td class="ct-c">&#8212;</td>` : `<td class="ct-c"><input class="pi" id="${rid}-pout" data-row="${rid}" data-type="out" type="number" step="0.001" min="0" value="${pOut.toFixed(4)}" onchange="recalcRow('${rid}')" /></td>`;
    const costCell = s.isFree ? `<td class="ct-r free-cost">$0.0000</td>` : `<td id="${rid}-cost" class="ct-r">$${cost.toFixed(4)}</td>`;
    rows += `<tr data-model="${esc(model)}">
      <td class="ct-l mono">${esc(model)}${freeTag}${fetchingTag}</td>
      <td class="ct-r">${s.reqCount}</td>
      <td class="ct-r">${fmtTok(s.inputTokens)}</td>
      <td class="ct-r">${s.cacheReadTokens > 0 ? fmtTok(s.cacheReadTokens) : '&#8212;'}</td>
      <td class="ct-r">${fmtTok(s.outputTokens)}</td>
      ${pInCell}${pOutCell}
      ${costCell}
      <td style="display:none" id="${rid}-data" data-in="${s.inputTokens}" data-out="${s.outputTokens}"></td>
    </tr>`;
  });

  const needsFetchAttr = needsFetch.length > 0 ? ` data-fetch="${needsFetch.map(m => encodeURIComponent(m)).join(',')}"` : '';
  return `<div class="section-card" style="margin-bottom:14px">
  <div class="section-hdr" onclick="toggleSection('cost-body')">
    <span>Token Usage &amp; Cost Estimate</span>
    <span id="cost-body-chevron" class="chevron open">&#9660;</span>
  </div>
  <div id="cost-body"${needsFetchAttr}>
    <p class="ct-note">Pricing auto-fetched from OpenRouter for routed models. Edit rates for custom/unlisted models.</p>
    <table class="cost-table">
      <thead><tr>
        <th class="ct-l">Model</th><th class="ct-r">Reqs</th><th class="ct-r">Input</th>
        <th class="ct-r">Cache Read</th><th class="ct-r">Output</th>
        <th class="ct-c">$/M In</th><th class="ct-c">$/M Out</th><th class="ct-r">Est. Cost</th>
        <th style="display:none"></th>
      </tr></thead>
      <tbody>${rows}
        <tr class="ct-total">
          <td class="ct-l" colspan="2"><strong>Grand Total</strong></td>
          <td class="ct-r"><strong>${fmtTok(grandIn)}</strong></td>
          <td class="ct-r">${grandCache > 0 ? fmtTok(grandCache) : '&#8212;'}</td>
          <td class="ct-r"><strong>${fmtTok(grandOut)}</strong></td>
          <td colspan="2"></td>
          <td id="grand-total-cost" class="ct-r grand-cost"><strong>$${grandCost.toFixed(4)}</strong></td>
          <td style="display:none"></td>
        </tr>
      </tbody>
    </table>
  </div>
</div>`;
}

export function renderTimeline(reqs: CcrRequest[], turns: CcrRequest[][]): string {
  if (reqs.length === 0) return '';
  const minTime = Math.min(...reqs.map(r => r.startTime));
  const maxTime = Math.max(...reqs.map(r => r.endTime ?? r.startTime));
  const totalDur = maxTime - minTime || 1;

  const labelW = 44, chartW = 700, barH = 20, rowH = 30, legendH = 28, axisH = 24;
  const svgH = legendH + reqs.length * rowH + axisH;
  const scenarioAbbr: Record<string, string> = { think: 'THI', background: 'BAC', longContext: 'LON', webSearch: 'WEB', default: 'DEF' };

  let svg = `<svg viewBox="0 0 ${labelW + chartW + 10} ${svgH}" height="${svgH}" style="width:100%;display:block;font-family:ui-sans-serif,system-ui,sans-serif;font-size:11px">`;

  // Legend
  const legendItems = [['#22c55e','success'],['#ef4444','failed'],['#f59e0b','fallback attempted']];
  let lx = labelW;
  for (const [color, label] of legendItems) {
    svg += `<rect x="${lx}" y="8" width="11" height="11" rx="2" fill="${color}"/>`;
    svg += `<text x="${lx + 15}" y="18" fill="var(--text-muted)" font-size="10">${label}</text>`;
    lx += label.length * 6 + 24;
  }
  svg += `<line x1="${lx}" y1="8" x2="${lx}" y2="19" stroke="var(--text-dim)" stroke-width="1.5" stroke-dasharray="3,2"/>`;
  svg += `<text x="${lx + 5}" y="18" fill="var(--text-muted)" font-size="10">conversation turn</text>`;

  // Turn separators
  const seenTurns = new Set<number>();
  for (const turn of turns) {
    if (!turn.length) continue;
    const ts = turn[0].startTime;
    if (seenTurns.has(ts)) continue;
    seenTurns.add(ts);
    const x = (labelW + ((ts - minTime) / totalDur) * chartW).toFixed(1);
    svg += `<line x1="${x}" y1="${legendH}" x2="${x}" y2="${legendH + reqs.length * rowH}" stroke="var(--text-dim)" stroke-width="1" stroke-dasharray="4,3" opacity="0.7"/>`;
  }

  // Bars
  reqs.forEach((req, i) => {
    const y = legendH + i * rowH + (rowH - barH) / 2;
    const sx = labelW + ((req.startTime - minTime) / totalDur) * chartW;
    const endT = req.endTime ?? (req.startTime + (req.responseTime ?? 500));
    const bw = Math.max(4, ((endT - req.startTime) / totalDur) * chartW);
    const color = req.allFallbacksFailed ? '#ef4444' : req.hasFallback ? '#f59e0b' : req.statusCode !== null && req.statusCode < 400 ? '#22c55e' : '#9ca3af';
    const abbr = scenarioAbbr[req.scenario] ?? req.scenario.slice(0,3).toUpperCase();

    svg += `<text x="${labelW - 4}" y="${y + barH / 2 + 4}" text-anchor="end" fill="var(--text-muted)" font-size="10" font-weight="600">${abbr}</text>`;
    svg += `<rect x="${sx.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${barH}" rx="3" fill="${color}"/>`;
    if (req.statusCode !== null && bw > 24) {
      svg += `<text x="${(sx + bw / 2).toFixed(1)}" y="${(y + barH / 2 + 4).toFixed(1)}" text-anchor="middle" fill="rgba(0,0,0,0.65)" font-size="10" font-weight="700">${req.statusCode}</text>`;
    }
  });

  // Time axis
  const axisY = legendH + reqs.length * rowH + 4;
  svg += `<line x1="${labelW}" y1="${axisY}" x2="${labelW + chartW}" y2="${axisY}" stroke="var(--border)" stroke-width="1"/>`;
  const ticks = Math.min(10, Math.floor(chartW / 60));
  for (let t = 0; t <= ticks; t++) {
    const x = (labelW + (t / ticks) * chartW).toFixed(1);
    svg += `<line x1="${x}" y1="${axisY}" x2="${x}" y2="${axisY + 4}" stroke="var(--border)" stroke-width="1"/>`;
    svg += `<text x="${x}" y="${axisY + 14}" text-anchor="middle" fill="var(--text-dim)" font-size="9">${((t / ticks) * totalDur / 1000).toFixed(1)}s</text>`;
  }

  svg += '</svg>';
  return svg;
}

export function renderFallbackChain(chain: FallbackEntry[]): string {
  if (chain.length === 0) return '';
  let html = '<div class="fb-chain">';
  for (const entry of chain) {
    const cls = entry.status === 'success' ? 'fb-ok' : entry.status === 'failed' ? 'fb-err' : 'fb-pend';
    const statusStr = entry.status === 'failed' && entry.httpStatus ? ` \xb7 HTTP ${entry.httpStatus}` : ` \xb7 ${entry.status}`;
    html += `<div class="fb-node ${cls}"><strong>${esc(entry.model)}</strong>${entry.isPrimary ? ' (primary)' : ''}<span class="fb-st">${esc(statusStr)}</span>`;
    if (entry.errorBody) {
      const errTrunc = entry.errorBody.slice(0, 150);
      const errHasMore = entry.errorBody.length > 150;
      const errBtn = errHasMore ? ` <button class="view-full-btn" style="display:inline;padding:1px 6px;font-size:10px" data-fulltext="${esc(entry.errorBody)}" data-title="Error Detail" onclick="openFullFromData(this)">more &#8599;</button>` : '';
      html += `<div class="fb-err-body">${esc(errTrunc)}${errHasMore ? '\u2026' : ''}${errBtn}</div>`;
    }
    html += '</div>';
  }
  html += '</div>';
  return html;
}

export function renderEventTimeline(events: LogEvent[]): string {
  if (events.length === 0) return '';
  const typeColors: Record<string, string> = {
    incoming: 'ev-incoming', request_body: 'ev-body', routing: 'ev-routing',
    final_request: 'ev-final', fallback: 'ev-fallback', error: 'ev-error', completed: 'ev-completed',
  };
  let html = '<div class="ev-section"><div class="ev-label">Event Timeline</div><div class="ev-list">';
  for (const ev of events) {
    const cls = typeColors[ev.type] ?? 'ev-other';
    html += `<div class="ev-row"><span class="ev-time">${fmtAbsTime(ev.time)}</span><span class="ev-type ${cls}">${esc(ev.type)}</span><span class="ev-detail">${esc(ev.detail)}</span></div>`;
  }
  html += '</div></div>';
  return html;
}

export function renderConversation(msgs: ConvMessage[]): string {
  let html = '';
  for (const m of msgs) {
    const roleClass = m.role === 'user' ? 'role-user' : 'role-asst';
    html += `<div class="conv-msg"><span class="conv-role ${roleClass}">${esc(m.role)}</span><div class="conv-blocks">`;
    for (const b of m.blocks) {
      if (b.type === 'text') {
        const viewBtn = b.fullText ? `<button class="view-full-btn" data-fulltext="${esc(b.fullText)}" data-title="Message Text" onclick="openFullFromData(this)">Open full text in new tab &#8599;</button>` : '';
        html += `<div class="conv-text">${esc(b.preview ?? '')}${b.fullText ? '\u2026' : ''}</div>${viewBtn}`;
      } else if (b.type === 'thinking') {
        const viewBtn = b.fullText ? `<button class="view-full-btn" data-fulltext="${esc(b.fullText)}" data-title="Thinking" onclick="openFullFromData(this)">Open full text in new tab &#8599;</button>` : '';
        html += `<div class="conv-think">&#128173; ${esc(b.preview ?? '')}${b.fullText ? '\u2026' : ''}</div>${viewBtn}`;
      } else if (b.type === 'tool_use') {
        html += `<div class="conv-tool"><strong class="tool-name">&#128295; ${esc(b.name ?? '')}</strong><code class="tool-input">${esc(b.preview ?? '')}</code></div>`;
      } else if (b.type === 'tool_result') {
        const viewBtn = b.fullText ? `<button class="view-full-btn" data-fulltext="${esc(b.fullText)}" data-title="Tool Result" onclick="openFullFromData(this)">Open full text in new tab &#8599;</button>` : '';
        html += `<div class="conv-result"><span class="result-ok">&#10003;</span> tool_result: ${esc(b.preview ?? '')}${b.fullText ? '\u2026' : ''}</div>${viewBtn}`;
        if (b.nestedImages) {
          for (const img of b.nestedImages) html += `<div class="conv-image">&#128444; image (${esc(img.media_type)}, ~${img.size_kb}KB)</div>`;
        }
      } else if (b.type === 'image') {
        html += `<div class="conv-image">&#128444; image (${esc(b.media_type ?? 'unknown')}, ~${b.size_kb}KB)</div>`;
      }
    }
    html += '</div></div>';
  }
  return html;
}

export let _uid = 0;
export function uid(): string { return `u${++_uid}`; }

export function subItem(id: string, header: string, body: string, open = false): string {
  const display = open ? 'block' : 'none';
  const arrow = open ? '&#9660;' : '&#9658;';
  return `<div class="sub-item"><div class="sub-row" onclick="toggleSub('${id}')"><span class="sub-arr" id="${id}-arr">${arrow}</span><span class="sub-hdr">${header}</span></div><div id="${id}" style="display:${display}" class="sub-body">${body}</div></div>`;
}

export function renderCard(req: CcrRequest, index: number): string {
  const id = uid();
  const pg = req.parallelGroup;
  let pgBadge = '';
  if (pg) {
    if (pg.role === 'fork') {
      pgBadge = `<span class="badge pg-fork">&#8659; ${pg.branchCount ?? 0} parallel</span>`;
    } else if (pg.role === 'join') {
      pgBadge = `<span class="badge pg-join">&#8853; joined</span>`;
    } else {
      pgBadge = `<span class="badge pg-branch">&#9889; BRANCH</span>`;
    }
  }

  // Sanitize model strings — CCR can emit literal "undefined" or "null"
  const origModel = (req.originalModel && req.originalModel !== 'undefined' && req.originalModel !== 'null') ? req.originalModel : null;
  const rtdModel = (req.routedModel && req.routedModel !== 'undefined' && req.routedModel !== 'null') ? req.routedModel : null;
  const modelText = origModel && rtdModel
    ? `${origModel} \u2192 ${rtdModel}`
    : (rtdModel ?? origModel ?? '');

  let html = `<div class="req-card" data-scenario="${esc(req.scenario)}" data-status="${req.allFallbacksFailed ? 'error' : 'ok'}">`;

  // Collapsed row
  html += `<div class="req-row" onclick="toggleCard('${id}')">`;
  html += `<span class="rn">#${index + 1}</span>`;
  html += scenarioBadge(req.scenario);
  const tb = thinkingBadge(req);
  if (tb) html += tb;
  if (pgBadge) html += pgBadge;
  html += `<span class="rm">${esc(modelText)}</span>`;
  html += reqStatus(req);
  html += `<span class="rt">${fmtMs(req.responseTime)}</span>`;
  html += `<span class="chevron" id="${id}-chevron">&#9660;</span>`;
  html += '</div>';

  // Expanded body
  html += `<div id="${id}" style="display:none" class="req-body">`;

  // Flat metadata line
  const metaParts: string[] = [];
  if (origModel) metaParts.push(`<span class="mk">Original Model</span> ${esc(origModel)}`);
  if (rtdModel) metaParts.push(`<span class="mk">Routed Model</span> ${esc(rtdModel)}`);
  if (req.provider) metaParts.push(`<span class="mk">Provider</span> ${esc(req.provider)}`);
  metaParts.push(`<span class="mk">Scenario</span> ${esc(req.scenario)}`);
  metaParts.push(`<span class="mk">Messages</span> ${req.messageCount}`);
  metaParts.push(`<span class="mk">Tools</span> ${req.toolCount}`);
  if (req.maxTokens) metaParts.push(`<span class="mk">Max Tokens</span> ${fmtNum(req.maxTokens)}`);
  if (req.temperature !== null) metaParts.push(`<span class="mk">Temperature</span> ${req.temperature}`);
  html += `<div class="meta-line">${metaParts.join('  ')}</div>`;

  // Token line
  if (req.inputTokens || req.outputTokens) {
    const tokParts = [
      `<span class="mk">Input Tokens</span> <span class="tok-in">${fmtNum(req.inputTokens)}</span>`,
      `<span class="mk">Output Tokens</span> <span class="tok-out">${fmtNum(req.outputTokens)}</span>`,
    ];
    if (req.cacheReadTokens) tokParts.push(`<span class="mk">Cache Read</span> ${fmtNum(req.cacheReadTokens)}`);
    if (req.cacheWriteTokens) tokParts.push(`<span class="mk">Cache Write</span> ${fmtNum(req.cacheWriteTokens)}`);
    html += `<div class="tok-line">${tokParts.join('  ')}</div>`;
  }

  // REQUEST section
  const sysLen = req.systemPrompt?.length ?? 0;
  const queryLen = req.userQuery?.length ?? 0;
  const injTotal = req.injectedContext.reduce((s, ic) => s + ic.body.length, 0);

  let reqBody = '';
  if (req.systemPrompt) {
    const sysTruncated = sysLen > 3000;
    const viewAllBtn = sysTruncated ? `<button class="view-full-btn" data-fulltext="${esc(req.systemPrompt)}" data-title="System Prompt" onclick="openFullFromData(this)">Open full text in new tab &#8599;</button>` : '';
    reqBody += subItem(uid(), `System Prompt <span class="sd">(${fmtNum(sysLen)} chars)</span>`, `<div class="text-scroll-wrap"><pre class="cb text-preview">${esc(req.systemPrompt.slice(0, 3000))}${sysTruncated ? '\n\n\u2026 (truncated)' : ''}</pre></div>${viewAllBtn}`);
  }
  if (req.injectedContext.length > 0) {
    let injBody = '';
    for (const ic of req.injectedContext) {
      const icTruncated = ic.body.length > 3000;
      const icViewBtn = icTruncated ? `<button class="view-full-btn" data-fulltext="${esc(ic.body)}" data-title="${esc(ic.label)}" onclick="openFullFromData(this)">Open full text in new tab &#8599;</button>` : '';
      injBody += `<div class="inj-item"><span class="badge sc-injected">${esc(ic.label)}</span><div class="text-scroll-wrap"><pre class="cb sm-cb text-preview">${esc(ic.body.slice(0, 3000))}${icTruncated ? '\n\n\u2026' : ''}</pre></div>${icViewBtn}</div>`;
    }
    reqBody += subItem(uid(), `Injected Context <span class="sd">(${req.injectedContext.length} blocks, ${fmtNum(injTotal)} chars)</span>`, injBody);
  }
  if (req.toolDefinitions.length > 0) {
    const toolsBody = req.toolDefinitions.map(t => {
      const fullDesc = t.description ?? '';
      // First sentence only for the collapsed header label
      const firstSentence = (fullDesc.match(/^[^.!?]+[.!?]/) ?? [])[0]?.trim() ?? fullDesc.slice(0, 80);
      const descShort = firstSentence.length > 80 ? firstSentence.slice(0, 80) + '…' : firstSentence;
      // Build parameter table from input_schema
      const schema: any = t.input_schema;
      const props: Record<string, any> = schema?.properties ?? {};
      const required: string[] = schema?.required ?? [];
      let paramTable = '';
      const paramKeys = Object.keys(props);
      if (paramKeys.length > 0) {
        const rows = paramKeys.map(pName => {
          const p = props[pName];
          const pType = Array.isArray(p.type) ? p.type.join(' | ') : (p.type ?? '');
          const pReq = required.includes(pName) ? '<span class="param-req">required</span>' : '<span class="param-opt">optional</span>';
          const pDesc = esc(p.description ?? '');
          return `<tr><td class="param-name">${esc(pName)}</td><td class="param-type">${esc(pType)}</td><td>${pReq}</td><td class="param-desc">${pDesc}</td></tr>`;
        }).join('');
        paramTable = `<table class="param-table"><thead><tr><th>Parameter</th><th>Type</th><th></th><th>Description</th></tr></thead><tbody>${rows}</tbody></table>`;
      }
      // Show first sentence as description intro, then table
      const descIntro = firstSentence ? `<p class="tool-full-desc">${esc(firstSentence)}</p>` : '';
      const noSchemaBody = paramKeys.length === 0 && fullDesc ? (() => {
        const preview = fullDesc.slice(0, 300);
        const hasMore = fullDesc.length > 300;
        const btn = hasMore ? `<button class="view-full-btn" data-fulltext="${esc(fullDesc)}" data-title="${esc(t.name)} description" onclick="openFullFromData(this)">Open full text in new tab &#8599;</button>` : '';
        return `<p class="tool-full-desc dim-text">${esc(preview)}${hasMore ? '\u2026' : ''}</p>${btn}`;
      })() : '';
      const toolBody = `${descIntro}${paramTable}${noSchemaBody}`;
      const toolHeader = `<span class="tool-def-name">${esc(t.name)}</span>${descShort ? `<span class="tool-def-desc"> — ${esc(descShort)}</span>` : ''}`;
      return subItem(uid(), toolHeader, toolBody);
    }).join('');
    reqBody += subItem(uid(), `Tool Definitions <span class="sd">(${req.toolDefinitions.length} tools)</span>`, `<div class="tool-defs-list">${toolsBody}</div>`);
  }
  if (req.userQuery) {
    const qHasMore = req.userQuery.length > 500;
    const qViewBtn = qHasMore ? `<button class="view-full-btn" data-fulltext="${esc(req.userQuery)}" data-title="User Query" onclick="openFullFromData(this)">View full (${fmtNum(queryLen)} chars) &#8599;</button>` : '';
    reqBody += subItem(uid(), `User Query <span class="sd">(${fmtNum(queryLen)} chars)</span>`, `<pre class="cb">${esc(req.userQuery.slice(0, 500))}${qHasMore ? '<span class="cb-trunc">\u2026</span>' : ''}</pre>${qViewBtn}`, true);
  }
  if (req.conversationSummary?.length) reqBody += subItem(uid(), `Conversation <span class="sd">(${req.conversationSummary.length} messages)</span>`, `<div class="conv-scroll">${renderConversation(req.conversationSummary)}</div>`);
  if (req.thinkingMode) {
    const budget = req.thinkingBudget ?? 0;
    const effortLabel = budget >= 10000 ? 'high' : budget >= 3000 ? 'medium' : budget > 0 ? 'low' : 'adaptive';
    const thinkDetail = req.thinkingMode === 'adaptive'
      ? 'adaptive (model chooses budget)'
      : `effort: ${effortLabel}${req.thinkingBudget ? ` (${fmtNum(req.thinkingBudget)} token budget)` : ''}`;
    reqBody += `<div class="sub-row no-toggle" style="color:var(--purple)">&#129504; Reasoning: ${thinkDetail}</div>`;
  }

  html += `<div class="sec-block sec-req"><div class="sec-hdr" onclick="toggleSec('${uid()}')">&#9654; REQUEST <span class="sec-d">(${req.messageCount} msgs \xb7 ${req.toolCount} tools)</span></div><div class="sec-body">${reqBody}</div></div>`;

  // RESPONSE section
  const thinkLines = req.thinkingText ? req.thinkingText.split('\n').length : 0;
  const thinkLen = req.thinkingText?.length ?? 0;
  const respLines = req.responseText ? req.responseText.split('\n').length : 0;
  const respLen = req.responseText?.length ?? 0;

  const RESP_PREVIEW = 3000;
  let respBody = '';
  if (req.thinkingText) {
    const thinkHasMore = thinkLen > RESP_PREVIEW;
    const thinkBtn = thinkHasMore ? `<button class="view-full-btn" data-fulltext="${esc(req.thinkingText)}" data-title="Thinking" onclick="openFullFromData(this)">Open full text in new tab &#8599;</button>` : '';
    respBody += subItem(uid(), `Thinking <span class="sd">(${thinkLines} lines, ${fmtNum(thinkLen)} chars)</span>`, `<div class="text-scroll-wrap"><pre class="cb purple-cb text-preview">${esc(req.thinkingText.slice(0, RESP_PREVIEW))}${thinkHasMore ? '\n\n\u2026 (truncated)' : ''}</pre></div>${thinkBtn}`, true);
  }
  if (req.responseText) {
    const respHasMore = respLen > RESP_PREVIEW;
    const respBtn = respHasMore ? `<button class="view-full-btn" data-fulltext="${esc(req.responseText)}" data-title="Response Text" onclick="openFullFromData(this)">Open full text in new tab &#8599;</button>` : '';
    respBody += subItem(uid(), `Response Text <span class="sd">(${respLines} lines, ${fmtNum(respLen)} chars)</span>`, `<div class="text-scroll-wrap"><pre class="cb text-preview">${esc(req.responseText.slice(0, RESP_PREVIEW))}${respHasMore ? '\n\n\u2026 (truncated)' : ''}</pre></div>${respBtn}`);
  }
  if (req.toolCallDetails.length > 0) {
    const tcLen = req.toolCallDetails.reduce((s, tc) => s + tc.input.length, 0);
    let tcBody = '';
    for (const tc of req.toolCallDetails) {
      let inputDisplay = tc.input;
      try { inputDisplay = JSON.stringify(JSON.parse(tc.input), null, 2); } catch { /* not JSON, use raw */ }
      const tcHasMore = inputDisplay.length > RESP_PREVIEW;
      const tcBtn = tcHasMore ? `<button class="view-full-btn" data-fulltext="${esc(inputDisplay)}" data-title="${esc(tc.name)} input" onclick="openFullFromData(this)">Open full text in new tab &#8599;</button>` : '';
      const tcContent = `<div class="text-scroll-wrap"><pre class="cb sm-cb text-preview">${esc(inputDisplay.slice(0, RESP_PREVIEW))}${tcHasMore ? '\n\n\u2026 (truncated)' : ''}</pre></div>${tcBtn}`;
      tcBody += subItem(uid(), `&#128295; ${esc(tc.name)} <span class="sd">(id: ${esc(tc.id)})</span>`, tcContent);
    }
    respBody += subItem(uid(), `Tool Calls <span class="sd">(${req.toolCallDetails.length}, ${fmtNum(tcLen)} chars)</span>`, tcBody);
  }
  // Error block — shown when there is any routing/stream error, regardless of HTTP status.
  // HTTP >= 400 failures use "HTTP NNN"; SSE stream errors in a 200 response use "Stream Error".
  if (req.routingError) {
    const ERR_THRESHOLD = 500;
    const errMsg = req.routingError;
    const isHttpErr = req.statusCode !== null && req.statusCode >= 400;
    const errLabel = isHttpErr ? `HTTP ${req.statusCode}` : 'Stream Error';
    const hasMore = errMsg.length > ERR_THRESHOLD;
    const btn = hasMore
      ? `<button class="view-full-btn" data-fulltext="${esc(errMsg)}" data-title="Error Details" onclick="openFullFromData(this)">Open full text in new tab &#8599;</button>`
      : '';
    respBody = `<div class="err-block"><div class="err-label">&#10060; ${errLabel}</div><pre class="cb err-cb">${esc(errMsg.slice(0, ERR_THRESHOLD))}${hasMore ? '\n\u2026 (truncated)' : ''}</pre>${btn}</div>` + respBody;
  }
  if (!respBody) respBody = `<div class="sub-row no-toggle dim-text">No response content captured</div>`;

  html += `<div class="sec-block sec-resp"><div class="sec-hdr">&#9668; RESPONSE</div><div class="sec-body">${respBody}</div></div>`;

  // Fallback chain
  if (req.fallbackChain.length > 1 || req.hasFallback) html += renderFallbackChain(req.fallbackChain);

  // Event timeline
  if (req.events.length > 0) html += renderEventTimeline(req.events);

  html += '</div></div>';
  return html;
}

export function renderPgArms(forkReq: CcrRequest, branches: Array<[CcrRequest, number]>): string {
  const pg = forkReq.parallelGroup!;
  const branchListId = uid();
  let html = `<div class="pg-arms">`;

  // Left column: local tool calls (green accent)
  html += `<div class="pg-col pg-col-local"><div class="pg-col-hdr">&#9678; LOCAL TOOLS</div>`;
  if (pg.localTools?.length) {
    for (const t of pg.localTools) {
      const tc = forkReq.toolCallDetails.find(d => d.id === t.id);
      let detail = '';
      if (tc?.input) {
        try {
          const inp = JSON.parse(tc.input);
          const raw = String(inp.file_path ?? inp.command ?? inp.path ?? inp.url ?? inp.query ?? Object.values(inp)[0] ?? '');
          detail = raw.length > 50 ? raw.slice(0, 50) + '\u2026' : raw;
        } catch { /* non-JSON input */ }
      }
      html += `<div class="local-tool-row">`;
      html += `<span class="local-tool-name">${esc(t.name)}</span>`;
      if (detail) html += `<span class="local-tool-detail">${esc(detail)}</span>`;
      html += `</div>`;
    }
  } else {
    html += `<span class="dim-text">none</span>`;
  }
  html += `</div>`;

  // Right column: background branches (blue accent), collapsed by default
  html += `<div class="pg-col pg-col-subagent"><div class="pg-col-hdr">&#8659; TASK SUBAGENT &middot; ${branches.length} REQUESTS</div>`;
  if (branches.length > 0) {
    const branchCards = branches.map(([branch, idx]) => renderCard(branch, idx)).join('');
    html += subItem(branchListId, `Show ${branches.length} background requests`, branchCards);
  } else {
    html += `<span class="dim-text">none</span>`;
  }
  html += `</div></div>`;

  return html;
}

export function generateEmptyStateHtml(msg: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>CCR Visualizer</title>
<style>:root{--bg:#f8fafc;--text:#0f172a}@media(prefers-color-scheme:dark){:root{--bg:#0f172a;--text:#f1f5f9}}body{font-family:ui-sans-serif,system-ui,sans-serif;background:var(--bg);color:var(--text);display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}</style>
</head><body><div style="text-align:center"><div style="font-size:48px;margin-bottom:16px">&#128202;</div><div style="font-size:18px;font-weight:600">${esc(msg)}</div></div></body></html>`;
}

export function generateHtml(reqs: CcrRequest[], turns: CcrRequest[][]): string {
  _uid = 0;
  const total = reqs.length;
  const ok = reqs.filter(r => r.statusCode !== null && r.statusCode < 400).length;
  const fb = reqs.filter(r => r.hasFallback).length;
  const failed = reqs.filter(r => r.allFallbacksFailed).length;
  const durs = reqs.filter(r => r.responseTime !== null).map(r => r.responseTime!);
  const avgDur = durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : 0;
  const totalIn = reqs.reduce((s, r) => s + r.inputTokens, 0);
  const totalOut = reqs.reduce((s, r) => s + r.outputTokens, 0);
  const uniqueModels = new Set(reqs.map(r => r.routedModel ?? r.originalModel).filter(Boolean)).size;
  const pctOk = total ? Math.round((ok / total) * 100) : 0;
  const pctFb = total ? Math.round((fb / total) * 100) : 0;

  const scenarios = Array.from(new Set(reqs.map(r => r.scenario)));
  const branchRids = new Set(reqs.filter(r => r.parallelGroup?.role === 'branch').map(r => r.reqId));

  let cardsHtml = '';
  const rendered = new Set<string>();
  reqs.forEach((req, i) => {
    if (rendered.has(req.reqId)) return;
    if (req.parallelGroup?.role === 'fork') {
      rendered.add(req.reqId);
      const gid = req.parallelGroup.groupId;
      const joinRid = req.parallelGroup.joinRid ?? null;
      const branches: Array<[CcrRequest, number]> = [];
      reqs.forEach((r2, i2) => { if (r2.parallelGroup?.role === 'branch' && r2.parallelGroup.groupId === gid) { branches.push([r2, i2]); rendered.add(r2.reqId); } });

      // Wrap fork + arms + join in a visual group connected by a left accent line
      cardsHtml += `<div class="pg-group">`;
      cardsHtml += renderCard(req, i);
      if (branches.length > 0) cardsHtml += renderPgArms(req, branches);
      if (joinRid) {
        const joinIdx = reqs.findIndex(r => r.reqId === joinRid);
        const joinReq = joinIdx >= 0 ? reqs[joinIdx] : null;
        if (joinReq) { cardsHtml += renderCard(joinReq, joinIdx); rendered.add(joinRid); }
      }
      cardsHtml += `</div>`;
    } else if (branchRids.has(req.reqId)) {
      rendered.add(req.reqId);
    } else {
      cardsHtml += renderCard(req, i);
      rendered.add(req.reqId);
    }
  });

  const filterBtns = [
    `<button class="f-btn active" onclick="filterCards('all',this)">All (${total})</button>`,
    ...scenarios.map(s => `<button class="f-btn" onclick="filterCards('${esc(s)}',this)">${esc(s)} (${reqs.filter(r => r.scenario === s).length})</button>`),
    failed > 0 ? `<button class="f-btn f-err" onclick="filterErrors(this)">errors only (${failed})</button>` : '',
  ].filter(Boolean).join('');

  const timelineSvg = renderTimeline(reqs, turns);
  const costHtml = renderCostTable(reqs);
  const narrativeHtml = generateNarrative(reqs, turns);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>CCR Log Visualizer</title>
<style>
${VISUALIZER_CSS}
</style>
</head>
<body>
<div class="page-wrap">
<div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:16px">
  <div>
    <h1 style="font-size:22px;font-weight:800;letter-spacing:-.02em">CCR Log Visualizer</h1>
  </div>
  <span style="font-size:11px;color:var(--text-dim)">${new Date().toLocaleString()}</span>
</div>

<div class="stats-row">
  <div class="stat-box"><div class="stat-n">${total}</div><div class="stat-lbl">API Requests</div></div>
  <div class="stat-box"><div class="stat-n ${pctOk === 100 ? 'stat-n-ok' : ''}">${pctOk}%</div><div class="stat-sub">${ok}/${total}</div><div class="stat-lbl">Success Rate</div></div>
  <div class="stat-box"><div class="stat-n ${pctFb > 0 ? 'stat-n-warn' : ''}">${pctFb}%</div><div class="stat-sub">${fb}/${total}</div><div class="stat-lbl">Fallback Rate</div></div>
  <div class="stat-box"><div class="stat-n">${uniqueModels}</div><div class="stat-lbl">Models Used</div></div>
  <div class="stat-box"><div class="stat-n">${fmtMs(avgDur)}</div><div class="stat-lbl">Avg Response Time</div></div>
  <div class="stat-box"><div class="stat-n stat-n-blue">${fmtTok(totalIn)}</div><div class="stat-lbl">Input Tokens</div></div>
  <div class="stat-box"><div class="stat-n stat-n-grn">${fmtTok(totalOut)}</div><div class="stat-lbl">Output Tokens</div></div>
</div>

<div class="section-card" style="margin-bottom:14px">
  <div class="section-hdr" style="cursor:default">What Happened</div>
  <div class="section-body-pad what-happened">${narrativeHtml}</div>
</div>

${costHtml}

<div class="timeline-wrap">
  <div class="timeline-hdr">
    <span class="timeline-hdr-l">Request Timeline</span>
    <button class="tl-btn" id="tl-btn" onclick="toggleTimeline()">Show Timeline &#9660;</button>
  </div>
  <div id="timeline-body" class="timeline-body" style="display:none">${timelineSvg}</div>
</div>

<div class="filter-row">
  <span class="f-lbl">Filter:</span>
  ${filterBtns}
</div>

<div id="cards-container">${cardsHtml}</div>
</div>

<script>
${VISUALIZER_JS}
</script>
</body>
</html>`;
}
