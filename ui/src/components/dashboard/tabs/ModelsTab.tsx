import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useConfig } from '@/components/ConfigProvider';
import { api } from '@/lib/api';
import type { Provider, RouterConfig, Transformer } from '@/types';

interface ProviderFormData extends Provider {
  isExpanded?: boolean;
  isEditing?: boolean;
}

export function ModelsTab() {
  const { config, setConfig } = useConfig();

  const [searchTerm, setSearchTerm] = useState('');
  const [expandedProvider, setExpandedProvider] = useState<number | null>(null);
  const [editingProvider, setEditingProvider] = useState<number | null>(null);
  const [providerTemplates, setProviderTemplates] = useState<Provider[]>([]);
  const [availableTransformers, setAvailableTransformers] = useState<{name: string; endpoint: string | null;}[]>([]);
  const [showRouterConfig, setShowRouterConfig] = useState(false);
  const [showAddProvider, setShowAddProvider] = useState(false);
  
  const [formData, setFormData] = useState<ProviderFormData | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [newModelInput, setNewModelInput] = useState('');
  const [validationErrors, setValidationErrors] = useState<{[key: string]: string}>({});
  
  const [showTransformers, setShowTransformers] = useState(false);
  const [editingTransformer, setEditingTransformer] = useState<number | null>(null);
  const [transformerFormData, setTransformerFormData] = useState<Transformer | null>(null);
  const [transformerValidationErrors, setTransformerValidationErrors] = useState<{[key: string]: string}>({});

  const providers = config?.Providers || [];
  const transformers = config?.transformers || [];
  const totalModels = providers.reduce((acc, provider) => acc + (provider.models?.length || 0), 0);
  const totalProviders = providers.length;
  const activeModel = config?.Router?.default || 'None';
  const routerConfig: RouterConfig = config?.Router || {
    default: '',
    background: '',
    think: '',
    longContext: '',
    longContextThreshold: 60000,
    webSearch: ''
  };

  useEffect(() => {
    const fetchProviderTemplates = async () => {
      try {
        const response = await fetch('https://pub-0dc3e1677e894f07bbea11b17a29e032.r2.dev/providers.json');
        if (response.ok) {
          const data = await response.json();
          setProviderTemplates(data || []);
        }
      } catch (error) {
        console.error('Failed to fetch provider templates:', error);
      }
    };

    const fetchTransformers = async () => {
      try {
        const response = await api.get<{transformers: {name: string; endpoint: string | null;}[]}>('/transformers');
        setAvailableTransformers(response.transformers);
      } catch (error) {
        console.error('Failed to fetch transformers:', error);
      }
    };

    fetchProviderTemplates();
    fetchTransformers();
  }, []);

  const filteredProviders = providers.filter(provider => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    
    return (
      (provider.name && provider.name.toLowerCase().includes(term)) ||
      (provider.api_base_url && provider.api_base_url.toLowerCase().includes(term)) ||
      (provider.models && provider.models.some(model => model.toLowerCase().includes(term)))
    );
  });

  const handleAddProvider = () => {
    if (!showAddProvider) {
      const newProvider: ProviderFormData = {
        name: '',
        api_base_url: '',
        api_key: '',
        models: [],
        isEditing: true,
        isExpanded: true
      };
      setFormData(newProvider);
      setValidationErrors({});
    }
  };

  const handleEditProvider = (index: number) => {
    const provider = providers[index];
    setFormData({...provider, isEditing: true, isExpanded: true});
    setEditingProvider(index);
    setExpandedProvider(index);
    setValidationErrors({});
    setShowApiKey(false);
  };

  const validateProvider = (data: ProviderFormData): boolean => {
    const errors: {[key: string]: string} = {};
    
    if (!data.name?.trim()) {
      errors.name = 'Provider name is required';
    } else {
      const isDuplicate = providers.some((p, idx) => 
        p.name.toLowerCase() === data.name!.toLowerCase() && idx !== editingProvider
      );
      if (isDuplicate) {
        errors.name = 'Provider name already exists';
      }
    }
    
    if (!data.api_key?.trim()) {
      errors.api_key = 'API key is required';
    }
    
    if (!data.api_base_url?.trim()) {
      errors.api_base_url = 'API base URL is required';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveProvider = () => {
    if (!formData || !validateProvider(formData)) return;

    const newProviders = [...providers];
    
    if (editingProvider === null) {
      newProviders.push(formData);
    } else {
      newProviders[editingProvider] = formData;
    }
    
    setConfig({...config!, Providers: newProviders});
    handleCancelEdit();
  };

  const handleCancelEdit = () => {
    setFormData(null);
    setEditingProvider(null);
    setExpandedProvider(null);
    setShowAddProvider(false);
    setValidationErrors({});
    setShowApiKey(false);
    setNewModelInput('');
  };

  const handleDeleteProvider = (index: number) => {
    const newProviders = [...providers];
    newProviders.splice(index, 1);
    setConfig({...config!, Providers: newProviders});
  };

  const handleAddModel = () => {
    if (!newModelInput.trim()) return;
    setFormData(prev => {
      if (!prev) return null;
      const models = [...(prev.models || [])];
      if (!models.includes(newModelInput.trim())) {
        models.push(newModelInput.trim());
        return {...prev, models};
      }
      return prev;
    });
    setNewModelInput('');
  };

  const handleRemoveModel = (modelIndex: number) => {
    setFormData(prev => {
      if (!prev) return null;
      const models = [...(prev.models || [])];
      models.splice(modelIndex, 1);
      return {...prev, models};
    });
  };

  const handleAddTransformer = () => {
    const newTransformer: Transformer = {
      path: '',
      options: {}
    };
    setTransformerFormData(newTransformer);
    setEditingTransformer(-1);
    setTransformerValidationErrors({});
  };

  const handleEditTransformer = (index: number) => {
    setTransformerFormData(transformers[index]);
    setEditingTransformer(index);
    setTransformerValidationErrors({});
  };

  const validateTransformer = (transformer: Transformer): boolean => {
    const errors: {[key: string]: string} = {};
    if (!transformer.path?.trim()) {
      errors.path = 'Path is required';
    }
    setTransformerValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveTransformer = () => {
    if (!transformerFormData || !validateTransformer(transformerFormData)) return;
    const newTransformers = [...transformers];
    if (editingTransformer === -1) {
      newTransformers.push(transformerFormData);
    } else if (editingTransformer !== null) {
      newTransformers[editingTransformer] = transformerFormData;
    }
    setConfig({...config!, transformers: newTransformers});
    handleCancelTransformerEdit();
  };

  const handleCancelTransformerEdit = () => {
    setTransformerFormData(null);
    setEditingTransformer(null);
    setTransformerValidationErrors({});
  };

  const handleDeleteTransformer = (index: number) => {
    const newTransformers = transformers.filter((_, i) => i !== index);
    setConfig({...config!, transformers: newTransformers});
  };

  const handleAddTransformerOption = () => {
    if (!transformerFormData) return;
    const updatedTransformer = {
      ...transformerFormData,
      options: {
        ...transformerFormData.options,
        [`option_${Date.now()}`]: ''
      }
    };
    setTransformerFormData(updatedTransformer);
  };

  const handleUpdateTransformerOption = (oldKey: string, newKey: string, value: string) => {
    if (!transformerFormData) return;
    const newOptions = { ...transformerFormData.options };
    if (oldKey !== newKey) {
      delete newOptions[oldKey];
    }
    newOptions[newKey] = value;
    setTransformerFormData({
      ...transformerFormData,
      options: newOptions
    });
  };

  const handleRemoveTransformerOption = (key: string) => {
    if (!transformerFormData) return;
    const newOptions = { ...transformerFormData.options };
    delete newOptions[key];
    setTransformerFormData({
      ...transformerFormData,
      options: newOptions
    });
  };

  const handleRouterChange = (field: string, value: string | number) => {
    const newRouter = {...routerConfig, [field]: value};
    setConfig({...config!, Router: newRouter});
  };

  const allModels = providers.flatMap(provider => 
    (provider.models || []).map(model => ({
      label: `${provider.name}: ${model}`,
      value: `${provider.name},${model}`
    }))
  );

  return (
    <div className="space-y-8">
      {/* Header & Stats */}
      <motion.div 
        className="glass-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <i className="fas fa-robot text-2xl text-purple-500"></i>
            <h2 className="text-2xl font-bold">AI Models & Providers</h2>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowRouterConfig(!showRouterConfig)}
              className={`px-4 py-2 rounded-lg border transition-colors ${
                showRouterConfig 
                  ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' 
                  : 'bg-gray-500/20 text-gray-400 border-gray-500/30 hover:bg-gray-500/30'
              }`}
            >
              <i className="fas fa-route mr-2"></i>
              Router Config
            </button>
            <button
              onClick={() => setShowTransformers(!showTransformers)}
              className={`px-4 py-2 rounded-lg border transition-colors ${
                showTransformers 
                  ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' 
                  : 'bg-gray-500/20 text-gray-400 border-gray-500/30 hover:bg-gray-500/30'
              }`}
            >
              <i className="fas fa-cogs mr-2"></i>
              Transformers ({transformers.length})
            </button>
            <button
              onClick={() => setShowAddProvider(!showAddProvider)}
              className={`px-4 py-2 rounded-lg border transition-colors ${
                showAddProvider 
                  ? 'bg-purple-500/20 text-purple-400 border-purple-500/30' 
                  : 'bg-gray-500/20 text-gray-400 border-gray-500/30 hover:bg-gray-500/30'
              }`}
            >
              <i className="fas fa-plus mr-2"></i>
              Add Provider
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="stats-grid grid-cols-4">
          <div className="stat-card">
            <div className="stat-number">{totalModels}</div>
            <div className="stat-label">Total Models</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">{totalProviders}</div>
            <div className="stat-label">Providers</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">{activeModel !== 'None' ? '1' : '0'}</div>
            <div className="stat-label">Active Model</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">{providers.filter(p => p.api_key).length}</div>
            <div className="stat-label">Configured</div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="flex items-center gap-4 mt-6">
          <div className="relative flex-1">
            <i className="fas fa-search absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
            <input
              type="text"
              placeholder="Search providers, models, or URLs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-black/20 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:border-purple-500 focus:outline-none"
            />
          </div>
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="p-3 text-gray-400 hover:text-white transition-colors"
            >
              <i className="fas fa-times"></i>
            </button>
          )}
        </div>

        {/* Results Summary */}
        {searchTerm && (
          <div className="mt-4 text-sm text-gray-400">
            Showing {filteredProviders.length} of {providers.length} providers
          </div>
        )}
      </motion.div>

      {/* Router Configuration */}
      <AnimatePresence>
        {showRouterConfig && (
          <motion.div
            className="glass-card"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="flex items-center gap-4 mb-6">
              <i className="fas fa-route text-2xl text-blue-500"></i>
              <h3 className="text-xl font-bold">Router Configuration</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="space-y-3">
                <label className="text-white font-medium">Default Route</label>
                <select
                  value={routerConfig.default || ''}
                  onChange={(e) => handleRouterChange('default', e.target.value)}
                  className="w-full px-3 py-2 bg-black/20 border border-white/20 rounded-lg text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="">Select model...</option>
                  {allModels.map((model, idx) => (
                    <option key={idx} value={model.value}>{model.label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-3">
                <label className="text-white font-medium">Background Route</label>
                <select
                  value={routerConfig.background || ''}
                  onChange={(e) => handleRouterChange('background', e.target.value)}
                  className="w-full px-3 py-2 bg-black/20 border border-white/20 rounded-lg text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="">Select model...</option>
                  {allModels.map((model, idx) => (
                    <option key={idx} value={model.value}>{model.label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-3">
                <label className="text-white font-medium">Think Route</label>
                <select
                  value={routerConfig.think || ''}
                  onChange={(e) => handleRouterChange('think', e.target.value)}
                  className="w-full px-3 py-2 bg-black/20 border border-white/20 rounded-lg text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="">Select model...</option>
                  {allModels.map((model, idx) => (
                    <option key={idx} value={model.value}>{model.label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-3">
                <label className="text-white font-medium">Long Context Route</label>
                <select
                  value={routerConfig.longContext || ''}
                  onChange={(e) => handleRouterChange('longContext', e.target.value)}
                  className="w-full px-3 py-2 bg-black/20 border border-white/20 rounded-lg text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="">Select model...</option>
                  {allModels.map((model, idx) => (
                    <option key={idx} value={model.value}>{model.label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-3">
                <label className="text-white font-medium">Web Search Route</label>
                <select
                  value={routerConfig.webSearch || ''}
                  onChange={(e) => handleRouterChange('webSearch', e.target.value)}
                  className="w-full px-3 py-2 bg-black/20 border border-white/20 rounded-lg text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="">Select model...</option>
                  {allModels.map((model, idx) => (
                    <option key={idx} value={model.value}>{model.label}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-3">
                <label className="text-white font-medium">Long Context Threshold</label>
                <input
                  type="number"
                  value={routerConfig.longContextThreshold || 60000}
                  onChange={(e) => handleRouterChange('longContextThreshold', parseInt(e.target.value) || 60000)}
                  className="w-full px-3 py-2 bg-black/20 border border-white/20 rounded-lg text-white focus:border-blue-500 focus:outline-none"
                  placeholder="60000"
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Transformers Management */}
      <AnimatePresence>
        {showTransformers && (
          <motion.div
            className="glass-card"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <i className="fas fa-cogs text-2xl text-orange-500"></i>
                <h3 className="text-xl font-bold">Transformer Management</h3>
              </div>
              <button
                onClick={handleAddTransformer}
                className="px-4 py-2 bg-orange-500/20 text-orange-400 rounded-lg border border-orange-500/30 hover:bg-orange-500/30 transition-colors"
              >
                <i className="fas fa-plus mr-2"></i>
                Add Transformer
              </button>
            </div>

            {/* Transformer List */}
            <div className="space-y-4">
              {transformers.length > 0 ? (
                transformers.map((transformer, index) => (
                  <motion.div
                    key={index}
                    className="p-4 bg-black/20 rounded-lg border border-white/10"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    {editingTransformer === index ? (
                      // Edit Mode
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-white font-medium">Path</label>
                          <input
                            type="text"
                            value={transformerFormData?.path || ''}
                            onChange={(e) => setTransformerFormData(prev => prev ? {...prev, path: e.target.value} : null)}
                            className="w-full px-3 py-2 bg-black/20 border border-white/20 rounded-lg text-white focus:border-orange-500 focus:outline-none"
                            placeholder="/path/to/transformer.js"
                          />
                          {transformerValidationErrors.path && (
                            <p className="text-sm text-red-400">{transformerValidationErrors.path}</p>
                          )}
                        </div>

                        {/* Options Management */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="text-white font-medium">Options</label>
                            <button
                              onClick={handleAddTransformerOption}
                              className="px-2 py-1 bg-orange-500/20 text-orange-400 rounded border border-orange-500/30 hover:bg-orange-500/30 text-sm"
                            >
                              <i className="fas fa-plus mr-1"></i>
                              Add Option
                            </button>
                          </div>
                          
                          <div className="space-y-2">
                            {transformerFormData?.options && Object.entries(transformerFormData.options).map(([key, value]) => (
                              <div key={key} className="flex gap-2">
                                <input
                                  type="text"
                                  value={key}
                                  onChange={(e) => handleUpdateTransformerOption(key, e.target.value, value as string)}
                                  className="flex-1 px-3 py-2 bg-black/20 border border-white/20 rounded-lg text-white focus:border-orange-500 focus:outline-none text-sm"
                                  placeholder="Option key"
                                />
                                <input
                                  type="text"
                                  value={value as string}
                                  onChange={(e) => handleUpdateTransformerOption(key, key, e.target.value)}
                                  className="flex-1 px-3 py-2 bg-black/20 border border-white/20 rounded-lg text-white focus:border-orange-500 focus:outline-none text-sm"
                                  placeholder="Option value"
                                />
                                <button
                                  onClick={() => handleRemoveTransformerOption(key)}
                                  className="px-2 py-2 text-red-400 hover:text-red-300 transition-colors"
                                >
                                  <i className="fas fa-times"></i>
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="flex justify-end gap-3">
                          <button
                            onClick={handleCancelTransformerEdit}
                            className="px-4 py-2 bg-gray-500/20 text-gray-400 rounded-lg border border-gray-500/30 hover:bg-gray-500/30 transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleSaveTransformer}
                            className="px-4 py-2 bg-orange-500/20 text-orange-400 rounded-lg border border-orange-500/30 hover:bg-orange-500/30 transition-colors"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      // Display Mode
                      <div className="flex items-start justify-between">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-3">
                            <span className="text-white font-medium">{transformer.path}</span>
                          </div>
                          
                          {transformer.options && Object.keys(transformer.options).length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {Object.entries(transformer.options).map(([key, value]) => (
                                <span
                                  key={key}
                                  className="px-2 py-1 bg-orange-500/10 text-orange-400 rounded text-xs border border-orange-500/30"
                                >
                                  {key}: {value}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleEditTransformer(index)}
                            className="p-2 text-gray-400 hover:text-orange-400 transition-colors"
                          >
                            <i className="fas fa-edit"></i>
                          </button>
                          <button
                            onClick={() => handleDeleteTransformer(index)}
                            className="p-2 text-gray-400 hover:text-red-400 transition-colors"
                          >
                            <i className="fas fa-trash"></i>
                          </button>
                        </div>
                      </div>
                    )}
                  </motion.div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-400">
                  <i className="fas fa-cogs text-3xl mb-3"></i>
                  <p className="mb-2">No transformers configured</p>
                  <p className="text-sm">Add transformers to modify requests/responses for providers</p>
                </div>
              )}
            </div>

            {/* Add New Transformer Form */}
            {editingTransformer === -1 && transformerFormData && (
              <motion.div
                className="mt-6 p-4 bg-orange-500/5 rounded-lg border border-orange-500/20"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <h4 className="text-orange-400 font-medium mb-4">
                  <i className="fas fa-plus mr-2"></i>
                  Add New Transformer
                </h4>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-white font-medium">Path</label>
                    <input
                      type="text"
                      value={transformerFormData.path}
                      onChange={(e) => setTransformerFormData(prev => prev ? {...prev, path: e.target.value} : null)}
                      className="w-full px-3 py-2 bg-black/20 border border-white/20 rounded-lg text-white focus:border-orange-500 focus:outline-none"
                      placeholder="/path/to/transformer.js"
                    />
                    {transformerValidationErrors.path && (
                      <p className="text-sm text-red-400">{transformerValidationErrors.path}</p>
                    )}
                  </div>

                  {/* Options Management */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-white font-medium">Options</label>
                      <button
                        onClick={handleAddTransformerOption}
                        className="px-2 py-1 bg-orange-500/20 text-orange-400 rounded border border-orange-500/30 hover:bg-orange-500/30 text-sm"
                      >
                        <i className="fas fa-plus mr-1"></i>
                        Add Option
                      </button>
                    </div>
                    
                    <div className="space-y-2">
                      {transformerFormData.options && Object.entries(transformerFormData.options).map(([key, value]) => (
                        <div key={key} className="flex gap-2">
                          <input
                            type="text"
                            value={key}
                            onChange={(e) => handleUpdateTransformerOption(key, e.target.value, value as string)}
                            className="flex-1 px-3 py-2 bg-black/20 border border-white/20 rounded-lg text-white focus:border-orange-500 focus:outline-none text-sm"
                            placeholder="Option key"
                          />
                          <input
                            type="text"
                            value={value as string}
                            onChange={(e) => handleUpdateTransformerOption(key, key, e.target.value)}
                            className="flex-1 px-3 py-2 bg-black/20 border border-white/20 rounded-lg text-white focus:border-orange-500 focus:outline-none text-sm"
                            placeholder="Option value"
                          />
                          <button
                            onClick={() => handleRemoveTransformerOption(key)}
                            className="px-2 py-2 text-red-400 hover:text-red-300 transition-colors"
                          >
                            <i className="fas fa-times"></i>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end gap-3">
                    <button
                      onClick={handleCancelTransformerEdit}
                      className="px-4 py-2 bg-gray-500/20 text-gray-400 rounded-lg border border-gray-500/30 hover:bg-gray-500/30 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveTransformer}
                      className="px-4 py-2 bg-orange-500/20 text-orange-400 rounded-lg border border-orange-500/30 hover:bg-orange-500/30 transition-colors"
                    >
                      Save Transformer
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Provider Form */}
      <AnimatePresence>
        {showAddProvider && (
          <motion.div
            className="glass-card"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <i className="fas fa-plus text-2xl text-purple-500"></i>
                <h3 className="text-xl font-bold">Add New Provider</h3>
              </div>
              <button
                onClick={() => setShowAddProvider(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            
            <div className="space-y-4">
              {/* Provider Template Selection */}
              {providerTemplates.length > 0 && (
                <div className="space-y-2">
                  <label className="text-white font-medium">Import Template</label>
                  <select
                    onChange={(e) => {
                      if (e.target.value) {
                        const template = JSON.parse(e.target.value);
                        setFormData({...template, name: formData?.name || ''});
                      }
                    }}
                    className="w-full px-3 py-2 bg-black/20 border border-white/20 rounded-lg text-white focus:border-purple-500 focus:outline-none"
                  >
                    <option value="">Select a template...</option>
                    {providerTemplates.map((template, idx) => (
                      <option key={idx} value={JSON.stringify(template)}>
                        {template.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Basic Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-white font-medium">Provider Name *</label>
                  <input
                    type="text"
                    value={formData?.name || ''}
                    onChange={(e) => setFormData(prev => prev ? {...prev, name: e.target.value} : null)}
                    className={`w-full px-3 py-2 bg-black/20 border rounded-lg text-white focus:outline-none ${
                      validationErrors.name ? 'border-red-500' : 'border-white/20 focus:border-purple-500'
                    }`}
                    placeholder="Enter provider name"
                  />
                  {validationErrors.name && (
                    <p className="text-sm text-red-400">{validationErrors.name}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-white font-medium">API Base URL *</label>
                  <input
                    type="text"
                    value={formData?.api_base_url || ''}
                    onChange={(e) => setFormData(prev => prev ? {...prev, api_base_url: e.target.value} : null)}
                    className={`w-full px-3 py-2 bg-black/20 border rounded-lg text-white focus:outline-none ${
                      validationErrors.api_base_url ? 'border-red-500' : 'border-white/20 focus:border-purple-500'
                    }`}
                    placeholder="https://api.example.com/v1"
                  />
                  {validationErrors.api_base_url && (
                    <p className="text-sm text-red-400">{validationErrors.api_base_url}</p>
                  )}
                </div>
              </div>

              {/* API Key */}
              <div className="space-y-2">
                <label className="text-white font-medium">API Key *</label>
                <div className="relative">
                  <input
                    type={showApiKey ? "text" : "password"}
                    value={formData?.api_key || ''}
                    onChange={(e) => setFormData(prev => prev ? {...prev, api_key: e.target.value} : null)}
                    className={`w-full px-3 py-2 pr-12 bg-black/20 border rounded-lg text-white focus:outline-none ${
                      validationErrors.api_key ? 'border-red-500' : 'border-white/20 focus:border-purple-500'
                    }`}
                    placeholder="Enter API key"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
                  >
                    <i className={`fas fa-${showApiKey ? 'eye-slash' : 'eye'}`}></i>
                  </button>
                </div>
                {validationErrors.api_key && (
                  <p className="text-sm text-red-400">{validationErrors.api_key}</p>
                )}
              </div>

              {/* Models Management */}
              <div className="space-y-2">
                <label className="text-white font-medium">Models</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newModelInput}
                    onChange={(e) => setNewModelInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAddModel()}
                    className="flex-1 px-3 py-2 bg-black/20 border border-white/20 rounded-lg text-white focus:border-purple-500 focus:outline-none"
                    placeholder="Add model name"
                  />
                  <button
                    onClick={handleAddModel}
                    className="px-4 py-2 bg-purple-500/20 text-purple-400 rounded-lg border border-purple-500/30 hover:bg-purple-500/30 transition-colors"
                  >
                    <i className="fas fa-plus"></i>
                  </button>
                </div>
                
                {/* Model Pills */}
                <div className="flex flex-wrap gap-2 mt-3">
                  {(formData?.models || []).map((model, modelIndex) => (
                    <div
                      key={modelIndex}
                      className="flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full text-sm text-white"
                    >
                      {model}
                      <button
                        onClick={() => handleRemoveModel(modelIndex)}
                        className="text-gray-400 hover:text-red-400 transition-colors"
                      >
                        <i className="fas fa-times text-xs"></i>
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4">
                <button
                  onClick={() => setShowAddProvider(false)}
                  className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveProvider}
                  className="px-6 py-2 bg-purple-500/20 text-purple-400 rounded-lg border border-purple-500/30 hover:bg-purple-500/30 transition-colors"
                >
                  <i className="fas fa-plus mr-2"></i>
                  Add Provider
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Provider Cards - New Square Layout */}
      <div className="space-y-8">
        {filteredProviders.map((provider, index) => (
          <div key={provider.name || index}>
            {/* Provider Header */}
            <motion.div
              className="mb-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                  <div className={`w-3 h-3 rounded-full ${provider.api_key ? 'bg-green-500' : 'bg-red-500'}`}></div>
                  <h3 className="text-xl font-bold text-white">{provider.name || 'Unnamed Provider'}</h3>
                  <span className="text-sm text-gray-400">({provider.models?.length || 0} models)</span>
                </div>
                
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    provider.api_key 
                      ? 'bg-green-500/10 text-green-400 border border-green-500/20' 
                      : 'bg-red-500/10 text-red-400 border border-red-500/20'
                  }`}>
                    {provider.api_key ? 'Active' : 'Inactive'}
                  </span>
                  
                  <button
                    onClick={() => handleEditProvider(index)}
                    className="p-2 text-gray-400 hover:text-purple-400 transition-colors"
                  >
                    <i className="fas fa-edit"></i>
                  </button>
                  
                  <button
                    onClick={() => handleDeleteProvider(index)}
                    className="p-2 text-gray-400 hover:text-red-400 transition-colors"
                  >
                    <i className="fas fa-trash"></i>
                  </button>
                </div>
              </div>

              <div className="text-xs text-gray-500 mb-4 pl-7">
                {provider.api_base_url}
              </div>
            </motion.div>

            {/* Models Grid - Square Cards */}
            <motion.div
              className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 mb-8"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
            >
              {(provider.models || []).map((model, modelIndex) => (
                <motion.div
                  key={modelIndex}
                  className={`relative group cursor-pointer rounded-lg border transition-all duration-200 hover:scale-105 aspect-square flex flex-col items-center justify-center p-3 ${
                    `${provider.name},${model}` === activeModel
                      ? 'bg-gradient-to-br from-purple-500/20 to-purple-600/20 border-purple-500/50 shadow-lg shadow-purple-500/20'
                      : 'bg-gradient-to-br from-white/5 to-white/10 border-white/20 hover:border-white/40 hover:bg-gradient-to-br hover:from-white/10 hover:to-white/15'
                  }`}
                  whileHover={{ y: -2 }}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: modelIndex * 0.05 }}
                >
                  {/* Active Model Crown */}
                  {`${provider.name},${model}` === activeModel && (
                    <div className="absolute -top-2 -right-2 bg-yellow-500 rounded-full p-1 shadow-lg">
                      <i className="fas fa-crown text-xs text-black"></i>
                    </div>
                  )}

                  {/* Model Icon */}
                  <div className="mb-2">
                    <i className={`fas fa-robot text-lg ${
                      `${provider.name},${model}` === activeModel
                        ? 'text-purple-400'
                        : 'text-gray-400 group-hover:text-white'
                    }`}></i>
                  </div>

                  {/* Model Name */}
                  <div className="text-center">
                    <h4 className={`text-xs font-medium leading-tight ${
                      `${provider.name},${model}` === activeModel
                        ? 'text-purple-200'
                        : 'text-gray-300 group-hover:text-white'
                    }`}>
                      {model.length > 12 ? model.substring(0, 12) + '...' : model}
                    </h4>
                  </div>

                  {/* Hover tooltip for long names */}
                  {model.length > 12 && (
                    <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 bg-black/90 text-white text-xs py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                      {model}
                    </div>
                  )}
                </motion.div>
              ))}

              {/* Empty State for Provider */}
              {(!provider.models || provider.models.length === 0) && (
                <div className="aspect-square flex flex-col items-center justify-center p-3 border border-dashed border-gray-600 rounded-lg">
                  <i className="fas fa-plus text-gray-500 text-lg mb-2"></i>
                  <span className="text-xs text-gray-500 text-center">No models</span>
                </div>
              )}
            </motion.div>

            {/* Separator Line */}
            {index < filteredProviders.length - 1 && (
              <div className="border-b border-gradient-to-r border-white/10 mb-8"></div>
            )}
          </div>
        ))}
      </div>

      {/* Edit Provider Form */}
      {editingProvider !== null && formData && (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-8 backdrop-blur-xl bg-white/5 rounded-lg border border-white/20 p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white text-lg font-semibold">Edit Provider: {formData.name}</h3>
              <button
                onClick={handleCancelEdit}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            
            <div className="space-y-4">
              {/* Basic Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-white font-medium">Provider Name *</label>
                  <input
                    type="text"
                    value={formData.name || ''}
                    onChange={(e) => setFormData(prev => prev ? {...prev, name: e.target.value} : null)}
                    className={`w-full px-3 py-2 bg-black/20 border rounded-lg text-white focus:outline-none ${
                      validationErrors.name ? 'border-red-500' : 'border-white/20 focus:border-purple-500'
                    }`}
                    placeholder="Enter provider name"
                  />
                  {validationErrors.name && (
                    <p className="text-sm text-red-400">{validationErrors.name}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-white font-medium">API Base URL *</label>
                  <input
                    type="text"
                    value={formData.api_base_url || ''}
                    onChange={(e) => setFormData(prev => prev ? {...prev, api_base_url: e.target.value} : null)}
                    className={`w-full px-3 py-2 bg-black/20 border rounded-lg text-white focus:outline-none ${
                      validationErrors.api_base_url ? 'border-red-500' : 'border-white/20 focus:border-purple-500'
                    }`}
                    placeholder="https://api.example.com/v1"
                  />
                  {validationErrors.api_base_url && (
                    <p className="text-sm text-red-400">{validationErrors.api_base_url}</p>
                  )}
                </div>
              </div>

              {/* API Key */}
              <div className="space-y-2">
                <label className="text-white font-medium">API Key *</label>
                <div className="relative">
                  <input
                    type={showApiKey ? "text" : "password"}
                    value={formData.api_key || ''}
                    onChange={(e) => setFormData(prev => prev ? {...prev, api_key: e.target.value} : null)}
                    className={`w-full px-3 py-2 pr-12 bg-black/20 border rounded-lg text-white focus:outline-none ${
                      validationErrors.api_key ? 'border-red-500' : 'border-white/20 focus:border-purple-500'
                    }`}
                    placeholder="Enter API key"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white"
                  >
                    <i className={`fas fa-${showApiKey ? 'eye-slash' : 'eye'}`}></i>
                  </button>
                </div>
                {validationErrors.api_key && (
                  <p className="text-sm text-red-400">{validationErrors.api_key}</p>
                )}
              </div>

              {/* Models Management */}
              <div className="space-y-2">
                <label className="text-white font-medium">Models</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newModelInput}
                    onChange={(e) => setNewModelInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAddModel()}
                    className="flex-1 px-3 py-2 bg-black/20 border border-white/20 rounded-lg text-white focus:border-purple-500 focus:outline-none"
                    placeholder="Add model name"
                  />
                  <button
                    onClick={handleAddModel}
                    className="px-4 py-2 bg-purple-500/20 text-purple-400 rounded-lg border border-purple-500/30 hover:bg-purple-500/30 transition-colors"
                  >
                    <i className="fas fa-plus"></i>
                  </button>
                </div>
                
                {/* Model Pills */}
                <div className="flex flex-wrap gap-2 mt-3">
                  {(formData.models || []).map((model, modelIndex) => (
                    <div
                      key={modelIndex}
                      className="flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full text-sm text-white"
                    >
                      {model}
                      <button
                        onClick={() => handleRemoveModel(modelIndex)}
                        className="text-gray-400 hover:text-red-400 transition-colors"
                      >
                        <i className="fas fa-times text-xs"></i>
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4">
                <button
                  onClick={handleCancelEdit}
                  className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveProvider}
                  className="px-6 py-2 bg-purple-500/20 text-purple-400 rounded-lg border border-purple-500/30 hover:bg-purple-500/30 transition-colors"
                >
                  <i className="fas fa-save mr-2"></i>
                  Update Provider
                </button>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      )}

      {/* Empty State */}
      {filteredProviders.length === 0 && !editingProvider && (
          <motion.div
            className="glass-card text-center py-12"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <i className="fas fa-plus-circle text-4xl text-gray-400 mb-4"></i>
            <h4 className="text-lg mb-2 text-white">
              {searchTerm ? 'No Providers Found' : 'No Providers Configured'}
            </h4>
            <p className="mb-4 text-gray-400">
              {searchTerm 
                ? `No providers match "${searchTerm}". Try a different search term.`
                : 'Add your first AI provider to get started with the router.'
              }
            </p>
            {!searchTerm && (
              <button
                onClick={handleAddProvider}
                className="px-6 py-3 bg-purple-500/20 text-purple-400 rounded-lg border border-purple-500/30 hover:bg-purple-500/30 transition-colors"
              >
                <i className="fas fa-plus mr-2"></i>
                Add Your First Provider
              </button>
            )}
        </motion.div>
      )}
    </div>
  );
}
