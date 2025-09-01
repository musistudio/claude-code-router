import React, { useState } from 'react';
import { 
  RefreshCw, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  AlertTriangle,
  CheckCircle,
  Calendar,
  Bell,
  Settings,
  DollarSign
} from 'lucide-react';
import { useCostOptimizer } from '@/hooks/useCostOptimizer';
import { 
  ActionButton 
} from '@/components/ui/ActionButton';
import { 
  StatusIndicator, 
  type StatusType 
} from '@/components/ui/StatusIndicator';
import { 
  ModalWindow, 
  ModalActions 
} from '@/components/ui/ModalWindow';
import { StatsCard } from '@/components/ui/StatsCard';

interface CostUsageForecastProps {
  className?: string;
}

// Mock data for demonstration - will be replaced with real data
const mockCostData = {
  currentMonth: {
    actual: 347,
    estimated: 347,
    projected: 420,
    budget: 500
  },
  previousMonth: {
    actual: 282,
    budget: 400
  },
  dailyForecast: [
    { hour: '08:00', requests: 1200, cost: 12 },
    { hour: '10:00', requests: 1800, cost: 18 },
    { hour: '12:00', requests: 2100, cost: 21 },
    { hour: '14:00', requests: 2300, cost: 23 },
    { hour: '16:00', requests: 1900, cost: 19 },
    { hour: '18:00', requests: 1500, cost: 15 },
    { hour: '20:00', requests: 900, cost: 9 }
  ],
  budgetAlert: {
    status: 'warning' as const,
    message: 'La ritmul actual, vei depăși bugetul cu ~$120',
    threshold: 80
  }
};

export function CostUsageForecast({ className = '' }: CostUsageForecastProps) {
  const { costData, loading: dataLoading, error, refetch } = useCostOptimizer({
    interval: 30000, // 30 seconds
    initialLoad: true,
    retryCount: 3,
  });
  
  const [showAlerts, setShowAlerts] = useState(false);
  const [showOptimization, setShowOptimization] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Handle refresh
  const handleRefresh = async () => {
    setLoading(true);
    try {
      await refetch();
    } catch (err) {
      console.error('Error refreshing data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Handle set alerts
  const handleSetAlerts = () => {
    setShowAlerts(true);
  };

  // Handle optimize costs
  const handleOptimizeCosts = () => {
    setShowOptimization(true);
  };

  // Handle adjust budget
  const handleAdjustBudget = () => {
    alert('Adjusting budget...');
  };

  // Calculate trend using real data
  const currentMonthActual = costData ? costData.currentMonthlyCost : mockCostData.currentMonth.actual;
  const previousMonthActual = costData ? (costData.currentMonthlyCost * 0.8) : mockCostData.previousMonth.actual; // Reverse the 80% projection
  const trendPercentage = Math.round(((currentMonthActual - previousMonthActual) / previousMonthActual) * 100);
  const trendType = trendPercentage > 0 ? 'up' : trendPercentage < 0 ? 'down' : 'stable';
  const trendIcon = trendType === 'up' ? 
    <TrendingUp className="h-4 w-4 text-red-500" /> : 
    trendType === 'down' ? 
      <TrendingDown className="h-4 w-4 text-green-500" /> : 
      <Minus className="h-4 w-4 text-gray-500" />;

  // Calculate budget usage using real data
  const currentCost = costData ? costData.currentMonthlyCost : mockCostData.currentMonth.actual;
  const budget = costData ? (costData.currentMonthlyCost / 0.8) : mockCostData.currentMonth.budget; // Reverse the 80% projection
  const budgetUsage = Math.round((currentCost / budget) * 100);
  const budgetStatus: StatusType = budgetUsage > 90 ? 'error' : budgetUsage > 75 ? 'warning' : 'success';

  return (
    <div className={`widget-container p-6 h-full flex flex-col ${className}`}>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/20 rounded-lg">
              <DollarSign className="h-6 w-6 text-green-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Cost & Usage Forecast</h2>
              <p className="text-sm text-gray-400">
                Predictii buget și usage cu alerte preventive
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ActionButton
              variant="secondary"
              size="small"
              onClick={handleRefresh}
              loading={loading}
              icon={<RefreshCw className="h-4 w-4" />}
            >
              Refresh
            </ActionButton>
          </div>
        </div>
      </div>

      {/* Main Forecast Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Current Month Cost */}
        <StatsCard
          title="Cost ACEASTĂ LUNĂ"
          value={`$${currentMonthActual.toFixed(2)}`}
          change={{
            value: trendPercentage,
            type: trendPercentage > 0 ? 'negative' : 'positive',
            label: 'vs luna trecută'
          }}
          trend={trendType}
          status={budgetUsage > 90 ? 'error' : budgetUsage > 75 ? 'warning' : 'success'}
          icon={<DollarSign className="h-5 w-5" />}
        />

        {/* Budget Status */}
        <StatsCard
          title="Buget utilizat"
          value={`${budgetUsage}%`}
          change={{
            value: budget - currentCost,
            type: 'positive',
            label: 'rămași'
          }}
          status={budgetStatus}
          icon={<Calendar className="h-5 w-5" />}
        />
      </div>

      {/* Budget Alert */}
      {(budgetUsage > 80) && (
        <div className={`p-4 rounded-lg mb-6 flex items-start gap-3 ${
          budgetUsage > 90 
            ? 'bg-red-500/10 border border-red-500/20' 
            : 'bg-yellow-500/10 border border-yellow-500/20'
        }`}>
          <AlertTriangle className={`h-5 w-5 flex-shrink-0 mt-0.5 ${
            budgetUsage > 90 
              ? 'text-red-400' 
              : 'text-yellow-400'
          }`} />
          <div>
            <div className={`font-medium ${
              budgetUsage > 90 
                ? 'text-red-400' 
                : 'text-yellow-400'
            }`}>
              {budgetUsage > 90 
                ? `Buget depășit cu ${((currentCost - budget) / budget * 100).toFixed(1)}%` 
                : `Aproape de limita bugetului (${budgetUsage}%)`}
            </div>
            <div className="text-xs text-gray-400 mt-1">
              Verifică recomandările de optimizare mai jos
            </div>
          </div>
        </div>
      )}

      {/* Daily Forecast */}
      <div className="mb-6">
        <h3 className="font-medium text-white mb-3 flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          Predictii zilnice
        </h3>
        <div className="overflow-x-auto">
          <div className="flex gap-3 pb-2 min-w-max">
            {mockCostData.dailyForecast.map((forecast, index) => (
              <div 
                key={index} 
                className="p-3 bg-gray-800/50 rounded-lg border border-gray-700/50 min-w-[120px]"
              >
                <div className="text-sm font-medium text-white">{forecast.hour}</div>
                <div className="text-xs text-gray-400 mt-1">{forecast.requests} requests</div>
                <div className="text-sm font-medium text-green-400 mt-1">${forecast.cost}</div>
                {forecast.requests === Math.max(...mockCostData.dailyForecast.map(f => f.requests)) && (
                  <div className="text-xs text-blue-400 mt-1 flex items-center gap-1">
                    <Bell className="h-3 w-3" />
                    Peak
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mt-auto pt-4 border-t border-gray-700/50">
        <div className="flex flex-wrap gap-2">
          <ActionButton
            variant="secondary"
            onClick={handleSetAlerts}
            icon={<Bell className="h-4 w-4" />}
          >
            Setează alerte
          </ActionButton>
          
          <ActionButton
            variant="secondary"
            onClick={handleOptimizeCosts}
            icon={<Settings className="h-4 w-4" />}
          >
            Optimizează costuri
          </ActionButton>
          
          <ActionButton
            variant="secondary"
            onClick={handleAdjustBudget}
            icon={<DollarSign className="h-4 w-4" />}
          >
            Ajustează buget
          </ActionButton>
        </div>
      </div>

      {/* Alerts Modal */}
      <ModalWindow
        title="Setări Alertă Buget"
        isOpen={showAlerts}
        onClose={() => setShowAlerts(false)}
        size="normal"
      >
        <div className="space-y-4">
          <div className="p-4 bg-gray-800/50 rounded-lg">
            <h4 className="font-medium text-white mb-2">Alerte automate</h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-white">Depășire buget</div>
                  <div className="text-sm text-gray-400">Alertă când bugetul este depășit</div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" defaultChecked />
                  <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-white">Apropiere de buget</div>
                  <div className="text-sm text-gray-400">Alertă la 80% din buget</div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" defaultChecked />
                  <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-white">Usage peak</div>
                  <div className="text-sm text-gray-400">Alertă la ore de utilizare intensă</div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" />
                  <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            </div>
          </div>
          
          <div className="p-4 bg-gray-800/50 rounded-lg">
            <h4 className="font-medium text-white mb-2">Notificări</h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-white">Email</div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" defaultChecked />
                  <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
              
              <div className="flex items-center justify-between">
                <div className="text-white">Slack</div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" />
                  <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>
            </div>
          </div>
        </div>
        
        <ModalActions
          onClose={() => setShowAlerts(false)}
          onSave={() => {
            alert('Setări alerte salvate!');
            setShowAlerts(false);
          }}
          saveLabel="Salvează"
        />
      </ModalWindow>

      {/* Optimization Modal */}
      <ModalWindow
        title="Optimizare Costuri"
        isOpen={showOptimization}
        onClose={() => setShowOptimization(false)}
        size="large"
      >
        <div className="space-y-6">
          <div className="p-4 bg-gray-800/50 rounded-lg">
            <h4 className="font-medium text-white mb-3">Recomandări de optimizare</h4>
            <div className="space-y-3">
              <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
                <div className="flex items-start gap-2">
                  <CheckCircle className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-medium text-white">Folosește cache-ul pentru request-uri repetitive</div>
                    <div className="text-sm text-gray-400 mt-1">
                      Activarea cache-ului poate reduce costurile cu până la 30% pentru request-urile repetitive.
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded">
                        Economisire estimată: $45/lună
                      </span>
                      <ActionButton variant="primary" size="small">
                        Activează
                      </ActionButton>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="p-3 bg-purple-500/10 rounded-lg border border-purple-500/20">
                <div className="flex items-start gap-2">
                  <CheckCircle className="h-5 w-5 text-purple-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-medium text-white">Schimbă la model mai ieftin pentru sarcini simple</div>
                    <div className="text-sm text-gray-400 mt-1">
                      Pentru sarcini simple, folosește modele mai ieftine precum GPT-3.5 în loc de GPT-4.
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded">
                        Economisire estimată: $75/lună
                      </span>
                      <ActionButton variant="primary" size="small">
                        Configurează
                      </ActionButton>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="p-3 bg-orange-500/10 rounded-lg border border-orange-500/20">
                <div className="flex items-start gap-2">
                  <CheckCircle className="h-5 w-5 text-orange-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-medium text-white">Rate limiting pentru utilizatori intensivi</div>
                    <div className="text-sm text-gray-400 mt-1">
                      Implementează rate limiting pentru utilizatorii care consumă resurse excesive.
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded">
                        Economisire estimată: $30/lună
                      </span>
                      <ActionButton variant="primary" size="small">
                        Configurează
                      </ActionButton>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="p-4 bg-gray-800/50 rounded-lg">
            <h4 className="font-medium text-white mb-3">Setări avansate</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Buget lunar maxim ($)</label>
                <input 
                  type="number" 
                  defaultValue={mockCostData.currentMonth.budget}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Alertă la (%) din buget</label>
                <input 
                  type="number" 
                  defaultValue="80"
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
                />
              </div>
            </div>
          </div>
        </div>
        
        <ModalActions
          onClose={() => setShowOptimization(false)}
          onSave={() => {
            alert('Setări de optimizare aplicate!');
            setShowOptimization(false);
          }}
          saveLabel="Aplică schimbările"
        />
      </ModalWindow>
    </div>
  );
}