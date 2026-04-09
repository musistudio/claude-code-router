import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useConfig } from "./ConfigProvider";
import { ProviderList } from "./ProviderList";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { X, Trash2, Plus, Eye, EyeOff, Search, XCircle, ExternalLink, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Combobox } from "@/components/ui/combobox";
import { ComboInput } from "@/components/ui/combo-input";
import { api } from "@/lib/api";
import type {
  OpenAICodexAuthStatus,
  OpenAICodexDeviceSession,
  Provider
} from "@/types";

interface ProviderType extends Provider {}

export function Providers() {
  const { t } = useTranslation();
  const { config, setConfig } = useConfig();
  const [editingProviderIndex, setEditingProviderIndex] = useState<number | null>(null);
  const [deletingProviderIndex, setDeletingProviderIndex] = useState<number | null>(null);
  const [hasFetchedModels, setHasFetchedModels] = useState<Record<number, boolean>>({});
  const [providerParamInputs, setProviderParamInputs] = useState<Record<string, {name: string, value: string}>>({});
  const [modelParamInputs, setModelParamInputs] = useState<Record<string, {name: string, value: string}>>({});
  const [availableTransformers, setAvailableTransformers] = useState<{name: string; endpoint: string | null;}[]>([]);
  const [editingProviderData, setEditingProviderData] = useState<ProviderType | null>(null);
  const [isNewProvider, setIsNewProvider] = useState<boolean>(false);
  const [providerTemplates, setProviderTemplates] = useState<ProviderType[]>([]);
  const [showApiKey, setShowApiKey] = useState<Record<number, boolean>>({});
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [openAICodexAuthStatus, setOpenAICodexAuthStatus] = useState<OpenAICodexAuthStatus | null>(null);
  const [isLoadingOpenAICodexAuthStatus, setIsLoadingOpenAICodexAuthStatus] = useState<boolean>(false);
  const [isOpenAICodexLoginDialogOpen, setIsOpenAICodexLoginDialogOpen] = useState<boolean>(false);
  const [openAICodexLoginSession, setOpenAICodexLoginSession] = useState<OpenAICodexDeviceSession | null>(null);
  const [isStartingOpenAICodexLogin, setIsStartingOpenAICodexLogin] = useState<boolean>(false);
  const [openAICodexLoginError, setOpenAICodexLoginError] = useState<string | null>(null);
const [isFetchingModels, setIsFetchingModels] = useState<boolean>(false);
  const comboInputRef = useRef<HTMLInputElement>(null);
  const defaultOpenAICodexApiBaseUrl = "https://chatgpt.com/backend-api/codex/responses";

  useEffect(() => {
    const fetchProviderTemplates = async () => {
      try {
        const response = await fetch('https://pub-0dc3e1677e894f07bbea11b17a29e032.r2.dev/providers.json');
        if (response.ok) {
          const data = await response.json();
          setProviderTemplates(data || []);
        } else {
          console.error('Failed to fetch provider templates');
        }
      } catch (error) {
        console.error('Failed to fetch provider templates:', error);
      }
    };

    fetchProviderTemplates();
  }, []);

  // Fetch available transformers when component mounts
  useEffect(() => {
    const fetchTransformers = async () => {
      try {
        const response = await api.get<{transformers: {name: string; endpoint: string | null;}[]}>('/transformers');
        setAvailableTransformers(response.transformers);
      } catch (error) {
        console.error('Failed to fetch transformers:', error);
      }
    };

    fetchTransformers();
  }, []);

  const currentOpenAICodexAuthPath =
    editingProviderData?.auth?.type === "openai_codex_oauth"
      ? editingProviderData.auth.codex_auth_path || "~/.codex/auth.json"
      : openAICodexAuthStatus?.authPath || "~/.codex/auth.json";

  const loadOpenAICodexAuthStatus = async (authPath?: string) => {
    setIsLoadingOpenAICodexAuthStatus(true);
    try {
      const status = await api.getOpenAICodexAuthStatus(authPath);
      setOpenAICodexAuthStatus(status);
    } catch (error) {
      console.error("Failed to load OpenAI/Codex auth status:", error);
      setOpenAICodexAuthStatus(null);
    } finally {
      setIsLoadingOpenAICodexAuthStatus(false);
    }
  };

  useEffect(() => {
    const authPath =
      editingProviderData?.auth?.type === "openai_codex_oauth"
        ? editingProviderData.auth.codex_auth_path
        : undefined;
    loadOpenAICodexAuthStatus(authPath);
  }, [editingProviderData?.auth?.type, editingProviderData?.auth?.type === "openai_codex_oauth" ? editingProviderData.auth.codex_auth_path : undefined]);

  useEffect(() => {
    if (!openAICodexLoginSession || openAICodexLoginSession.state !== "pending") {
      return;
    }

    const timeout = window.setTimeout(async () => {
      try {
        const nextSession = await api.pollOpenAICodexDeviceLogin(openAICodexLoginSession.sessionId);
        setOpenAICodexLoginSession(nextSession);
        if (nextSession.state === "completed") {
          setOpenAICodexLoginError(null);
          await loadOpenAICodexAuthStatus(nextSession.authPath);
        } else if (nextSession.state === "error" || nextSession.state === "expired") {
          setOpenAICodexLoginError(nextSession.error || t("providers.codex_login_failed"));
        }
      } catch (error) {
        console.error("Failed to poll OpenAI/Codex login session:", error);
        setOpenAICodexLoginError((error as Error).message);
      }
    }, Math.max(openAICodexLoginSession.intervalSeconds, 2) * 1000);

    return () => window.clearTimeout(timeout);
  }, [openAICodexLoginSession, t]);

  // Handle case where config is null or undefined
  if (!config) {
    return (
      <Card className="flex h-full flex-col rounded-lg border shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between border-b p-4">
          <CardTitle className="text-lg">{t("providers.title")}</CardTitle>
        </CardHeader>
        <CardContent className="flex-grow flex items-center justify-center p-4">
          <div className="text-gray-500">Loading providers configuration...</div>
        </CardContent>
      </Card>
    );
  }

  // Validate config.Providers to ensure it's an array
  const validProviders = Array.isArray(config.Providers) ? config.Providers : [];

  const getProviderAuthType = (provider?: ProviderType | null) =>
    provider?.auth?.type === "openai_codex_oauth" ? "openai_codex_oauth" : "api_key";


  const handleAddProvider = () => {
    const newProvider: ProviderType = {
      name: "",
      api_base_url: "",
      api_key: "",
      auth: { type: "api_key" },
      models: [],
    };
    setEditingProviderIndex(config.Providers.length);
    setEditingProviderData(newProvider);
    setIsNewProvider(true);
    // Reset API key visibility and error when adding new provider
    setShowApiKey(prev => ({
      ...prev,
      [config.Providers.length]: false
    }));
    setApiKeyError(null);
    setNameError(null);
  };

  const handleEditProvider = (index: number) => {
    // Find the actual index in the original providers array
    const actualIndex = validProviders.indexOf(filteredProviders[index]);
    const provider = config.Providers[actualIndex];
    setEditingProviderIndex(actualIndex);
    setEditingProviderData(JSON.parse(JSON.stringify(provider))); // 深拷贝
    setIsNewProvider(false);
    // Reset API key visibility and error when opening edit dialog
    setShowApiKey(prev => ({
      ...prev,
      [actualIndex]: false
    }));
    setApiKeyError(null);
    setNameError(null);
  };

  const handleSaveProvider = () => {
    if (!editingProviderData) return;
    
    // Validate name
    if (!editingProviderData.name || editingProviderData.name.trim() === '') {
      setNameError(t("providers.name_required"));
      return;
    }
    
    // Check for duplicate names (case-insensitive)
    const trimmedName = editingProviderData.name.trim();
    const isDuplicate = config.Providers.some((provider, index) => {
      // For edit mode, skip checking the current provider being edited
      if (!isNewProvider && index === editingProviderIndex) {
        return false;
      }
      return provider.name.toLowerCase() === trimmedName.toLowerCase();
    });
    
    if (isDuplicate) {
      setNameError(t("providers.name_duplicate"));
      return;
    }
    
    const authType = getProviderAuthType(editingProviderData);

    // Validate API key when provider uses static key auth
    if (authType === 'api_key' && (!editingProviderData.api_key || editingProviderData.api_key.trim() === '')) {
      setApiKeyError(t("providers.api_key_required"));
      return;
    }
    
    // Clear errors if validation passes
    setApiKeyError(null);
    setNameError(null);
    
    if (editingProviderIndex !== null && editingProviderData) {
      const newProviders = [...config.Providers];
      if (isNewProvider) {
        newProviders.push(editingProviderData);
      } else {
        newProviders[editingProviderIndex] = editingProviderData;
      }
      setConfig({ ...config, Providers: newProviders });
    }
    // Reset API key visibility for this provider
    if (editingProviderIndex !== null) {
      setShowApiKey(prev => {
        const newState = { ...prev };
        delete newState[editingProviderIndex];
        return newState;
      });
    }
    setEditingProviderIndex(null);
    setEditingProviderData(null);
    setIsNewProvider(false);
  };

  const handleCancelAddProvider = () => {
    // Reset fetched models state for this provider
    if (editingProviderIndex !== null) {
      setHasFetchedModels(prev => {
        const newState = { ...prev };
        delete newState[editingProviderIndex];
        return newState;
      });
      // Reset API key visibility for this provider
      setShowApiKey(prev => {
        const newState = { ...prev };
        delete newState[editingProviderIndex];
        return newState;
      });
    }
    setEditingProviderIndex(null);
    setEditingProviderData(null);
    setIsNewProvider(false);
    setApiKeyError(null);
    setNameError(null);
  };

  // Handle deletion by setting the correct index in the state
  const handleSetDeletingProviderIndex = (filteredIndex: number) => {
    setDeletingProviderIndex(filteredIndex);
  };

  // Handle deletion by passing the filtered index to get the actual index in the original array
  const handleRemoveProvider = (filteredIndex: number) => {
    // Find the actual index in the original providers array
    const actualIndex = validProviders.indexOf(filteredProviders[filteredIndex]);
    const newProviders = [...config.Providers];
    newProviders.splice(actualIndex, 1);
    setConfig({ ...config, Providers: newProviders });
    setDeletingProviderIndex(null);
  };

  const handleProviderChange = (_index: number, field: string, value: string) => {
    if (editingProviderData) {
      const updatedProvider = { ...editingProviderData, [field]: value };
      setEditingProviderData(updatedProvider);
    }
  };

  const handleProviderAuthTypeChange = (authType: "api_key" | "openai_codex_oauth") => {
    if (!editingProviderData) return;

    const updatedProvider: ProviderType = {
      ...editingProviderData,
      api_base_url:
        authType === "openai_codex_oauth" && !editingProviderData.api_base_url
          ? defaultOpenAICodexApiBaseUrl
          : editingProviderData.api_base_url,
      auth:
        authType === "openai_codex_oauth"
          ? {
              type: "openai_codex_oauth",
              codex_auth_path:
                editingProviderData.auth?.type === "openai_codex_oauth"
                  ? editingProviderData.auth.codex_auth_path
                  : "~/.codex/auth.json",
            }
          : {
              type: "api_key",
            },
      transformer:
        authType === "openai_codex_oauth" && !editingProviderData.transformer
          ? { use: ["openai-responses"] }
          : editingProviderData.transformer,
    };

    setEditingProviderData(updatedProvider);
    setApiKeyError(null);
  };

  const handleProviderAuthPathChange = (value: string) => {
    if (!editingProviderData) return;

    setEditingProviderData({
      ...editingProviderData,
      auth: {
        type: "openai_codex_oauth",
        codex_auth_path: value,
      },
    });
  };

  const startOpenAICodexLogin = async (authPath?: string) => {
    setIsStartingOpenAICodexLogin(true);
    setOpenAICodexLoginError(null);
    try {
      const session = await api.startOpenAICodexDeviceLogin(authPath);
      setOpenAICodexLoginSession(session);
      setIsOpenAICodexLoginDialogOpen(true);
      window.open(session.verificationUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      console.error("Failed to start OpenAI/Codex login:", error);
      setOpenAICodexLoginError((error as Error).message);
      setIsOpenAICodexLoginDialogOpen(true);
    } finally {
      setIsStartingOpenAICodexLogin(false);
    }
  };

  const cancelOpenAICodexLogin = async () => {
    if (!openAICodexLoginSession) {
      setIsOpenAICodexLoginDialogOpen(false);
      return;
    }

    if (openAICodexLoginSession.state === "pending") {
      try {
        const cancelledSession = await api.cancelOpenAICodexDeviceLogin(openAICodexLoginSession.sessionId);
        setOpenAICodexLoginSession(cancelledSession);
      } catch (error) {
        console.error("Failed to cancel OpenAI/Codex login:", error);
      }
    }

    setIsOpenAICodexLoginDialogOpen(false);
  };

  const fetchAvailableModels = async (provider: ProviderType) => {
    if (provider.auth?.type !== "openai_codex_oauth") {
      return;
    }

    setIsFetchingModels(true);
    try {
      const response = await api.fetchOpenAICodexModels(provider.auth.codex_auth_path);
      const fetchedModels = response.models;
      if (editingProviderData) {
        setEditingProviderData({
          ...editingProviderData,
          models: fetchedModels,
          auth: {
            type: "openai_codex_oauth",
            codex_auth_path: response.authPath,
          },
        });
      }
      if (editingProviderIndex !== null) {
        setHasFetchedModels((prev) => ({
          ...prev,
          [editingProviderIndex]: true,
        }));
      }
      await loadOpenAICodexAuthStatus(response.authPath);
    } catch (error) {
      console.error("Failed to fetch OpenAI/Codex models:", error);
      setOpenAICodexLoginError((error as Error).message);
      setIsOpenAICodexLoginDialogOpen(true);
    } finally {
      setIsFetchingModels(false);
    }
  };

  const createOpenAICodexProvider = async () => {
    const existingNames = new Set(validProviders.map((provider) => provider.name.toLowerCase()));
    let providerName = "openai-codex";
    let suffix = 2;
    while (existingNames.has(providerName.toLowerCase())) {
      providerName = `openai-codex-${suffix}`;
      suffix += 1;
    }

    let models = ["gpt-5.4", "gpt-5.2-codex", "gpt-5-codex-mini"];
    try {
      const response = await api.fetchOpenAICodexModels(currentOpenAICodexAuthPath);
      if (response.models.length > 0) {
        models = response.models;
      }
    } catch (error) {
      console.error("Failed to prefetch OpenAI/Codex models:", error);
    }

    setEditingProviderIndex(config.Providers.length);
    setEditingProviderData({
      name: providerName,
      api_base_url: defaultOpenAICodexApiBaseUrl,
      auth: {
        type: "openai_codex_oauth",
        codex_auth_path: currentOpenAICodexAuthPath,
      },
      api_key: "",
      models,
      transformer: {
        use: ["openai-responses"],
      },
    });
    setIsNewProvider(true);
    setApiKeyError(null);
    setNameError(null);
  };

  const handleProviderTransformerChange = (_index: number, transformerPath: string) => {
    if (!transformerPath || !editingProviderData) return; // Don't add empty transformers
    
    const updatedProvider = { ...editingProviderData };
    
    if (!updatedProvider.transformer) {
      updatedProvider.transformer = { use: [] };
    }
    
    // Add transformer to the use array
    updatedProvider.transformer.use = [...updatedProvider.transformer.use, transformerPath];
    setEditingProviderData(updatedProvider);
  };

  const removeProviderTransformerAtIndex = (_index: number, transformerIndex: number) => {
    if (!editingProviderData) return;
    
    const updatedProvider = { ...editingProviderData };
    
    if (updatedProvider.transformer) {
      const newUseArray = [...updatedProvider.transformer.use];
      newUseArray.splice(transformerIndex, 1);
      updatedProvider.transformer.use = newUseArray;
      
      // If use array is now empty and no other properties, remove transformer entirely
      if (newUseArray.length === 0 && Object.keys(updatedProvider.transformer).length === 1) {
        delete updatedProvider.transformer;
      }
    }
    
    setEditingProviderData(updatedProvider);
  };

  const handleModelTransformerChange = (_providerIndex: number, model: string, transformerPath: string) => {
    if (!transformerPath || !editingProviderData) return; // Don't add empty transformers
    
    const updatedProvider = { ...editingProviderData };
    
    if (!updatedProvider.transformer) {
      updatedProvider.transformer = { use: [] };
    }
    
    // Initialize model transformer if it doesn't exist
    if (!updatedProvider.transformer[model]) {
      updatedProvider.transformer[model] = { use: [] };
    }
    
    // Add transformer to the use array
    updatedProvider.transformer[model].use = [...updatedProvider.transformer[model].use, transformerPath];
    setEditingProviderData(updatedProvider);
  };

  const removeModelTransformerAtIndex = (_providerIndex: number, model: string, transformerIndex: number) => {
    if (!editingProviderData) return;
    
    const updatedProvider = { ...editingProviderData };
    
    if (updatedProvider.transformer && updatedProvider.transformer[model]) {
      const newUseArray = [...updatedProvider.transformer[model].use];
      newUseArray.splice(transformerIndex, 1);
      updatedProvider.transformer[model].use = newUseArray;
      
      // If use array is now empty and no other properties, remove model transformer entirely
      if (newUseArray.length === 0 && Object.keys(updatedProvider.transformer[model]).length === 1) {
        delete updatedProvider.transformer[model];
      }
    }
    
    setEditingProviderData(updatedProvider);
  };


  const addProviderTransformerParameter = (_providerIndex: number, transformerIndex: number, paramName: string, paramValue: string) => {
    if (!editingProviderData) return;
    
    const updatedProvider = { ...editingProviderData };
    
    if (!updatedProvider.transformer) {
      updatedProvider.transformer = { use: [] };
    }
    
    // Add parameter to the specified transformer in use array
    if (updatedProvider.transformer.use && updatedProvider.transformer.use.length > transformerIndex) {
      const targetTransformer = updatedProvider.transformer.use[transformerIndex];
      
      // If it's already an array with parameters, update it
      if (Array.isArray(targetTransformer)) {
        const transformerArray = [...targetTransformer];
        // Check if the second element is an object (parameters object)
        if (transformerArray.length > 1 && typeof transformerArray[1] === 'object' && transformerArray[1] !== null) {
          // Update the existing parameters object
          const existingParams = transformerArray[1] as Record<string, unknown>;
          const paramsObj: Record<string, unknown> = { ...existingParams, [paramName]: paramValue };
          transformerArray[1] = paramsObj;
        } else if (transformerArray.length > 1) {
          // If there are other elements, add the parameters object
          const paramsObj = { [paramName]: paramValue };
          transformerArray.splice(1, transformerArray.length - 1, paramsObj);
        } else {
          // Add a new parameters object
          const paramsObj = { [paramName]: paramValue };
          transformerArray.push(paramsObj);
        }
        
        updatedProvider.transformer.use[transformerIndex] = transformerArray as string | (string | Record<string, unknown> | { max_tokens: number })[];
      } else {
        // Convert to array format with parameters
        const paramsObj = { [paramName]: paramValue };
        updatedProvider.transformer.use[transformerIndex] = [targetTransformer as string, paramsObj];
      }
    }
    
    setEditingProviderData(updatedProvider);
  };


  const removeProviderTransformerParameterAtIndex = (_providerIndex: number, transformerIndex: number, paramName: string) => {
    if (!editingProviderData) return;
    
    const updatedProvider = { ...editingProviderData };
    
    if (!updatedProvider.transformer?.use || updatedProvider.transformer.use.length <= transformerIndex) {
      return;
    }
    
    const targetTransformer = updatedProvider.transformer.use[transformerIndex];
    if (Array.isArray(targetTransformer) && targetTransformer.length > 1) {
      const transformerArray = [...targetTransformer];
      // Check if the second element is an object (parameters object)
      if (typeof transformerArray[1] === 'object' && transformerArray[1] !== null) {
        const paramsObj = { ...(transformerArray[1] as Record<string, unknown>) };
        delete paramsObj[paramName];
        
        // If the parameters object is now empty, remove it
        if (Object.keys(paramsObj).length === 0) {
          transformerArray.splice(1, 1);
        } else {
          transformerArray[1] = paramsObj;
        }
        
        updatedProvider.transformer.use[transformerIndex] = transformerArray;
        setEditingProviderData(updatedProvider);
      }
    }
  };

  const addModelTransformerParameter = (_providerIndex: number, model: string, transformerIndex: number, paramName: string, paramValue: string) => {
    if (!editingProviderData) return;
    
    const updatedProvider = { ...editingProviderData };
    
    if (!updatedProvider.transformer) {
      updatedProvider.transformer = { use: [] };
    }
    
    if (!updatedProvider.transformer[model]) {
      updatedProvider.transformer[model] = { use: [] };
    }
    
    // Add parameter to the specified transformer in use array
    if (updatedProvider.transformer[model].use && updatedProvider.transformer[model].use.length > transformerIndex) {
      const targetTransformer = updatedProvider.transformer[model].use[transformerIndex];
      
      // If it's already an array with parameters, update it
      if (Array.isArray(targetTransformer)) {
        const transformerArray = [...targetTransformer];
        // Check if the second element is an object (parameters object)
        if (transformerArray.length > 1 && typeof transformerArray[1] === 'object' && transformerArray[1] !== null) {
          // Update the existing parameters object
          const existingParams = transformerArray[1] as Record<string, unknown>;
          const paramsObj: Record<string, unknown> = { ...existingParams, [paramName]: paramValue };
          transformerArray[1] = paramsObj;
        } else if (transformerArray.length > 1) {
          // If there are other elements, add the parameters object
          const paramsObj = { [paramName]: paramValue };
          transformerArray.splice(1, transformerArray.length - 1, paramsObj);
        } else {
          // Add a new parameters object
          const paramsObj = { [paramName]: paramValue };
          transformerArray.push(paramsObj);
        }
        
        updatedProvider.transformer[model].use[transformerIndex] = transformerArray as string | (string | Record<string, unknown> | { max_tokens: number })[];
      } else {
        // Convert to array format with parameters
        const paramsObj = { [paramName]: paramValue };
        updatedProvider.transformer[model].use[transformerIndex] = [targetTransformer as string, paramsObj];
      }
    }
    
    setEditingProviderData(updatedProvider);
  };


  const removeModelTransformerParameterAtIndex = (_providerIndex: number, model: string, transformerIndex: number, paramName: string) => {
    if (!editingProviderData) return;
    
    const updatedProvider = { ...editingProviderData };
    
    if (!updatedProvider.transformer?.[model]?.use || updatedProvider.transformer[model].use.length <= transformerIndex) {
      return;
    }
    
    const targetTransformer = updatedProvider.transformer[model].use[transformerIndex];
    if (Array.isArray(targetTransformer) && targetTransformer.length > 1) {
      const transformerArray = [...targetTransformer];
      // Check if the second element is an object (parameters object)
      if (typeof transformerArray[1] === 'object' && transformerArray[1] !== null) {
        const paramsObj = { ...(transformerArray[1] as Record<string, unknown>) };
        delete paramsObj[paramName];
        
        // If the parameters object is now empty, remove it
        if (Object.keys(paramsObj).length === 0) {
          transformerArray.splice(1, 1);
        } else {
          transformerArray[1] = paramsObj;
        }
        
        updatedProvider.transformer[model].use[transformerIndex] = transformerArray;
        setEditingProviderData(updatedProvider);
      }
    }
  };

  const handleAddModel = (_index: number, model: string) => {
    if (!model.trim() || !editingProviderData) return;
    
    const updatedProvider = { ...editingProviderData };
    
    // Handle case where provider.models might be null or undefined
    const models = Array.isArray(updatedProvider.models) ? [...updatedProvider.models] : [];
    
    // Check if model already exists
    if (!models.includes(model.trim())) {
      models.push(model.trim());
      updatedProvider.models = models;
      setEditingProviderData(updatedProvider);
    }
  };

    const handleTemplateImport = (value: string) => {
    if (!value) return;
    try {
      const selectedTemplate = JSON.parse(value);
      if (selectedTemplate) {
        const currentName = editingProviderData?.name;
        const newProviderData = JSON.parse(JSON.stringify(selectedTemplate));

        if (!isNewProvider && currentName) {
          newProviderData.name = currentName;
        }
        
        setEditingProviderData(newProviderData as ProviderType);
      }
    } catch (e) {
      console.error("Failed to parse template", e);
    }
  };

  const handleRemoveModel = (_providerIndex: number, modelIndex: number) => {
    if (!editingProviderData) return;
    
    const updatedProvider = { ...editingProviderData };
    
    // Handle case where provider.models might be null or undefined
    const models = Array.isArray(updatedProvider.models) ? [...updatedProvider.models] : [];
    
    // Handle case where modelIndex might be out of bounds
    if (modelIndex >= 0 && modelIndex < models.length) {
      models.splice(modelIndex, 1);
      updatedProvider.models = models;
      setEditingProviderData(updatedProvider);
    }
  };

  const editingProvider = editingProviderData || (editingProviderIndex !== null ? validProviders[editingProviderIndex] : null);
  const editingProviderAuthType = getProviderAuthType(editingProviderData || editingProvider);

  // Filter providers based on search term
  const filteredProviders = validProviders.filter(provider => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    // Check provider name and URL
    if (
      (provider.name && provider.name.toLowerCase().includes(term)) ||
      (provider.api_base_url && provider.api_base_url.toLowerCase().includes(term))
    ) {
      return true;
    }
    // Check models
    if (provider.models && Array.isArray(provider.models)) {
      return provider.models.some(model => 
        model && model.toLowerCase().includes(term)
      );
    }
    return false;
  });

  return (
    <Card className="flex h-full flex-col rounded-lg border shadow-sm">
      <CardHeader className="flex flex-col border-b p-4 gap-3">
        <div className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">{t("providers.title")} <span className="text-sm font-normal text-gray-500">({filteredProviders.length}/{validProviders.length})</span></CardTitle>
          <Button onClick={handleAddProvider}>{t("providers.add")}</Button>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <Input
              placeholder={t("providers.search")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>
          {searchTerm && (
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => setSearchTerm("")}
            >
              <XCircle className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-grow overflow-y-auto p-4">
        <div className="mb-4 rounded-lg border bg-gray-50 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-gray-900">{t("providers.codex_auth_title")}</div>
              <div className="text-sm text-gray-600">
                {isLoadingOpenAICodexAuthStatus
                  ? t("providers.codex_auth_loading")
                  : openAICodexAuthStatus?.authenticated
                    ? t("providers.codex_auth_connected")
                    : t("providers.codex_auth_disconnected")}
              </div>
              <div className="text-xs text-gray-500">
                {openAICodexAuthStatus?.email || t("providers.codex_auth_no_account")}
                {openAICodexAuthStatus?.planType ? ` · ${openAICodexAuthStatus.planType}` : ""}
              </div>
              <div className="text-xs text-gray-400">
                {openAICodexAuthStatus?.authPath || "~/.codex/auth.json"}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => loadOpenAICodexAuthStatus(currentOpenAICodexAuthPath)}
                disabled={isLoadingOpenAICodexAuthStatus}
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${isLoadingOpenAICodexAuthStatus ? "animate-spin" : ""}`} />
                {t("providers.codex_auth_refresh")}
              </Button>
              <Button
                variant="outline"
                onClick={() => startOpenAICodexLogin(currentOpenAICodexAuthPath)}
                disabled={isStartingOpenAICodexLogin}
              >
                {isStartingOpenAICodexLogin ? t("providers.codex_login_starting") : t("providers.codex_login_start")}
              </Button>
              <Button
                onClick={() => void createOpenAICodexProvider()}
                disabled={!openAICodexAuthStatus?.authenticated}
              >
                {t("providers.codex_create_provider")}
              </Button>
            </div>
          </div>
        </div>
        <ProviderList
          providers={filteredProviders}
          onEdit={handleEditProvider}
          onRemove={handleSetDeletingProviderIndex}
        />
      </CardContent>

      {/* Edit Dialog */}
      <Dialog open={editingProviderIndex !== null} onOpenChange={(open) => {
        if (!open) {
          handleCancelAddProvider();
        }
      }}>
        <DialogContent className="max-h-[80vh] flex flex-col sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("providers.edit")}</DialogTitle>
          </DialogHeader>
          {editingProvider && editingProviderIndex !== null && (
            <div className="space-y-4 p-4 overflow-y-auto flex-grow">
              {providerTemplates.length > 0 && (
                <div className="space-y-2">
                  <Label>{t("providers.import_from_template")}</Label>
                  <Combobox
                    options={providerTemplates.map(p => ({ label: p.name, value: JSON.stringify(p) }))}
                    value=""
                    onChange={handleTemplateImport}
                    placeholder={t("providers.select_template")}
                    emptyPlaceholder={t("providers.no_templates_found")}
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="name">{t("providers.name")}</Label>
                <Input 
                  id="name" 
                  value={editingProvider.name || ''} 
                  onChange={(e) => {
                    handleProviderChange(editingProviderIndex, 'name', e.target.value);
                    // Clear name error when user starts typing
                    if (nameError) {
                      setNameError(null);
                    }
                  }}
                  className={nameError ? "border-red-500" : ""}
                />
                {nameError && (
                  <p className="text-sm text-red-500">{nameError}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="api_base_url">{t("providers.api_base_url")}</Label>
                <Input id="api_base_url" value={editingProvider.api_base_url || ''} onChange={(e) => handleProviderChange(editingProviderIndex, 'api_base_url', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t("providers.auth_type")}</Label>
                <Combobox
                  options={[
                    { label: t("providers.auth_type_api_key"), value: "api_key" },
                    { label: t("providers.auth_type_openai_codex_oauth"), value: "openai_codex_oauth" }
                  ]}
                  value={editingProviderAuthType}
                  onChange={(value) => {
                    if (value === "api_key" || value === "openai_codex_oauth") {
                      handleProviderAuthTypeChange(value);
                    }
                  }}
                  placeholder={t("providers.select_auth_type")}
                  emptyPlaceholder={t("providers.no_auth_types")}
                />
              </div>
              {editingProviderAuthType === "api_key" ? (
                <div className="space-y-2">
                  <Label htmlFor="api_key">{t("providers.api_key")}</Label>
                  <div className="relative">
                    <Input
                      id="api_key"
                      type={showApiKey[editingProviderIndex || 0] ? "text" : "password"}
                      value={editingProvider.api_key || ''}
                      onChange={(e) => handleProviderChange(editingProviderIndex, 'api_key', e.target.value)}
                      className={apiKeyError ? "border-red-500" : ""}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 h-8 w-8"
                      onClick={() => {
                        const index = editingProviderIndex || 0;
                        setShowApiKey(prev => ({
                          ...prev,
                          [index]: !prev[index]
                        }));
                      }}
                    >
                      {showApiKey[editingProviderIndex || 0] ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  {apiKeyError && (
                    <p className="text-sm text-red-500">{apiKeyError}</p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="codex_auth_path">{t("providers.codex_auth_path")}</Label>
                  <Input
                    id="codex_auth_path"
                    value={editingProvider.auth?.type === "openai_codex_oauth" ? editingProvider.auth.codex_auth_path || "~/.codex/auth.json" : "~/.codex/auth.json"}
                    onChange={(e) => handleProviderAuthPathChange(e.target.value)}
                    placeholder="~/.codex/auth.json"
                  />
                  <p className="text-sm text-gray-500">{t("providers.codex_auth_path_help")}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      onClick={() => startOpenAICodexLogin(currentOpenAICodexAuthPath)}
                      disabled={isStartingOpenAICodexLogin}
                    >
                      {isStartingOpenAICodexLogin ? t("providers.codex_login_starting") : t("providers.codex_login_start")}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => loadOpenAICodexAuthStatus(currentOpenAICodexAuthPath)}
                      disabled={isLoadingOpenAICodexAuthStatus}
                    >
                      {t("providers.codex_auth_refresh")}
                    </Button>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="models">{t("providers.models")}</Label>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      {hasFetchedModels[editingProviderIndex] ? (
                        <ComboInput
                          ref={comboInputRef}
                          options={(editingProvider.models || []).map((model: string) => ({ label: model, value: model }))}
                          value=""
                          onChange={() => {
                            // 只更新输入值，不添加模型
                          }}
                          onEnter={(value) => {
                            if (editingProviderIndex !== null) {
                              handleAddModel(editingProviderIndex, value);
                            }
                          }}
                          inputPlaceholder={t("providers.models_placeholder")}
                        />
                      ) : (
                        <Input 
                          id="models" 
                          placeholder={t("providers.models_placeholder")} 
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && e.currentTarget.value.trim() && editingProviderIndex !== null) {
                              handleAddModel(editingProviderIndex, e.currentTarget.value);
                              e.currentTarget.value = '';
                            }
                          }}
                        />
                      )}
                    </div>
                    <Button 
                      onClick={() => {
                        if (hasFetchedModels[editingProviderIndex] && comboInputRef.current) {
                          // 使用ComboInput的逻辑
                          const comboInput = comboInputRef.current as unknown as { getCurrentValue(): string; clearInput(): void };
                          const currentValue = comboInput.getCurrentValue();
                          if (currentValue && currentValue.trim() && editingProviderIndex !== null) {
                            handleAddModel(editingProviderIndex, currentValue.trim());
                            // 清空ComboInput
                            comboInput.clearInput();
                          }
                        } else {
                          // 使用普通Input的逻辑
                          const input = document.getElementById('models') as HTMLInputElement;
                          if (input && input.value.trim() && editingProviderIndex !== null) {
                            handleAddModel(editingProviderIndex, input.value);
                            input.value = '';
                          }
                        }
                      }}
                    >
                      {t("providers.add_model")}
                    </Button>
                    {editingProvider.auth?.type === "openai_codex_oauth" && (
                      <Button
                        onClick={() => editingProvider && void fetchAvailableModels(editingProvider)}
                        disabled={isFetchingModels}
                        variant="outline"
                      >
                        {isFetchingModels ? t("providers.fetching_models") : t("providers.fetch_available_models")}
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-2">
                    {(editingProvider.models || []).map((model: string, modelIndex: number) => (
                      <Badge key={modelIndex} variant="outline" className="font-normal flex items-center gap-1">
                        {model}
                        <button 
                          type="button" 
                          className="ml-1 rounded-full hover:bg-gray-200"
                          onClick={() => editingProviderIndex !== null && handleRemoveModel(editingProviderIndex, modelIndex)}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
              
              {/* Provider Transformer Selection */}
              <div className="space-y-2">
                <Label>{t("providers.provider_transformer")}</Label>
                
                {/* Add new transformer */}
                <div className="flex gap-2">
                  <Combobox
                    options={availableTransformers.map(t => ({
                      label: t.name,
                      value: t.name
                    }))}
                    value=""
                    onChange={(value) => {
                      if (editingProviderIndex !== null) {
                        handleProviderTransformerChange(editingProviderIndex, value);
                      }
                    }}
                    placeholder={t("providers.select_transformer")}
                    emptyPlaceholder={t("providers.no_transformers")}
                  />
                </div>
                
                {/* Display existing transformers */}
                {editingProvider.transformer?.use && editingProvider.transformer.use.length > 0 && (
                  <div className="space-y-2 mt-2">
                    <div className="text-sm font-medium text-gray-700">{t("providers.selected_transformers")}</div>
                    {editingProvider.transformer.use.map((transformer: string | (string | Record<string, unknown> | { max_tokens: number })[], transformerIndex: number) => (
                      <div key={transformerIndex} className="border rounded-md p-3">
                        <div className="flex gap-2 items-center mb-2">
                          <div className="flex-1 bg-gray-50 rounded p-2 text-sm">
                            {typeof transformer === 'string' ? transformer : Array.isArray(transformer) ? String(transformer[0]) : String(transformer)}
                          </div>
                          <Button 
                            variant="outline" 
                            size="icon"
                            onClick={() => {
                              if (editingProviderIndex !== null) {
                                removeProviderTransformerAtIndex(editingProviderIndex, transformerIndex);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        
                        {/* Transformer-specific Parameters */}
                        <div className="mt-2 pl-4 border-l-2 border-gray-200">
                          <Label className="text-sm">{t("providers.transformer_parameters")}</Label>
                          <div className="space-y-2 mt-1">
                            <div className="flex gap-2">
                              <Input 
                                placeholder={t("providers.parameter_name")}
                                value={providerParamInputs[`provider-${editingProviderIndex}-transformer-${transformerIndex}`]?.name || ""}
                                onChange={(e) => {
                                  const key = `provider-${editingProviderIndex}-transformer-${transformerIndex}`;
                                  setProviderParamInputs(prev => ({
                                    ...prev,
                                    [key]: {
                                      ...prev[key] || {name: "", value: ""},
                                      name: e.target.value
                                    }
                                  }));
                                }}
                              />
                              <Input 
                                placeholder={t("providers.parameter_value")}
                                value={providerParamInputs[`provider-${editingProviderIndex}-transformer-${transformerIndex}`]?.value || ""}
                                onChange={(e) => {
                                  const key = `provider-${editingProviderIndex}-transformer-${transformerIndex}`;
                                  setProviderParamInputs(prev => ({
                                    ...prev,
                                    [key]: {
                                      ...prev[key] || {name: "", value: ""},
                                      value: e.target.value
                                    }
                                  }));
                                }}
                              />
                              <Button 
                                size="sm"
                                onClick={() => {
                                  if (editingProviderIndex !== null) {
                                    const key = `provider-${editingProviderIndex}-transformer-${transformerIndex}`;
                                    const paramInput = providerParamInputs[key];
                                    if (paramInput && paramInput.name && paramInput.value) {
                                      addProviderTransformerParameter(editingProviderIndex, transformerIndex, paramInput.name, paramInput.value);
                                      setProviderParamInputs(prev => ({
                                        ...prev,
                                        [key]: {name: "", value: ""}
                                      }));
                                    }
                                  }
                                }}
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                            </div>
                            
                            {/* Display existing parameters for this transformer */}
                            {(() => {
                              // Get parameters for this specific transformer
                              if (!editingProvider.transformer?.use || editingProvider.transformer.use.length <= transformerIndex) {
                                return null;
                              }
                              
                              const targetTransformer = editingProvider.transformer.use[transformerIndex];
                              let params = {};
                              
                              if (Array.isArray(targetTransformer) && targetTransformer.length > 1) {
                                // Check if the second element is an object (parameters object)
                                if (typeof targetTransformer[1] === 'object' && targetTransformer[1] !== null) {
                                  params = targetTransformer[1] as Record<string, unknown>;
                                }
                              }
                              
                              return Object.keys(params).length > 0 ? (
                                <div className="space-y-1">
                                  {Object.entries(params).map(([key, value]) => (
                                    <div key={key} className="flex items-center justify-between bg-gray-50 rounded p-2">
                                      <div className="text-sm">
                                        <span className="font-medium">{key}:</span> {String(value)}
                                      </div>
                                      <Button 
                                        variant="ghost" 
                                        size="sm"
                                        className="h-6 w-6 p-0"
                                        onClick={() => {
                                          if (editingProviderIndex !== null) {
                                            // We need a function to remove parameters from a specific transformer
                                            removeProviderTransformerParameterAtIndex(editingProviderIndex, transformerIndex, key);
                                          }
                                        }}
                                      >
                                        <X className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  ))}
                                </div>
                              ) : null;
                            })()}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Model-specific Transformers */}
              {editingProvider.models && editingProvider.models.length > 0 && (
                <div className="space-y-2">
                  <Label>{t("providers.model_transformers")}</Label>
                  <div className="space-y-3">
                    {(editingProvider.models || []).map((model: string, modelIndex: number) => (
                      <div key={modelIndex} className="border rounded-md p-3">
                        <div className="font-medium text-sm mb-2">{model}</div>
                        {/* Add new transformer */}
                        <div className="flex gap-2">
                          <div className="flex-1 flex gap-2">
                            <Combobox
                              options={availableTransformers.map(t => ({
                                label: t.name,
                                value: t.name
                              }))}
                              value=""
                              onChange={(value) => {
                                if (editingProviderIndex !== null) {
                                  handleModelTransformerChange(editingProviderIndex, model, value);
                                }
                              }}
                              placeholder={t("providers.select_transformer")}
                              emptyPlaceholder={t("providers.no_transformers")}
                            />
                          </div>
                        </div>
                        
                        {/* Display existing transformers */}
                        {editingProvider.transformer?.[model]?.use && editingProvider.transformer[model].use.length > 0 && (
                          <div className="space-y-2 mt-2">
                            <div className="text-sm font-medium text-gray-700">{t("providers.selected_transformers")}</div>
                            {editingProvider.transformer[model].use.map((transformer: string | (string | Record<string, unknown> | { max_tokens: number })[], transformerIndex: number) => (
                              <div key={transformerIndex} className="border rounded-md p-3">
                                <div className="flex gap-2 items-center mb-2">
                                  <div className="flex-1 bg-gray-50 rounded p-2 text-sm">
                                    {typeof transformer === 'string' ? transformer : Array.isArray(transformer) ? String(transformer[0]) : String(transformer)}
                                  </div>
                                  <Button 
                                    variant="outline" 
                                    size="icon"
                                    onClick={() => {
                                      if (editingProviderIndex !== null) {
                                        removeModelTransformerAtIndex(editingProviderIndex, model, transformerIndex);
                                      }
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                                
                                {/* Transformer-specific Parameters */}
                                <div className="mt-2 pl-4 border-l-2 border-gray-200">
                                  <Label className="text-sm">{t("providers.transformer_parameters")}</Label>
                                  <div className="space-y-2 mt-1">
                                    <div className="flex gap-2">
                                      <Input 
                                        placeholder={t("providers.parameter_name")}
                                        value={modelParamInputs[`model-${editingProviderIndex}-${model}-transformer-${transformerIndex}`]?.name || ""}
                                        onChange={(e) => {
                                          const key = `model-${editingProviderIndex}-${model}-transformer-${transformerIndex}`;
                                          setModelParamInputs(prev => ({
                                            ...prev,
                                            [key]: {
                                              ...prev[key] || {name: "", value: ""},
                                              name: e.target.value
                                            }
                                          }));
                                        }}
                                      />
                                      <Input 
                                        placeholder={t("providers.parameter_value")}
                                        value={modelParamInputs[`model-${editingProviderIndex}-${model}-transformer-${transformerIndex}`]?.value || ""}
                                        onChange={(e) => {
                                          const key = `model-${editingProviderIndex}-${model}-transformer-${transformerIndex}`;
                                          setModelParamInputs(prev => ({
                                            ...prev,
                                            [key]: {
                                              ...prev[key] || {name: "", value: ""},
                                              value: e.target.value
                                            }
                                          }));
                                        }}
                                      />
                                      <Button 
                                        size="sm"
                                        onClick={() => {
                                          if (editingProviderIndex !== null) {
                                            const key = `model-${editingProviderIndex}-${model}-transformer-${transformerIndex}`;
                                            const paramInput = modelParamInputs[key];
                                            if (paramInput && paramInput.name && paramInput.value) {
                                              addModelTransformerParameter(editingProviderIndex, model, transformerIndex, paramInput.name, paramInput.value);
                                              setModelParamInputs(prev => ({
                                                ...prev,
                                                [key]: {name: "", value: ""}
                                              }));
                                            }
                                          }
                                        }}
                                      >
                                        <Plus className="h-4 w-4" />
                                      </Button>
                                    </div>
                                    
                                    {/* Display existing parameters for this transformer */}
                                    {(() => {
                                      // Get parameters for this specific transformer
                                      if (!editingProvider.transformer?.[model]?.use || editingProvider.transformer[model].use.length <= transformerIndex) {
                                        return null;
                                      }
                                      
                                      const targetTransformer = editingProvider.transformer[model].use[transformerIndex];
                                      let params = {};
                                      
                                      if (Array.isArray(targetTransformer) && targetTransformer.length > 1) {
                                        // Check if the second element is an object (parameters object)
                                        if (typeof targetTransformer[1] === 'object' && targetTransformer[1] !== null) {
                                          params = targetTransformer[1] as Record<string, unknown>;
                                        }
                                      }
                                      
                                      return Object.keys(params).length > 0 ? (
                                        <div className="space-y-1">
                                          {Object.entries(params).map(([key, value]) => (
                                            <div key={key} className="flex items-center justify-between bg-gray-50 rounded p-2">
                                              <div className="text-sm">
                                                <span className="font-medium">{key}:</span> {String(value)}
                                              </div>
                                              <Button 
                                                variant="ghost" 
                                                size="sm"
                                                className="h-6 w-6 p-0"
                                                onClick={() => {
                                                  if (editingProviderIndex !== null) {
                                                    // We need a function to remove parameters from a specific transformer
                                                    removeModelTransformerParameterAtIndex(editingProviderIndex, model, transformerIndex, key);
                                                  }
                                                }}
                                              >
                                                <X className="h-3 w-3" />
                                              </Button>
                                            </div>
                                          ))}
                                        </div>
                                      ) : null;
                                    })()}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
            </div>
          )}
          <div className="space-y-3 mt-auto">
            <div className="flex justify-end gap-2">
              {/* <Button 
                variant="outline" 
                onClick={() => editingProvider && testConnectivity(editingProvider)}
                disabled={isTestingConnectivity || !editingProvider}
              >
                <Wifi className="mr-2 h-4 w-4" />
                {isTestingConnectivity ? t("providers.testing") : t("providers.test_connectivity")}
              </Button> */}
              <Button onClick={handleSaveProvider}>{t("app.save")}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isOpenAICodexLoginDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            void cancelOpenAICodexLogin();
          }
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("providers.codex_login_dialog_title")}</DialogTitle>
            <DialogDescription>
              {t("providers.codex_login_dialog_description")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {openAICodexLoginSession ? (
              <>
                <div className="rounded-md border bg-gray-50 p-3">
                  <div className="text-xs uppercase tracking-wide text-gray-500">{t("providers.codex_login_code")}</div>
                  <div className="mt-1 text-2xl font-semibold tracking-[0.3em] text-gray-900">
                    {openAICodexLoginSession.userCode}
                  </div>
                </div>
                <div className="space-y-1 text-sm text-gray-600">
                  <div>{t("providers.codex_login_url_label")}</div>
                  <a
                    href={openAICodexLoginSession.verificationUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all text-blue-600 hover:underline"
                  >
                    {openAICodexLoginSession.verificationUrl}
                  </a>
                </div>
                <div className="text-sm text-gray-600">
                  {openAICodexLoginSession.state === "pending" && t("providers.codex_login_pending")}
                  {openAICodexLoginSession.state === "completed" && t("providers.codex_login_completed")}
                  {openAICodexLoginSession.state === "cancelled" && t("providers.codex_login_cancelled")}
                  {openAICodexLoginSession.state === "expired" && t("providers.codex_login_expired")}
                  {openAICodexLoginSession.state === "error" && (openAICodexLoginSession.error || openAICodexLoginError || t("providers.codex_login_failed"))}
                </div>
              </>
            ) : (
              <div className="text-sm text-gray-600">
                {openAICodexLoginError || t("providers.codex_login_dialog_idle")}
              </div>
            )}
            {openAICodexLoginError && openAICodexLoginSession?.state !== "error" && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {openAICodexLoginError}
              </div>
            )}
          </div>
          <DialogFooter>
            {openAICodexLoginSession?.verificationUrl && (
              <Button
                variant="outline"
                onClick={() => window.open(openAICodexLoginSession.verificationUrl, "_blank", "noopener,noreferrer")}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                {t("providers.codex_login_open_browser")}
              </Button>
            )}
            <Button variant="outline" onClick={() => void cancelOpenAICodexLogin()}>
              {t("providers.cancel")}
            </Button>
            {openAICodexLoginSession?.state === "completed" && (
              <Button onClick={() => {
                setIsOpenAICodexLoginDialogOpen(false);
                void createOpenAICodexProvider();
              }}>
                {t("providers.codex_create_provider")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deletingProviderIndex !== null} onOpenChange={() => setDeletingProviderIndex(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("providers.delete")}</DialogTitle>
            <DialogDescription>
              {t("providers.delete_provider_confirm")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingProviderIndex(null)}>{t("providers.cancel")}</Button>
            <Button variant="destructive" onClick={() => deletingProviderIndex !== null && handleRemoveProvider(deletingProviderIndex)}>{t("providers.delete")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
