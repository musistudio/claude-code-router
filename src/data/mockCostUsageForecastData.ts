interface CostUsageForecast {
  currentMonth: {
    actual: number;
    estimated: number;
    projected: number;
    budget: number;
  };
  previousMonth: {
    actual: number;
    budget: number;
  };
  dailyForecast: {
    hour: string;
    requests: number;
    cost: number;
  }[];
  budgetAlert: {
    status: 'warning' | 'error';
    message: string;
    threshold: number;
  };
}

export const mockCostUsageForecast: CostUsageForecast = {
  currentMonth: {
    actual: 347,
    estimated: 347,
    projected: 420,
    budget: 500,
  },
  previousMonth: {
    actual: 282,
    budget: 400,
  },
  dailyForecast: [
    { hour: '08:00', requests: 1200, cost: 12 },
    { hour: '10:00', requests: 1800, cost: 18 },
    { hour: '12:00', requests: 2100, cost: 21 },
    { hour: '14:00', requests: 2300, cost: 23 },
    { hour: '16:00', requests: 1900, cost: 19 },
    { hour: '18:00', requests: 1500, cost: 15 },
    { hour: '20:00', requests: 900, cost: 9 },
  ],
  budgetAlert: {
    status: 'warning',
    message: 'La ritmul actual, vei depăși bugetul cu ~$120',
    threshold: 80,
  },
};
