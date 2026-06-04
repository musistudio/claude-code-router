/**
 * Custom router for Claude Code Router (CCR)
 * Implements tier-based routing based on task classification
 */

function classifyTask(req, policy) {
  const body = req.body || {};
  const messages = body.messages || [];
  const tools = body.tools || [];
  
  let userMessage = '';
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      const content = messages[i].content;
      if (typeof content === 'string') userMessage = content;
      else if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text') userMessage += block.text;
        }
      }
      break;
    }
  }
  
  const lowerMsg = (userMessage || '').toLowerCase();
  const toolCount = tools.length;
  const tokenCount = req.tokenCount || 0;
  const hasThinking = !!body.thinking;
  
  const opusKeywords = ['review', 'architecture', 'security', 'debug', 'fix', 'refactor', 'design', 'analyze', 'audit'];
  const haikuKeywords = ['format', 'summarize', 'list', 'count', 'simple', 'organize'];
  
  let tier = 'sonnet';
  let scenario = 'default';
  
  if (hasThinking || tokenCount > 50000 || toolCount > 16) {
    tier = 'opus';
    scenario = 'high_complexity';
  } else if (opusKeywords.some(kw => lowerMsg.includes(kw))) {
    tier = 'opus';
    scenario = 'keyword_complex';
  } else if (tokenCount > 24000 || toolCount > 16) {
    tier = 'opus';
    scenario = 'complex';
  } else if (haikuKeywords.some(kw => lowerMsg.includes(kw)) || (tokenCount < 5000 && toolCount <= 4 && messages.length <= 3)) {
    tier = 'haiku';
    scenario = 'simple';
  }
  
  return { tier, scenario };
}

function router(req, config) {
  const tierMap = config.TierRouting || {
    opus: config.Router?.think || 'deepseek,deepseek-reasoner',
    sonnet: config.Router?.default || 'openai,gpt-4o',
    haiku: config.Router?.background || 'openai,gpt-4o-mini'
  };
  
  const result = classifyTask(req, config.GatewayPolicy || {});
  const route = tierMap[result.tier] || tierMap.sonnet;
  
  console.log('[Router] Tier=' + result.tier + ' Scenario=' + result.scenario + ' -> ' + route);
  req.gatewayScenario = result.tier + ':' + result.scenario;
  return route;
}

module.exports = function(req, config) { return router(req, config); };
