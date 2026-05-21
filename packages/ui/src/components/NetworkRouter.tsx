import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useConfig } from "./ConfigProvider";
import { Combobox } from "./ui/combobox";
import { api } from "@/lib/api";

export function NetworkRouter() {
  const { t } = useTranslation();
  const { config, setConfig } = useConfig();
  const [networkState, setNetworkState] = useState<string>('unknown');

  useEffect(() => {
    const fetchState = async () => {
      try {
        const result = await api.getNetworkState();
        setNetworkState(result.state);
      } catch {}
    };
    fetchState();
    const timer = setInterval(fetchState, 30000);
    return () => clearInterval(timer);
  }, []);

  if (!config) return null;

  const networkRouter = config.NetworkRouter || { enabled: false, checkInterval: 30, hostname: 'w3.huawei.com', intranetPattern: '^10\\.', states: {} };
  const providers = Array.isArray(config.Providers) ? config.Providers : [];

  const modelOptions = providers.flatMap((provider: any) => {
    if (!provider) return [];
    const models = Array.isArray(provider.models) ? provider.models : [];
    const providerName = provider.name || "Unknown Provider";
    return models.map((model: string) => ({
      value: `${providerName},${model || "Unknown Model"}`,
      label: `${providerName}, ${model || "Unknown Model"}`,
    }));
  });

  const handleFieldChange = (field: string, value: any) => {
    const newNetworkRouter = { ...networkRouter, [field]: value };
    setConfig({ ...config, NetworkRouter: newNetworkRouter });
  };

  const handleStateRouterChange = (stateType: 'intranet' | 'external', field: string, value: string) => {
    const states = { ...networkRouter.states };
    const stateConfig = { ...(states[stateType] || {}) };
    stateConfig.Router = { ...(stateConfig.Router || {}), [field]: value };
    states[stateType] = stateConfig;
    handleFieldChange('states', states);
  };

  const getStateLabel = () => {
    if (networkState === 'intranet') return t('network_router.intranet');
    if (networkState === 'external') return t('network_router.external');
    return t('network_router.unknown');
  };

  const getStateColor = () => {
    if (networkState === 'intranet') return 'text-green-600';
    if (networkState === 'external') return 'text-blue-600';
    return 'text-gray-500';
  };

  const renderStateConfig = (stateType: 'intranet' | 'external', title: string) => {
    const routerConfig = networkRouter.states?.[stateType]?.Router || {};
    return (
      <div className="flex-1 min-w-0">
        <Label className="text-sm font-medium mb-2 block">{title}</Label>
        <div className="space-y-2">
          {['default', 'background', 'think', 'longContext', 'webSearch'].map((field) => (
            <div key={`${stateType}-${field}`} className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t(`router.${field}`)}</Label>
              <Combobox
                options={modelOptions}
                value={routerConfig[field] || ""}
                onChange={(value) => handleStateRouterChange(stateType, field, value)}
                placeholder={t('network_router.selectModel')}
                searchPlaceholder={t('network_router.searchModel')}
                emptyPlaceholder={t('network_router.noModelFound')}
              />
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <Card className="flex h-full flex-col rounded-lg border shadow-sm">
      <CardHeader className="border-b p-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{t('network_router.title')}</CardTitle>
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium ${getStateColor()}`}>
              {getStateLabel()}
            </span>
            <select
              value={networkRouter.enabled ? "true" : "false"}
              onChange={(e) => handleFieldChange('enabled', e.target.value === "true")}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="false">{t('common.no')}</option>
              <option value="true">{t('common.yes')}</option>
            </select>
          </div>
        </div>
      </CardHeader>
      {networkRouter.enabled && (
        <CardContent className="flex-grow overflow-y-auto p-4 space-y-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <Label>{t('network_router.hostname')}</Label>
              <Input
                value={networkRouter.hostname || 'w3.huawei.com'}
                onChange={(e) => handleFieldChange('hostname', e.target.value)}
                placeholder="w3.huawei.com"
              />
            </div>
            <div className="w-32">
              <Label>{t('network_router.check_interval')}</Label>
              <Input
                type="number"
                value={networkRouter.checkInterval || 30}
                onChange={(e) => handleFieldChange('checkInterval', parseInt(e.target.value) || 30)}
                placeholder="30"
              />
            </div>
          </div>
          <div className="flex gap-4">
            {renderStateConfig('intranet', t('network_router.intranet_router'))}
            {renderStateConfig('external', t('network_router.external_router'))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
