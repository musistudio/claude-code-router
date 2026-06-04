import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Eye, EyeOff, X, Plus, Check, Zap, ArrowRight, ArrowLeft } from 'lucide-react';

interface ProviderPreset {
  name: string;
  api_base_url: string;
  models: string[];
  transformer: string;
  description: string;
  icon: string;
}

const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    name: "GLM (Zhipu AI)",
    api_base_url: "https://open.bigmodel.cn/api/paas/v4",
    models: ["glm-5.1", "glm-4.7", "glm-4"],
    transformer: "glm",
    description: "智谱AI GLM系列模型，支持深度思考128K输出",
    icon: "\u{1F916}",
  },
  {
    name: "DeepSeek",
    api_base_url: "https://api.deepseek.com/v1",
    models: ["deepseek-v4-pro", "deepseek-v4-flash", "deepseek-reasoner"],
    transformer: "deepseek",
    description: "DeepSeek V4系列，支持reasoning_content",
    icon: "\u{1F50D}",
  },
  {
    name: "OpenAI",
    api_base_url: "https://api.openai.com/v1",
    models: ["gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano", "o3", "o4-mini"],
    transformer: "",
    description: "OpenAI GPT系列",
    icon: "\u{1F7E2}",
  },
  {
    name: "Anthropic",
    api_base_url: "https://api.anthropic.com",
    models: ["claude-sonnet-4-6", "claude-opus-4-6", "claude-haiku-4-5"],
    transformer: "anthropic",
    description: "Claude系列，支持thinking和cache_control",
    icon: "\u{1F7E0}",
  },
  {
    name: "Google Gemini",
    api_base_url: "https://generativelanguage.googleapis.com/v1beta",
    models: ["gemini-2.5-flash", "gemini-2.5-pro"],
    transformer: "gemini",
    description: "Google Gemini 2.5系列",
    icon: "\u{1F535}",
  },
  {
    name: "Ollama (\u{672C}\u{5730})",
    api_base_url: "http://localhost:11434/v1",
    models: ["qwen3:8b", "deepseek-r1:8b", "llama3.1:8b"],
    transformer: "",
    description: "Ollama本地模型",
    icon: "\u{1F999}",
  },
  {
    name: "Kimi (Moonshot)",
    api_base_url: "https://api.moonshot.cn/v1",
    models: ["kimi-k2.5", "kimi-k1.5"],
    transformer: "",
    description: "Moonshot Kimi系列",
    icon: "\u{1F319}",
  },
  {
    name: "Qwen (DashScope)",
    api_base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    models: ["qwen-max", "qwen-plus", "qwen-turbo"],
    transformer: "",
    description: "通义千问系列",
    icon: "\u2601\uFE0F",
  },
  {
    name: "\u{81EA}\u{5B9A}\u{4E49}",
    api_base_url: "",
    models: [],
    transformer: "",
    description: "\u{81EA}\u{5B9A}\u{4E49}API\u{63D0}\u{4F9B}\u{5546}",
    icon: "\u2699\uFE0F",
  },
];

interface ProviderConfig {
  name: string;
  api_base_url: string;
  api_key: string;
  models: string[];
  transformer: string;
  icon: string;
}

export function SetupWizard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [selectedPresets, setSelectedPresets] = useState<ProviderPreset[]>([]);
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelInput, setModelInput] = useState<Record<number, string>>({});
  const [showApiKeys, setShowApiKeys] = useState<Record<number, boolean>>({});

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const status = await api.getSetupStatus();
        if (!status.needsSetup) {
          navigate('/dashboard');
        }
      } catch {}
    };
    checkStatus();
  }, [navigate]);

  const handleTogglePreset = (preset: ProviderPreset) => {
    setSelectedPresets(prev => {
      const exists = prev.find(p => p.name === preset.name);
      if (exists) {
        return prev.filter(p => p.name !== preset.name);
      }
      return [...prev, preset];
    });
  };

  const goToStep2 = () => {
    if (selectedPresets.length === 0) return;
    const initialProviders: ProviderConfig[] = selectedPresets.map(preset => ({
      name: preset.name === "\u{81EA}\u{5B9A}\u{4E49}" ? "" : preset.name,
      api_base_url: preset.api_base_url,
      api_key: "",
      models: [...preset.models],
      transformer: preset.transformer,
      icon: preset.icon,
    }));
    setProviders(initialProviders);
    setStep(2);
  };

  const updateProvider = (index: number, field: keyof ProviderConfig, value: any) => {
    setProviders(prev => prev.map((p, i) => i === index ? { ...p, [field]: value } : p));
  };

  const addModel = (index: number) => {
    const input = (modelInput[index] || '').trim();
    if (!input) return;
    setProviders(prev => prev.map((p, i) => {
      if (i !== index) return p;
      if (p.models.includes(input)) return p;
      return { ...p, models: [...p.models, input] };
    }));
    setModelInput(prev => ({ ...prev, [index]: '' }));
  };

  const removeModel = (providerIndex: number, modelIndex: number) => {
    setProviders(prev => prev.map((p, i) => {
      if (i !== providerIndex) return p;
      return { ...p, models: p.models.filter((_, mi) => mi !== modelIndex) };
    }));
  };

  const handleSave = async () => {
    const incomplete = providers.find(p => !p.name.trim() || !p.api_base_url.trim() || !p.api_key.trim());
    if (incomplete) {
      setError(t('setup.apiKey', 'API Key') + ' / ' + t('setup.baseUrl', 'Base URL') + ' required for all providers');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await api.saveSetup({
        providers: providers.map(p => ({
          name: p.name,
          api_base_url: p.api_base_url,
          api_key: p.api_key,
          models: p.models,
          ...(p.transformer ? { transformer: { use: [p.transformer] } } : {}),
        })),
      });

      api.setApiKey('local-dev-key');
      setSuccess(true);

      setTimeout(() => {
        navigate('/dashboard');
        window.location.reload();
      }, 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <Check className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-xl font-semibold mb-2">{t('setup.success', 'Configuration saved! Reloading...')}</h2>
            <p className="text-gray-500">{t('setup.redirecting', 'Redirecting to dashboard...')}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-3xl">
        <CardHeader>
          <div className="flex items-center justify-between mb-2">
            <CardTitle className="text-2xl">{t('setup.title', 'Setup Wizard')}</CardTitle>
            <div className="flex gap-2">
              {[1, 2, 3].map(s => (
                <div
                  key={s}
                  className={`h-2 w-8 rounded-full transition-colors ${s <= step ? 'bg-blue-600' : 'bg-gray-200'}`}
                />
              ))}
            </div>
          </div>
          <CardDescription>
            {step === 1 && t('setup.welcome', 'Welcome to Claude Code Router')}
            {step === 2 && t('setup.step2', 'Configure API Keys')}
            {step === 3 && t('setup.step3', 'Review & Save')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">{t('setup.selectProviders', 'Select one or more providers to configure')}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[60vh] overflow-y-auto p-1">
                {PROVIDER_PRESETS.map(preset => {
                  const isSelected = selectedPresets.some(p => p.name === preset.name);
                  return (
                    <button
                      key={preset.name}
                      onClick={() => handleTogglePreset(preset)}
                      className={`flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-all focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50 shadow-sm'
                          : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/50 hover:shadow-sm'
                      }`}
                    >
                      <div className="flex items-center gap-2 w-full">
                        <span className="text-2xl flex-shrink-0">{preset.icon}</span>
                        <span className="font-medium text-sm leading-tight flex-1">{preset.name}</span>
                        {isSelected && <Check className="h-4 w-4 text-blue-600 flex-shrink-0" />}
                      </div>
                      <p className="text-xs text-gray-500 leading-snug">{preset.description}</p>
                      {preset.models.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {preset.models.slice(0, 3).map(model => (
                            <Badge key={model} variant="secondary" className="text-[10px] px-1.5 py-0">{model}</Badge>
                          ))}
                          {preset.models.length > 3 && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">+{preset.models.length - 3}</Badge>
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="flex justify-end">
                <Button onClick={goToStep2} disabled={selectedPresets.length === 0}>
                  {t('setup.step2', 'Next')}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6 max-h-[60vh] overflow-y-auto p-1">
              {providers.map((provider, index) => (
                <Card key={index} className="border">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{selectedPresets[index]?.icon || '\u2699\uFE0F'}</span>
                      <CardTitle className="text-base">{provider.name || t('setup.customProvider', 'Custom Provider')}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-1.5">
                      <Label>{t('quick_add.name', 'Provider Name')}</Label>
                      <Input
                        value={provider.name}
                        onChange={e => updateProvider(index, 'name', e.target.value)}
                        placeholder={t('quick_add.name', 'Provider Name')}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t('setup.baseUrl', 'API Base URL')}</Label>
                      <Input
                        value={provider.api_base_url}
                        onChange={e => updateProvider(index, 'api_base_url', e.target.value)}
                        placeholder="https://api.example.com/v1"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t('setup.apiKey', 'API Key')}</Label>
                      <div className="relative">
                        <Input
                          type={showApiKeys[index] ? "text" : "password"}
                          value={provider.api_key}
                          onChange={e => updateProvider(index, 'api_key', e.target.value)}
                          placeholder={t('setup.apiKeyPlaceholder', 'Enter your API key')}
                          className="pr-10"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute right-2 top-1/2 transform -translate-y-1/2 h-8 w-8"
                          onClick={() => setShowApiKeys(prev => ({ ...prev, [index]: !prev[index] }))}
                        >
                          {showApiKeys[index] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t('setup.models', 'Models')}</Label>
                      <div className="flex gap-2">
                        <Input
                          value={modelInput[index] || ''}
                          onChange={e => setModelInput(prev => ({ ...prev, [index]: e.target.value }))}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              addModel(index);
                            }
                          }}
                          placeholder={t('providers.models_placeholder', 'Enter model name and press Enter to add')}
                          className="flex-1"
                        />
                        <Button onClick={() => addModel(index)} size="sm" variant="outline">
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                      {provider.models.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-2">
                          {provider.models.map((model, mi) => (
                            <Badge key={mi} variant="outline" className="font-normal flex items-center gap-1">
                              {model}
                              <button
                                type="button"
                                className="ml-1 rounded-full hover:bg-gray-200"
                                onClick={() => removeModel(index, mi)}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    {provider.transformer && (
                      <div className="rounded-md bg-green-50 border border-green-200 p-3">
                        <div className="flex items-center gap-2 text-sm text-green-700">
                          <Check className="h-4 w-4" />
                          <span>
                            {t('quick_add.transformer_auto', 'Transformer will be auto-configured')}: <strong>{provider.transformer}</strong>
                          </span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(1)}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  {t('setup.step1', 'Back')}
                </Button>
                <Button onClick={() => setStep(3)}>
                  {t('setup.step3', 'Review & Save')}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">{t('setup.review', 'Review your configuration')}</p>
              <div className="max-h-[50vh] overflow-y-auto space-y-3">
                {providers.map((provider, index) => (
                  <div key={index} className="rounded-lg border p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl">{selectedPresets[index]?.icon || '\u2699\uFE0F'}</span>
                      <span className="font-medium">{provider.name}</span>
                    </div>
                    <div className="text-sm text-gray-600 space-y-1">
                      <p>{t('setup.baseUrl', 'API Base URL')}: {provider.api_base_url}</p>
                      <p>{t('setup.apiKey', 'API Key')}: {'*'.repeat(Math.min(provider.api_key.length, 20)) || '(empty)'}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {provider.models.map((model, mi) => (
                          <Badge key={mi} variant="secondary" className="text-xs">{model}</Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-sm text-gray-500">
                {t('setup.providerCount', '{{count}} providers configured', { count: providers.length })}
              </p>
              {error && <div className="text-sm text-red-500 bg-red-50 rounded p-2">{error}</div>}
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(2)} disabled={saving}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  {t('setup.step2', 'Back')}
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? (
                    <>
                      <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      {t('setup.saving', 'Saving configuration...')}
                    </>
                  ) : (
                    <>
                      <Zap className="mr-2 h-4 w-4" />
                      {t('setup.save', 'Save & Start')}
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
