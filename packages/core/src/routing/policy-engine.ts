export type RoutePolicy<TContext, TDecision> = {
  evaluate: (context: TContext) => TDecision | undefined;
  id: string;
};

export type RoutePolicyMatch<TDecision> = {
  decision: TDecision;
  policyId: string;
};

export class RoutePolicyEngine<TContext, TDecision> {
  constructor(private readonly policies: RoutePolicy<TContext, TDecision>[]) {}

  evaluate(context: TContext): RoutePolicyMatch<TDecision> | undefined {
    for (const policy of this.policies) {
      const decision = policy.evaluate(context);
      if (decision) {
        return { decision, policyId: policy.id };
      }
    }
    return undefined;
  }
}
