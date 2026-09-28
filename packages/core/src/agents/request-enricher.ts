export type AgentRequestEnricher<TRequest> = {
  enrich: (request: TRequest) => void;
  id: string;
  matches: (request: TRequest) => boolean;
};

export function applyAgentRequestEnrichers<TRequest>(
  request: TRequest,
  enrichers: AgentRequestEnricher<TRequest>[]
): string[] {
  const applied: string[] = [];
  for (const enricher of enrichers) {
    if (!enricher.matches(request)) {
      continue;
    }
    enricher.enrich(request);
    applied.push(enricher.id);
  }
  return applied;
}
