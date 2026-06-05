import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Eye, EyeOff, X, Plus, Zap, ArrowLeft, Check } from "lucide-react";
import type { Provider } from "@/types";

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

interface QuickAddProviderProps {
  onClose: () => void;
  onAdd: (provider: Provider) => void;
  transformers: { name: string; endpoint: string | null }[];
}

export function QuickAddProvider({ onClose, onAdd, transformers }: QuickAddProviderProps) {
  const { t } = useTranslation();
  const [selectedPreset, setSelectedPreset] = useState<ProviderPreset | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [providerName, setProviderName] = useState("");
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [modelInput, setModelInput] = useState("");
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  const handleSelectPreset = (preset: ProviderPreset) => {
    setSelectedPreset(preset);
    setProviderName(preset.name === "\u{81EA}\u{5B9A}\u{4E49}" ? "" : preset.name);
    setApiBaseUrl(preset.api_base_url);
    setModels([...preset.models]);
    setApiKey("");
    setApiKeyError(null);
    setNameError(null);
  };

  const handleBack = () => {
    setSelectedPreset(null);
    setApiKey("");
    setProviderName("");
    setApiBaseUrl("");
    setModels([]);
    setApiKeyError(null);
    setNameError(null);
  };

  const handleAddModel = () => {
    const trimmed = modelInput.trim();
    if (trimmed && !models.includes(trimmed)) {
      setModels([...models, trimmed]);
      setModelInput("");
    }
  };

  const handleRemoveModel = (index: number) => {
    setModels(models.filter((_, i) => i !== index));
  };

  const handleAdd = () => {
    if (!providerName.trim()) {
      setNameError(t("quick_add.name_required"));
      return;
    }
    if (!apiKey.trim()) {
      setApiKeyError(t("quick_add.api_key_required"));
      return;
    }

    const provider: Provider = {
      name: providerName.trim(),
      api_base_url: apiBaseUrl.trim(),
      api_key: apiKey.trim(),
      models,
    };

    if (selectedPreset?.transformer && selectedPreset.transformer !== "") {
      const transformerName = selectedPreset.transformer;
      const found = transformers.find(
        (t) => t.name === transformerName || t.name.endsWith("/" + transformerName)
      );
      if (found) {
        provider.transformer = { use: [found.name] };
      }
    }

    onAdd(provider);
  };

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[85vh] flex flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {selectedPreset ? (
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleBack}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
            ) : (
              <Zap className="h-5 w-5" />
            )}
            {t("quick_add.title")}
          </DialogTitle>
          <DialogDescription>{t("quick_add.description")}</DialogDescription>
        </DialogHeader>

        {!selectedPreset ? (
          <div className="overflow-y-auto flex-grow p-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {PROVIDER_PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  onClick={() => handleSelectPreset(preset)}
                  className="flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-all hover:border-blue-300 hover:bg-blue-50/50 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  <div className="flex items-center gap-2 w-full">
                    <span className="text-2xl flex-shrink-0">{preset.icon}</span>
                    <span className="font-medium text-sm leading-tight">{preset.name}</span>
                  </div>
                  <p className="text-xs text-gray-500 leading-snug">{preset.description}</p>
                  {preset.models.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {preset.models.slice(0, 3).map((model) => (
                        <Badge key={model} variant="secondary" className="text-[10px] px-1.5 py-0">
                          {model}
                        </Badge>
                      ))}
                      {preset.models.length > 3 && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          +{preset.models.length - 3}
                        </Badge>
                      )}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4 p-4 overflow-y-auto flex-grow">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">{selectedPreset.icon}</span>
              <div>
                <div className="font-medium">{selectedPreset.name}</div>
                <div className="text-xs text-gray-500">{selectedPreset.description}</div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="qa-name">{t("quick_add.name")}</Label>
              <Input
                id="qa-name"
                value={providerName}
                onChange={(e) => {
                  setProviderName(e.target.value);
                  if (nameError) setNameError(null);
                }}
                placeholder={t("quick_add.name")}
                className={nameError ? "border-red-500" : ""}
              />
              {nameError && <p className="text-sm text-red-500">{nameError}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="qa-api_base_url">{t("providers.api_base_url")}</Label>
              <Input
                id="qa-api_base_url"
                value={apiBaseUrl}
                onChange={(e) => setApiBaseUrl(e.target.value)}
                placeholder="https://api.example.com/v1"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="qa-api_key">{t("quick_add.api_key")}</Label>
              <div className="relative">
                <Input
                  id="qa-api_key"
                  type={showApiKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    if (apiKeyError) setApiKeyError(null);
                  }}
                  placeholder={t("quick_add.api_key_placeholder")}
                  className={apiKeyError ? "border-red-500 pr-10" : "pr-10"}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 h-8 w-8"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              {apiKeyError && <p className="text-sm text-red-500">{apiKeyError}</p>}
            </div>

            <div className="space-y-2">
              <Label>{t("quick_add.models")}</Label>
              <div className="flex gap-2">
                <Input
                  value={modelInput}
                  onChange={(e) => setModelInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddModel();
                    }
                  }}
                  placeholder={t("providers.models_placeholder")}
                  className="flex-1"
                />
                <Button onClick={handleAddModel} size="sm" variant="outline">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {models.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-2">
                  {models.map((model, index) => (
                    <Badge key={index} variant="outline" className="font-normal flex items-center gap-1">
                      {model}
                      <button
                        type="button"
                        className="ml-1 rounded-full hover:bg-gray-200"
                        onClick={() => handleRemoveModel(index)}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {selectedPreset.transformer && (
              <div className="rounded-md bg-green-50 border border-green-200 p-3">
                <div className="flex items-center gap-2 text-sm text-green-700">
                  <Check className="h-4 w-4" />
                  <span>
                    {t("quick_add.transformer_auto")}: <strong>{selectedPreset.transformer}</strong>
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {selectedPreset && (
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" onClick={handleBack}>
              {t("app.cancel")}
            </Button>
            <Button onClick={handleAdd}>
              <Plus className="h-4 w-4 mr-2" />
              {t("quick_add.add")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
