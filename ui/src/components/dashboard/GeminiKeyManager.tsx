import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useConfig } from '@/components/ConfigProvider';
import type { Provider, ProviderTransformer } from '@/types';

interface GeminiKeyManagerProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: () => void;
}

interface GeminiConfig {
  name: string;
  api_base_url: string;
  api_keys: string[];
  models: string[];
  transformer: ProviderTransformer;
}

export function GeminiKeyManager({ isOpen, onClose, onSave }: GeminiKeyManagerProps) {
  const { config, setConfig } = useConfig();
  const [geminiConfig, setGeminiConfig] = useState<GeminiConfig>({
    name: 'gemini-rotation',
    api_base_url: 'https://generativelanguage.googleapis.com/v1beta/models/',
    api_keys: [''],
    models: ['gemini-2.5-pro', 'gemini-2.5-flash'],
    transformer: {
      use: [
        [
          'gemini-key-rotation',
          {
            path: '/opt/lampp/htdocs/claude-code-router/src/transformers/gemini-key-rotation.js'
          }
        ]
      ]
    }
  });
  const [validationErrors, setValidationErrors] = useState<{[key: string]: string}>({});

  useEffect(() => {
    if (isOpen && config) {
      // Caută un provider Gemini existent
      const existingGemini = config.Providers?.find(p => p.name === 'gemini-rotation');
      if (existingGemini) {
        // ADAPTARE: Parsează cheile din api_key standard (separate cu virgule)
        const keysFromApiKey = existingGemini.api_key ? 
          existingGemini.api_key.split(',').map(k => k.trim()).filter(k => k.length > 0) : 
          [''];
        
        setGeminiConfig({
          name: existingGemini.name,
          api_base_url: existingGemini.api_base_url || 'https://generativelanguage.googleapis.com/v1beta/models/',
          api_keys: keysFromApiKey,
          models: existingGemini.models || ['gemini-2.5-pro', 'gemini-2.5-flash'],
          transformer: existingGemini.transformer || {
            use: [
              [
                'gemini-key-rotation',
                {
                  path: '/opt/lampp/htdocs/claude-code-router/src/transformers/gemini-key-rotation.js'
                }
              ]
            ]
          }
        });
      }
    }
  }, [isOpen, config]);

  const validateConfig = (): boolean => {
    const errors: {[key: string]: string} = {};
    
    if (!geminiConfig.name.trim()) {
      errors.name = 'Provider name is required';
    }
    
    if (!geminiConfig.api_base_url.trim()) {
      errors.api_base_url = 'API base URL is required';
    }
    
    const validKeys = geminiConfig.api_keys.filter(key => key.trim() !== '');
    if (validKeys.length === 0) {
      errors.api_keys = 'At least one API key is required';
    }
    
    // Verifică că cheile API sunt în formatul corect pentru Gemini
    const invalidKeys = validKeys.filter(key => !key.startsWith('AIza'));
    if (invalidKeys.length > 0) {
      errors.api_keys = 'Gemini API keys should start with "AIza"';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleAddApiKey = () => {
    setGeminiConfig(prev => ({
      ...prev,
      api_keys: [...prev.api_keys, '']
    }));
  };

  const handleRemoveApiKey = (index: number) => {
    if (geminiConfig.api_keys.length <= 1) return;
    setGeminiConfig(prev => ({
      ...prev,
      api_keys: prev.api_keys.filter((_, i) => i !== index)
    }));
  };

  const handleApiKeyChange = (index: number, value: string) => {
    setGeminiConfig(prev => ({
      ...prev,
      api_keys: prev.api_keys.map((key, i) => i === index ? value : key)
    }));
  };

  const handleAddModel = () => {
    const newModel = prompt('Enter new model name:');
    if (newModel && newModel.trim() && !geminiConfig.models.includes(newModel.trim())) {
      setGeminiConfig(prev => ({
        ...prev,
        models: [...prev.models, newModel.trim()]
      }));
    }
  };

  const handleRemoveModel = (index: number) => {
    setGeminiConfig(prev => ({
      ...prev,
      models: prev.models.filter((_, i) => i !== index)
    }));
  };

  const handleSave = () => {
    if (!validateConfig()) return;

    const validKeys = geminiConfig.api_keys.filter(key => key.trim() !== '');
    
    // ADAPTARE: Salvăm cheile în formatul standard api_key (virgule separate)
    const geminiProvider: Provider = {
      name: geminiConfig.name,
      api_base_url: geminiConfig.api_base_url,
      api_key: validKeys.join(', '), // <- SISTEMUL STANDARD
      models: geminiConfig.models,
      transformer: geminiConfig.transformer
    };

    const newProviders = [...(config?.Providers || [])];
    const existingIndex = newProviders.findIndex(p => p.name === geminiConfig.name);
    
    if (existingIndex >= 0) {
      newProviders[existingIndex] = geminiProvider;
    } else {
      newProviders.push(geminiProvider);
    }

    setConfig({...config!, Providers: newProviders});
    onSave?.();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="bg-gray-900 rounded-xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <span className="text-2xl">🔑</span>
              Gemini API Keys Manager
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors text-2xl"
            >
              ×
            </button>
          </div>

          <div className="space-y-6">
            {/* Provider Name */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Provider Name
              </label>
              <input
                type="text"
                value={geminiConfig.name}
                onChange={(e) => setGeminiConfig(prev => ({...prev, name: e.target.value}))}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                placeholder="gemini-rotation"
              />
              {validationErrors.name && (
                <p className="mt-1 text-sm text-red-400">{validationErrors.name}</p>
              )}
            </div>

            {/* API Base URL */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                API Base URL
              </label>
              <input
                type="text"
                value={geminiConfig.api_base_url}
                onChange={(e) => setGeminiConfig(prev => ({...prev, api_base_url: e.target.value}))}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                placeholder="https://generativelanguage.googleapis.com/v1beta/models/"
              />
              {validationErrors.api_base_url && (
                <p className="mt-1 text-sm text-red-400">{validationErrors.api_base_url}</p>
              )}
            </div>

            {/* API Keys */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-300">
                  API Keys (Rotation Order)
                </label>
                <button
                  onClick={handleAddApiKey}
                  className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                >
                  + Add Key
                </button>
              </div>
              <div className="space-y-2">
                {geminiConfig.api_keys.map((key, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="text-gray-400 text-sm w-8">#{index + 1}</span>
                    <input
                      type="text"
                      value={key}
                      onChange={(e) => handleApiKeyChange(index, e.target.value)}
                      className="flex-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                      placeholder="AIzaSy..."
                    />
                    {geminiConfig.api_keys.length > 1 && (
                      <button
                        onClick={() => handleRemoveApiKey(index)}
                        className="px-2 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {validationErrors.api_keys && (
                <p className="mt-1 text-sm text-red-400">{validationErrors.api_keys}</p>
              )}
              <p className="text-xs text-gray-400 mt-1">
                Keys will be used in round-robin rotation. Get your API keys from: 
                <a href="https://makersuite.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline ml-1">
                  Google AI Studio
                </a>
              </p>
            </div>

            {/* Models */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-300">
                  Supported Models
                </label>
                <button
                  onClick={handleAddModel}
                  className="px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
                >
                  + Add Model
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {geminiConfig.models.map((model, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 px-3 py-1 bg-gray-800 border border-gray-600 rounded-lg text-white"
                  >
                    <span className="text-sm">{model}</span>
                    <button
                      onClick={() => handleRemoveModel(index)}
                      className="text-red-400 hover:text-red-300 transition-colors"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Transformer Info */}
            <div className="bg-gray-800 rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-300 mb-2">🔄 Key Rotation Transformer</h4>
              <p className="text-xs text-gray-400 mb-2">
                Transformer: <code className="bg-gray-700 px-2 py-1 rounded">gemini-key-rotation</code>
              </p>
              <p className="text-xs text-gray-400">
                Path: <code className="bg-gray-700 px-2 py-1 rounded text-xs">
                  {typeof geminiConfig.transformer.use[0][1] === 'object' && 'path' in geminiConfig.transformer.use[0][1] 
                    ? (geminiConfig.transformer.use[0][1] as { path: string }).path 
                    : 'N/A'}
                </code>
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 mt-8 pt-4 border-t border-gray-700">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Save Configuration
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}