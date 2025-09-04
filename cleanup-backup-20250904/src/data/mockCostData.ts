interface OptimizationRecommendation {
  id: string;
  title: string;
  description: string;
  savings: number;
  action: string;
  status: 'PENDING' | 'APPLIED' | 'DISMISSED';
}

interface CostOptimization {
  totalSavings: number;
  recommendations: OptimizationRecommendation[];
  currentMonthlyCost: number;
  projectedMonthlyCost: number;
}

export let mockCostData: CostOptimization = {
  totalSavings: 150.00,
  currentMonthlyCost: 550.00,
  projectedMonthlyCost: 400.00,
  recommendations: [
    {
      id: 'rec-123-model-switch',
      title: 'Switch to a more cost-effective model',
      description: 'The \"/summarize\" route can use \"claude-3-haiku\" instead of \"claude-3-opus\" for a 75% cost reduction with minimal impact on quality for this task.',
      savings: 120.00,
      action: 'SWITCH_MODEL',
      status: 'PENDING'
    },
    {
      id: 'rec-456-caching',
      title: 'Enable caching for repetitive requests',
      description: 'The \"/translate\" route receives many duplicate requests. Enabling a 1-hour cache could reduce calls by 30%.',
      savings: 30.00,
      action: 'ENABLE_CACHING',
      status: 'PENDING'
    },
    {
      id: 'rec-789-rate-limit',
      title: 'Implement rate limiting on dev endpoint',
      description: 'The \"/dev-test\" endpoint has been successfully rate-limited, preventing accidental cost overruns.',
      savings: 55.00,
      action: 'RATE_LIMIT',
      status: 'APPLIED'
    }
  ]
};