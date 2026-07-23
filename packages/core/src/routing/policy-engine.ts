export type RoutePolicy<TContext, TDecision> = {
  evaluate: (context: TContext) => Promise<TDecision | undefined> | TDecision | undefined;
  id: string;
};

export type RoutePolicyMatch<TDecision> = {
  decision: TDecision;
  policyId: string;
};

export class RoutePolicyEngine<TContext, TDecision> {
  constructor(private readonly policies: RoutePolicy<TContext, TDecision>[]) {}

  async evaluate(context: TContext): Promise<RoutePolicyMatch<TDecision> | undefined> {
    for (const policy of this.policies) {
      const decision = await policy.evaluate(context);
      if (decision) {
        return { decision, policyId: policy.id };
      }
    }
    return undefined;
  }
}
