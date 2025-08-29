import React, { useState, useEffect } from 'react';
import { Card } from '../../ui/card';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Badge } from '../../ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../../ui/dialog';
import { Switch } from '../../ui/switch';
import ApiKeyUsageChart from './ApiKeyUsageChart';
import '@/styles/apikeys.css';

interface ApiKeyInfo {
  id: string;
  name: string;
  key: string;
  provider: string;
  isEnabled: boolean;
  createdAt: string;
  lastUsed?: string;
  requestCount: number;
  errorCount: number;
  isTemporarilyBlocked: boolean;
  blockReason?: string;
  stats?: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    lastUsed?: string;
    averageResponseTime?: number;
  };
}

interface ApiKeyStats {
  totalKeys: number;
  activeKeys: number;
  blockedKeys: number;
  disabledKeys: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
}

interface ApiKeyDetailStats {
  id: string;
  name: string;
  provider: string;
  isEnabled: boolean;
  isBlocked: boolean;
  requestCount: number;
  errorCount: number;
  lastUsed?: string;
  successRate: string;
}

// Helper function to mask API key for display
const maskApiKey = (key: string): string => {
  if (key.length <= 8) return '••••••••';
  const start = key.substring(0, 4);
  const end = key.substring(key.length - 4);
  return `${start}••••${end}`;
};

const ApiKeysTab: React.FC = () => {
  const [apiKeys, setApiKeys] = useState<ApiKeyInfo[]>([]);
  const [stats, setStats] = useState<ApiKeyStats | null>(null);
  const [detailStats, setDetailStats] = useState<ApiKeyDetailStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Dialog states
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isBlockDialogOpen, setIsBlockDialogOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState<ApiKeyInfo | null>(null);
  
  // Form states
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyValue, setNewKeyValue] = useState('');
  const [newKeyProvider, setNewKeyProvider] = useState('gemini');
  const [blockReason, setBlockReason] = useState('');

  const fetchData = async (isPeriodicRefresh = false) => {
    try {
      if (!isPeriodicRefresh) {
        setLoading(true);
      }
      
      // Fetch API keys
      const keysResponse = await fetch('/api/keys');
      const keysData = await keysResponse.json();
      
      // Fetch stats
      const statsResponse = await fetch('/api/keys/stats');
      const statsData = await statsResponse.json();

      if (keysData.success && statsData.success) {
        setApiKeys(keysData.data);
        setStats(statsData.data.summary);
        setDetailStats(statsData.data.keyDetails);
        setError(null);
      } else {
        const errorMsg = keysData.error || statsData.error || 'An unknown error occurred when fetching data.';
        throw new Error(errorMsg);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(true), 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const handleAddKey = async () => {
    try {
      const response = await fetch('/api/keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newKeyName,
          key: newKeyValue,
          provider: newKeyProvider
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setNewKeyName('');
        setNewKeyValue('');
        setNewKeyProvider('gemini');
        setIsAddDialogOpen(false);
        fetchData();
      } else {
        setError(data.error);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleToggleKey = async (keyId: string) => {
    try {
      const response = await fetch(`/api/keys/${keyId}/toggle`, {
        method: 'PUT'
      });
      
      const data = await response.json();
      
      if (data.success) {
        fetchData();
      } else {
        setError(data.error);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleBlockKey = async (keyId: string, reason?: string) => {
    try {
      const response = await fetch(`/api/keys/${keyId}/block`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason })
      });
      
      const data = await response.json();
      
      if (data.success) {
        setIsBlockDialogOpen(false);
        setSelectedKey(null);
        setBlockReason('');
        fetchData();
      } else {
        setError(data.error);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteKey = async (keyId: string) => {
    if (!confirm('Are you sure you want to delete this API key?')) {
      return;
    }
    
    try {
      const response = await fetch(`/api/keys/${keyId}`, {
        method: 'DELETE'
      });
      
      const data = await response.json();
      
      if (data.success) {
        fetchData();
      } else {
        setError(data.error);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const getStatusBadge = (key: ApiKeyInfo) => {
    if (key.isTemporarilyBlocked) {
      return <Badge className="bg-red-500">Blocked</Badge>;
    }
    if (!key.isEnabled) {
      return <Badge className="bg-gray-500">Disabled</Badge>;
    }
    return <Badge className="bg-green-500">Active</Badge>;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading API keys...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-100 border border-red-400 text-red-700 rounded">
        Error: {error}
        <Button onClick={() => fetchData()} className="ml-4">Retry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 dashboard-context">
      {/* Header with stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-4 glass-card">
          <div className="text-2xl font-bold text-blue-400">{stats?.totalKeys || 0}</div>
          <div className="text-sm text-gray-300">Total Keys</div>
        </Card>
        <Card className="p-4 glass-card">
          <div className="text-2xl font-bold text-green-400">{stats?.activeKeys || 0}</div>
          <div className="text-sm text-gray-300">Active Keys</div>
        </Card>
        <Card className="p-4 glass-card">
          <div className="text-2xl font-bold text-red-400">{stats?.blockedKeys || 0}</div>
          <div className="text-sm text-gray-300">Blocked Keys</div>
        </Card>
        <Card className="p-4 glass-card">
          <div className="text-2xl font-bold text-purple-400">
            {stats ? Math.round((stats.successfulRequests / Math.max(stats.totalRequests, 1)) * 100) : 0}%
          </div>
          <div className="text-sm text-gray-300">Success Rate</div>
        </Card>
      </div>

      {/* Usage Chart */}
      <ApiKeyUsageChart />

      {/* Add key button */}
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-white">API Keys Management</h2>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-to-r from-pink-500 to-violet-500 hover:from-pink-600 hover:to-violet-600 text-white">
              Add New Key
            </Button>
          </DialogTrigger>
          <DialogContent className="glass-card">
            <DialogHeader>
              <DialogTitle className="text-white">Add New API Key</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-300">Key Name</label>
                <Input
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="e.g., Gemini Production Key"
                  className="bg-black/20 border-gray-600 text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-300">API Key</label>
                <Input
                  type="password"
                  value={newKeyValue}
                  onChange={(e) => setNewKeyValue(e.target.value)}
                  placeholder="AIzaSy..."
                  className="bg-black/20 border-gray-600 text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-300">Provider</label>
                <select
                  value={newKeyProvider}
                  onChange={(e) => setNewKeyProvider(e.target.value)}
                  className="w-full p-2 border border-gray-600 rounded bg-black/20 text-white"
                >
                  <option value="gemini">Gemini</option>
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="openrouter">OpenRouter</option>
                  <option value="deepseek">DeepSeek</option>
                </select>
              </div>
              <div className="flex justify-end space-x-2">
                <Button 
                  variant="outline" 
                  onClick={() => setIsAddDialogOpen(false)}
                  className="border-gray-600 text-gray-300 hover:bg-gray-700/50"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleAddKey}
                  className="bg-gradient-to-r from-pink-500 to-violet-500 hover:from-pink-600 hover:to-violet-600 text-white"
                >
                  Add Key
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* API Keys table */}
      <Card className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-black/20">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-300 uppercase tracking-wider">
                  Key Info
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-300 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-300 uppercase tracking-wider">
                  Usage Stats
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-300 uppercase tracking-wider">
                  Last Used
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-300 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              {apiKeys.map((key) => (
                <tr key={key.id} className="hover:bg-black/10">
                  <td className="px-4 py-4">
                    <div>
                      <div className="text-sm font-medium text-white">{key.name}</div>
                      <div className="text-sm text-gray-300">{key.provider}</div>
                      <div className="text-xs text-gray-400 font-mono">{maskApiKey(key.key)}</div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="space-y-1">
                      {getStatusBadge(key)}
                      {key.isTemporarilyBlocked && key.blockReason && (
                        <div className="text-xs text-red-400">{key.blockReason}</div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm">
                    <div className="text-white">
                      <div>Requests: {key.requestCount}</div>
                      <div className="text-red-400">Errors: {key.errorCount}</div>
                      <div className="text-xs text-gray-400">
                        Success: {key.requestCount > 0 ? Math.round(((key.requestCount - key.errorCount) / key.requestCount) * 100) : 0}%
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-300">
                    {formatDate(key.lastUsed)}
                  </td>
                  <td className="px-4 py-4 space-x-2">
                    <Switch
                      checked={key.isEnabled}
                      onCheckedChange={() => handleToggleKey(key.id)}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedKey(key);
                        setIsBlockDialogOpen(true);
                      }}
                      className={key.isTemporarilyBlocked ? 
                        "bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500/30" : 
                        "bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/30"
                      }
                    >
                      {key.isTemporarilyBlocked ? 'Unblock' : 'Block'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeleteKey(key.id)}
                      className="bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/30"
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Block dialog */}
      <Dialog open={isBlockDialogOpen} onOpenChange={setIsBlockDialogOpen}>
        <DialogContent className="glass-card">
          <DialogHeader>
            <DialogTitle className="text-white">
              {selectedKey?.isTemporarilyBlocked ? 'Unblock' : 'Block'} API Key
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-gray-300">Key: <strong className="text-white">{selectedKey?.name}</strong></p>
              {selectedKey?.isTemporarilyBlocked ? (
                <p className="text-green-400 mt-2">This key will be unblocked and available for rotation.</p>
              ) : (
                <>
                  <p className="text-red-400 mt-2">This key will be temporarily blocked from rotation.</p>
                  <label className="block text-sm font-medium mt-4 mb-2 text-gray-300">Block Reason (optional)</label>
                  <Input
                    value={blockReason}
                    onChange={(e) => setBlockReason(e.target.value)}
                    placeholder="e.g., Rate limit exceeded, Security concern"
                    className="bg-black/20 border-gray-600 text-white"
                  />
                </>
              )}
            </div>
            <div className="flex justify-end space-x-2">
              <Button 
                variant="outline" 
                onClick={() => setIsBlockDialogOpen(false)}
                className="border-gray-600 text-gray-300 hover:bg-gray-700/50"
              >
                Cancel
              </Button>
              <Button 
                onClick={() => selectedKey && handleBlockKey(selectedKey.id, blockReason)}
                className={selectedKey?.isTemporarilyBlocked ? 
                  "bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white" : 
                  "bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 text-white"
                }
              >
                {selectedKey?.isTemporarilyBlocked ? 'Unblock' : 'Block'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ApiKeysTab;