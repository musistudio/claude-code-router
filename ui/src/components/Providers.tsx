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
import { X, Trash2, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Combobox } from "@/components/ui/combobox";
import { ComboInput } from "@/components/ui/combo-input";
import { api } from "@/lib/api";


export function Providers() {
  const { t } = useTranslation();
  const { config, setConfig } = useConfig();
  const [editingProviderIndex, setEditingProviderIndex] = useState<number | null>(null);
  const [deletingProviderIndex, setDeletingProviderIndex] = useState<number | null>(null);
  const [hasFetchedModels, setHasFetchedModels] = useState<Record<number, boolean>>({});
  const [providerParamInputs, setProviderParamInputs] = useState<Record<string, {name: string, value: string}>>({});
  const [modelParamInputs, setModelParamInputs] = useState<Record<string, {name: string, value: string}>>({});
  const [availableTransformers, setAvailableTransformers] = useState<{name: string; endpoint: string | null;}[]>([]);
  const comboInputRef = useRef<HTMLInputElement>(null);

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


  const handleAddProvider = () => {
    const newProviders = [...config.Providers, { name: "", api_base_url: "", api_key: "", models: [] }];
    setConfig({ ...config, Providers: newProviders });
    setEditingProviderIndex(newProviders.length - 1);
  };

  const handleSaveProvider = () => {
    setEditingProviderIndex(null);
  };

  const handleCancelAddProvider = () => {
    // If we're adding a new provider, remove it regardless of content
    if (editingProviderIndex !== null && editingProviderIndex === config.Providers.length - 1) {
      const newProviders = [...config.Providers];
      newProviders.pop();
      setConfig({ ...config, Providers: newProviders });
    }
    // Reset fetched models state for this provider
    if (editingProviderIndex !== null) {
      setHasFetchedModels(prev => {
        const newState = { ...prev };
        delete newState[editingProviderIndex];
        return newState;
      });
    }
    setEditingProviderIndex(null);
  };

  const handleRemoveProvider = (index: number) => {
    const newProviders = [...config.Providers];
    newProviders.splice(index, 1);
    setConfig({ ...config, Providers: newProviders });
    setDeletingProviderIndex(null);
  };

  const handleProviderChange = (index: number, field: string, value: string) => {
    const newProviders = [...config.Providers];
    newProviders[index][field] = value;
    setConfig({ ...config, Providers: newProviders });
  };

  const handleProviderTransformerChange = (index: number, transformerPath: string) => {
    if (!transformerPath) return; // Don't add empty transformers
    
    const newProviders = [...config.Providers];
    
    if (!newProviders[index].transformer) {
      newProviders[index].transformer = { use: [] };
    }
    
    // Add transformer to the use array
    newProviders[index].transformer!.use = [...newProviders[index].transformer!.use, transformerPath];
    setConfig({ ...config, Providers: newProviders });
  };

  const removeProviderTransformerAtIndex = (index: number, transformerIndex: number) => {
    const newProviders = [...config.Providers];
    
    if (newProviders[index].transformer) {
      const newUseArray = [...newProviders[index].transformer!.use];
      newUseArray.splice(transformerIndex, 1);
      newProviders[index].transformer!.use = newUseArray;
      
      // If use array is now empty and no other properties, remove transformer entirely
      if (newUseArray.length === 0 && Object.keys(newProviders[index].transformer!).length === 1) {
        delete newProviders[index].transformer;
      }
    }
    
    setConfig({ ...config, Providers: newProviders });
  };

  const handleModelTransformerChange = (providerIndex: number, model: string, transformerPath: string) => {
    if (!transformerPath) return; // Don't add empty transformers
    
    const newProviders = [...config.Providers];
    
    if (!newProviders[providerIndex].transformer) {
      newProviders[providerIndex].transformer = { use: [] };
    }
    
    // Initialize model transformer if it doesn't exist
    if (!newProviders[providerIndex].transformer![model]) {
      newProviders[providerIndex].transformer![model] = { use: [] };
    }
    
    // Add transformer to the use array
    newProviders[providerIndex].transformer![model].use = [...newProviders[providerIndex].transformer![model].use, transformerPath];
    setConfig({ ...config, Providers: newProviders });
  };

  const removeModelTransformerAtIndex = (providerIndex: number, model: string, transformerIndex: number) => {
    const newProviders = [...config.Providers];
    
    if (newProviders[providerIndex].transformer && newProviders[providerIndex].transformer![model]) {
      const newUseArray = [...newProviders[providerIndex].transformer![model].use];
      newUseArray.splice(transformerIndex, 1);
      newProviders[providerIndex].transformer![model].use = newUseArray;
      
      // If use array is now empty and no other properties, remove model transformer entirely
      if (newUseArray.length === 0 && Object.keys(newProviders[providerIndex].transformer![model]).length === 1) {
        delete newProviders[providerIndex].transformer![model];
      }
    }
    
    setConfig({ ...config, Providers: newProviders });
  };


  const addProviderTransformerParameter = (providerIndex: number, transformerIndex: number, paramName: string, paramValue: string) => {
    const newProviders = [...config.Providers];
    
    if (!newProviders[providerIndex].transformer) {
      newProviders[providerIndex].transformer = { use: [] };
    }
    
    // Add parameter to the specified transformer in use array
    if (newProviders[providerIndex].transformer!.use && newProviders[providerIndex].transformer!.use.length > transformerIndex) {
      const targetTransformer = newProviders[providerIndex].transformer!.use[transformerIndex];
      
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
        
        newProviders[providerIndex].transformer!.use[transformerIndex] = transformerArray as string | (string | Record<string, unknown> | { max_tokens: number })[];
      } else {
        // Convert to array format with parameters
        const paramsObj = { [paramName]: paramValue };
        newProviders[providerIndex].transformer!.use[transformerIndex] = [targetTransformer as string, paramsObj];
      }
    }
    
    setConfig({ ...config, Providers: newProviders });
  };


  const removeProviderTransformerParameterAtIndex = (providerIndex: number, transformerIndex: number, paramName: string) => {
    const newProviders = [...config.Providers];
    
    if (!newProviders[providerIndex].transformer?.use || newProviders[providerIndex].transformer.use.length <= transformerIndex) {
      return;
    }
    
    const targetTransformer = newProviders[providerIndex].transformer.use[transformerIndex];
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
        
        newProviders[providerIndex].transformer!.use[transformerIndex] = transformerArray;
        setConfig({ ...config, Providers: newProviders });
      }
    }
  };

  const addModelTransformerParameter = (providerIndex: number, model: string, transformerIndex: number, paramName: string, paramValue: string) => {
    const newProviders = [...config.Providers];
    
    if (!newProviders[providerIndex].transformer) {
      newProviders[providerIndex].transformer = { use: [] };
    }
    
    if (!newProviders[providerIndex].transformer![model]) {
      newProviders[providerIndex].transformer![model] = { use: [] };
    }
    
    // Add parameter to the specified transformer in use array
    if (newProviders[providerIndex].transformer![model].use && newProviders[providerIndex].transformer![model].use.length > transformerIndex) {
      const targetTransformer = newProviders[providerIndex].transformer![model].use[transformerIndex];
      
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
        
        newProviders[providerIndex].transformer![model].use[transformerIndex] = transformerArray as string | (string | Record<string, unknown> | { max_tokens: number })[];
      } else {
        // Convert to array format with parameters
        const paramsObj = { [paramName]: paramValue };
        newProviders[providerIndex].transformer![model].use[transformerIndex] = [targetTransformer as string, paramsObj];
      }
    }
    
    setConfig({ ...config, Providers: newProviders });
  };


  const removeModelTransformerParameterAtIndex = (providerIndex: number, model: string, transformerIndex: number, paramName: string) => {
    const newProviders = [...config.Providers];
    
    if (!newProviders[providerIndex].transformer?.[model]?.use || newProviders[providerIndex].transformer[model].use.length <= transformerIndex) {
      return;
    }
    
    const targetTransformer = newProviders[providerIndex].transformer[model].use[transformerIndex];
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
        
        newProviders[providerIndex].transformer![model].use[transformerIndex] = transformerArray;
        setConfig({ ...config, Providers: newProviders });
      }
    }
  };

  const handleAddModel = (index: number, model: string) => {
    if (!model.trim()) return;
    
    // Handle case where config.Providers might be null or undefined
    if (!config || !Array.isArray(config.Providers)) return;
    
    // Handle case where the provider at the given index might be null or undefined
    if (!config.Providers[index]) return;
    
    const newProviders = [...config.Providers];
    
    // Handle case where provider.models might be null or undefined
    const models = Array.isArray(newProviders[index].models) ? [...newProviders[index].models] : [];
    
    // Check if model already exists
    if (!models.includes(model.trim())) {
      models.push(model.trim());
      newProviders[index].models = models;
      setConfig({ ...config, Providers: newProviders });
    }
  };

  const handleRemoveModel = (providerIndex: number, modelIndex: number) => {
    // Handle case where config.Providers might be null or undefined
    if (!config || !Array.isArray(config.Providers)) return;
    
    // Handle case where the provider at the given index might be null or undefined
    if (!config.Providers[providerIndex]) return;
    
    const newProviders = [...config.Providers];
    
    // Handle case where provider.models might be null or undefined
    const models = Array.isArray(newProviders[providerIndex].models) ? [...newProviders[providerIndex].models] : [];
    
    // Handle case where modelIndex might be out of bounds
    if (modelIndex >= 0 && modelIndex < models.length) {
      models.splice(modelIndex, 1);
      newProviders[providerIndex].models = models;
      setConfig({ ...config, Providers: newProviders });
    }
  };

  const editingProvider = editingProviderIndex !== null ? validProviders[editingProviderIndex] : null;

  return (
    <Card className="flex h-full flex-col rounded-lg border shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between border-b p-4">
        <CardTitle className="text-lg">{t("providers.title")} <span className="text-sm font-normal text-gray-500">({validProviders.length})</span></CardTitle>
        <Button onClick={handleAddProvider}>{t("providers.add")}</Button>
      </CardHeader>
      <CardContent className="flex-grow overflow-y-auto p-4">
        <ProviderList
          providers={validProviders}
          onEdit={setEditingProviderIndex}
          onRemove={setDeletingProviderIndex}
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
              <div className="space-y-2">
                <Label htmlFor="name">{t("providers.name")}</Label>
                <Input id="name" value={editingProvider.name || ''} onChange={(e) => handleProviderChange(editingProviderIndex, 'name', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="api_base_url">{t("providers.api_base_url")}</Label>
                <Input id="api_base_url" value={editingProvider.api_base_url || ''} onChange={(e) => handleProviderChange(editingProviderIndex, 'api_base_url', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="api_key">{t("providers.api_key")}</Label>
                <Input id="api_key" type="password" value={editingProvider.api_key || ''} onChange={(e) => handleProviderChange(editingProviderIndex, 'api_key', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="models">{t("providers.models")}</Label>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <div className="flex-1">
                      {hasFetchedModels[editingProviderIndex] ? (
                        <ComboInput
                          ref={comboInputRef}
                          options={(editingProvider.models || []).map(model => ({ label: model, value: model }))}
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
                    {/* <Button 
                      onClick={() => editingProvider && fetchAvailableModels(editingProvider)}
                      disabled={isFetchingModels}
                      variant="outline"
                    >
                      {isFetchingModels ? t("providers.fetching_models") : t("providers.fetch_available_models")}
                    </Button> */}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-2">
                    {(editingProvider.models || []).map((model, modelIndex) => (
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
                    {(editingProvider.models || []).map((model, modelIndex) => (
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
