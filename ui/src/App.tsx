import React, { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { SettingsDialog } from "@/components/SettingsDialog";
import { Transformers } from "@/components/Transformers";
import { Providers } from "@/components/Providers";
import { Router } from "@/components/Router";
import { JsonEditor } from "@/components/JsonEditor";
import { LogViewer } from "@/components/LogViewer";
import { Button } from "@/components/ui/button";
import { useConfig } from "@/components/ConfigProvider";
import { PluginProvider } from "@/contexts/PluginContext";
import { api } from "@/lib/api";
import { Settings, Languages, Save, RefreshCw, FileJson, CircleArrowUp, FileText } from "lucide-react";

// Lazy load MissionControlTab from plugin - RE-ENABLED
const MissionControlTab = React.lazy(() => 
  import('@plugins/analytics/ui/components/dashboard/tabs/MissionControlTab')
    .then(module => ({ default: module.MissionControlTab }))
    .catch(() => ({ default: () => <div>Analytics plugin not available</div> }))
);

// Lazy load AnalyticsButton from plugin
const AnalyticsButton = React.lazy(() => 
  import('@plugins/analytics/ui/AnalyticsButton')
    .then(module => ({ default: module.AnalyticsButton }))
    .catch(() => ({ default: () => null }))
);

// Lazy load MissionControlModal from plugin (similar to LogViewer approach)
const MissionControlModal = React.lazy(() => 
  import('@plugins/analytics/ui/components/MissionControlModal')
    .then(module => ({ default: module.MissionControlModal }))
    .catch(() => ({ default: ({ open }: { open: boolean }) => open ? <div>Analytics plugin not available</div> : null }))
);
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Toast } from "@/components/ui/toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import "@/styles/animations.css";

function App() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { config, error } = useConfig();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isJsonEditorOpen, setIsJsonEditorOpen] = useState(false);
  const [isLogViewerOpen, setIsLogViewerOpen] = useState(false);
  const [isMissionControlModalOpen, setIsMissionControlModalOpen] = useState(false);
  const [currentView, setCurrentView] = useState<'dashboard' | 'analytics'>('dashboard');
  const [activeTab, setActiveTab] = useState<'dashboard' | 'analytics'>('dashboard');
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  // 版本检查状态
  const [isNewVersionAvailable, setIsNewVersionAvailable] = useState(false);
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false);
  const [newVersionInfo, setNewVersionInfo] = useState<{ version: string; changelog: string } | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [hasCheckedUpdate, setHasCheckedUpdate] = useState(false);
  const hasAutoCheckedUpdate = useRef(false);

  // Listen for analytics plugin events
  useEffect(() => {
    const handleOpenMissionControl = () => {
      // Instead of switching tab, open modal (like LogViewer)
      setIsMissionControlModalOpen(true);
    };

    const handleCloseMissionControl = () => {
      // Close modal
      setIsMissionControlModalOpen(false);
    };

    document.addEventListener('open-mission-control', handleOpenMissionControl);
    document.addEventListener('close-mission-control', handleCloseMissionControl);

    return () => {
      document.removeEventListener('open-mission-control', handleOpenMissionControl);
      document.removeEventListener('close-mission-control', handleCloseMissionControl);
    };
  }, []);

  const saveConfig = async () => {
    // Handle case where config might be null or undefined
    if (!config) {
      setToast({ message: t('app.config_missing'), type: 'error' });
      return;
    }
    
    try {
      // Save to API
      const response = await api.updateConfig(config);
      // Show success message or handle as needed
      console.log('Config saved successfully');
      
      // 根据响应信息进行提示
      if (response && typeof response === 'object' && 'success' in response) {
        const apiResponse = response as { success: boolean; message?: string };
        if (apiResponse.success) {
          setToast({ message: apiResponse.message || t('app.config_saved_success'), type: 'success' });
        } else {
          setToast({ message: apiResponse.message || t('app.config_saved_failed'), type: 'error' });
        }
      } else {
        // 默认成功提示
        setToast({ message: t('app.config_saved_success'), type: 'success' });
      }
    } catch (error) {
      console.error('Failed to save config:', error);
      // Handle error appropriately
      setToast({ message: t('app.config_saved_failed') + ': ' + (error as Error).message, type: 'error' });
    }
  };

  const saveConfigAndRestart = async () => {
    // Handle case where config might be null or undefined
    if (!config) {
      setToast({ message: t('app.config_missing'), type: 'error' });
      return;
    }
    
    try {
      // Save to API
      const response = await api.updateConfig(config);
      
      // Check if save was successful before restarting
      let saveSuccessful = true;
      if (response && typeof response === 'object' && 'success' in response) {
        const apiResponse = response as { success: boolean; message?: string };
        if (!apiResponse.success) {
          saveSuccessful = false;
          setToast({ message: apiResponse.message || t('app.config_saved_failed'), type: 'error' });
        }
      }
      
      // Only restart if save was successful
      if (saveSuccessful) {
        // Restart service
        const response = await api.restartService();
        
        // Show success message or handle as needed
        console.log('Config saved and service restarted successfully');
        
        // 根据响应信息进行提示
        if (response && typeof response === 'object' && 'success' in response) {
          const apiResponse = response as { success: boolean; message?: string };
          if (apiResponse.success) {
            setToast({ message: apiResponse.message || t('app.config_saved_restart_success'), type: 'success' });
          }
        } else {
          // 默认成功提示
          setToast({ message: t('app.config_saved_restart_success'), type: 'success' });
        }
      }
    } catch (error) {
      console.error('Failed to save config and restart:', error);
      // Handle error appropriately
      setToast({ message: t('app.config_saved_restart_failed') + ': ' + (error as Error).message, type: 'error' });
    }
  };
  
  // 检查更新函数
  const checkForUpdates = useCallback(async (showDialog: boolean = true) => {
    // 如果已经检查过且有新版本，根据参数决定是否显示对话框
    if (hasCheckedUpdate && isNewVersionAvailable) {
      if (showDialog) {
        setIsUpdateDialogOpen(true);
      }
      return;
    }
    
    setIsCheckingUpdate(true);
    try {
      const updateInfo = await api.checkForUpdates();
      
      if (updateInfo.hasUpdate && updateInfo.latestVersion && updateInfo.changelog) {
        setIsNewVersionAvailable(true);
        setNewVersionInfo({
          version: updateInfo.latestVersion,
          changelog: updateInfo.changelog
        });
        // 只有在showDialog为true时才显示对话框
        if (showDialog) {
          setIsUpdateDialogOpen(true);
        }
      } else if (showDialog) {
        // 只有在showDialog为true时才显示没有更新的提示
        setToast({ message: t('app.no_updates_available'), type: 'success' });
      }
      
      setHasCheckedUpdate(true);
    } catch (error) {
      console.error('Failed to check for updates:', error);
      if (showDialog) {
        setToast({ message: t('app.update_check_failed') + ': ' + (error as Error).message, type: 'error' });
      }
    } finally {
      setIsCheckingUpdate(false);
    }
  }, [isNewVersionAvailable, t]);

  useEffect(() => {
    const checkAuth = async () => {
      // If we already have a config, we're authenticated
      if (config) {
        setIsCheckingAuth(false);
        // 自动检查更新，但不显示对话框
        if (!hasAutoCheckedUpdate.current) {
          hasAutoCheckedUpdate.current = true;
          checkForUpdates(false);
        }
        return;
      }
      
      // For empty API key, allow access without checking config
      const apiKey = localStorage.getItem('apiKey');
      if (!apiKey) {
        setIsCheckingAuth(false);
        return;
      }
      
      // If we don't have a config, try to fetch it
      try {
        await api.getConfig();
        // If successful, we don't need to do anything special
        // The ConfigProvider will handle setting the config
      } catch (err) {
        // If it's a 401, the API client will redirect to login
        // For other errors, we still show the app to display the error
        console.error('Error checking auth:', err);
        // Redirect to login on authentication error
        if ((err as Error).message === 'Unauthorized') {
          navigate('/login');
        }
      } finally {
        setIsCheckingAuth(false);
        // 在获取配置完成后检查更新，但不显示对话框
        if (!hasAutoCheckedUpdate.current) {
          hasAutoCheckedUpdate.current = true;
          checkForUpdates(false);
        }
      }
    };

    checkAuth();
    
    // Listen for unauthorized events
    const handleUnauthorized = () => {
      navigate('/login');
    };
    
    window.addEventListener('unauthorized', handleUnauthorized);
    
    return () => {
      window.removeEventListener('unauthorized', handleUnauthorized);
    };
  }, [config, navigate]);
  
  // 执行更新函数
  const performUpdate = async () => {
    if (!newVersionInfo) return;
    
    try {
      const result = await api.performUpdate();
      
      if (result.success) {
        setToast({ message: t('app.update_successful'), type: 'success' });
        setIsNewVersionAvailable(false);
        setIsUpdateDialogOpen(false);
        setHasCheckedUpdate(false); // 重置检查状态，以便下次重新检查
      } else {
        setToast({ message: t('app.update_failed') + ': ' + result.message, type: 'error' });
      }
    } catch (error) {
      console.error('Failed to perform update:', error);
      setToast({ message: t('app.update_failed') + ': ' + (error as Error).message, type: 'error' });
    }
  };

  
  if (isCheckingAuth) {
    return (
      <div className="h-screen bg-gray-50 font-sans flex items-center justify-center">
        <div className="text-gray-500">Loading application...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen bg-gray-50 font-sans flex items-center justify-center">
        <div className="text-red-500">Error: {error.message}</div>
      </div>
    );
  }

  // Handle case where config is null or undefined
  if (!config) {
    return (
      <div className="h-screen bg-gray-50 font-sans flex items-center justify-center">
        <div className="text-gray-500">Loading configuration...</div>
      </div>
    );
  }

  return (
    <PluginProvider>
      {/* Analytics Button - self-contained plugin component */}
      <Suspense fallback={null}>
        <AnalyticsButton />
      </Suspense>
      
      <div className="h-screen bg-gray-50 font-sans">
      <header className="flex h-16 items-center justify-between border-b bg-white px-6">
        <div className="flex items-center gap-6">
          <h1 className="text-xl font-semibold text-gray-800">{t('app.title')}</h1>
          
          {/* Tab indicator (only shows when on Analytics) */}
          {activeTab === 'analytics' && (
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
              <span className="text-sm font-medium text-blue-700">Analytics Mode</span>
              <button
                className="text-xs text-gray-500 hover:text-gray-700 ml-2"
                onClick={() => setActiveTab('dashboard')}
              >
                ← Back to Dashboard
              </button>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setIsSettingsOpen(true)} className="transition-all-ease hover:scale-110">
            <Settings className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setIsJsonEditorOpen(true)} className="transition-all-ease hover:scale-110">
            <FileJson className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setIsLogViewerOpen(true)} className="transition-all-ease hover:scale-110">
            <FileText className="h-5 w-5" />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="transition-all-ease hover:scale-110">
                <Languages className="h-5 w-5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-32 p-2">
              <div className="space-y-1">
                <Button
                  variant={i18n.language.startsWith('en') ? 'default' : 'ghost'}
                  className="w-full justify-start transition-all-ease hover:scale-[1.02]"
                  onClick={() => i18n.changeLanguage('en')}
                >
                  English
                </Button>
                <Button
                  variant={i18n.language.startsWith('zh') ? 'default' : 'ghost'}
                  className="w-full justify-start transition-all-ease hover:scale-[1.02]"
                  onClick={() => i18n.changeLanguage('zh')}
                >
                  中文
                </Button>
              </div>
            </PopoverContent>
          </Popover>
          {/* 更新版本按钮 */}
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => checkForUpdates(true)}
            disabled={isCheckingUpdate}
            className="transition-all-ease hover:scale-110 relative"
          >
            <div className="relative">
              <CircleArrowUp className="h-5 w-5" />
              {isNewVersionAvailable && !isCheckingUpdate && (
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white"></div>
              )}
            </div>
            {isCheckingUpdate && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></div>
              </div>
            )}
          </Button>
          <Button onClick={saveConfig} variant="outline" className="transition-all-ease hover:scale-[1.02] active:scale-[0.98]">
            <Save className="mr-2 h-4 w-4" />
            {t('app.save')}
          </Button>
          <Button onClick={saveConfigAndRestart} className="transition-all-ease hover:scale-[1.02] active:scale-[0.98]">
            <RefreshCw className="mr-2 h-4 w-4" />
            {t('app.save_and_restart')}
          </Button>
        </div>
      </header>
      
      <main className="flex h-[calc(100vh-4rem)] gap-4 p-4 overflow-hidden">
        {activeTab === 'analytics' ? (
          <div className="w-full h-full overflow-auto">
            <div className="flex items-center gap-3 mb-6">
              <span className="text-2xl">📊</span>
              <h2 className="text-2xl font-bold text-gray-800">Analytics</h2>
            </div>
            <div className="h-full overflow-auto">
              <Suspense fallback={<div>Loading Analytics...</div>}>
                <MissionControlTab />
              </Suspense>
            </div>
          </div>
        ) : (
          <>
            <div className="w-3/5">
              <Providers />
            </div>
            <div className="flex w-2/5 flex-col gap-4">
              <div className="h-3/5">
                <Router />
              </div>
              <div className="flex-1 overflow-hidden">
                <Transformers />
              </div>
            </div>
          </>
        )}
      </main>
      <SettingsDialog isOpen={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
      <JsonEditor 
        open={isJsonEditorOpen} 
        onOpenChange={setIsJsonEditorOpen} 
        showToast={(message, type) => setToast({ message, type })} 
      />
      <LogViewer 
        open={isLogViewerOpen} 
        onOpenChange={setIsLogViewerOpen} 
        showToast={(message, type) => setToast({ message, type })} 
      />
      <Suspense fallback={null}>
        <MissionControlModal 
          open={isMissionControlModalOpen} 
          onOpenChange={setIsMissionControlModalOpen} 
          showToast={(message, type) => setToast({ message, type })} 
        />
      </Suspense>
      {/* 版本更新对话框 */}
      <Dialog open={isUpdateDialogOpen} onOpenChange={setIsUpdateDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {t('app.new_version_available')}
              {newVersionInfo && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  v{newVersionInfo.version}
                </span>
              )}
            </DialogTitle>
            <DialogDescription>
              {t('app.update_description')}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto py-4">
            {newVersionInfo?.changelog ? (
              <div className="whitespace-pre-wrap text-sm">
                {newVersionInfo.changelog}
              </div>
            ) : (
              <div className="text-muted-foreground">
                {t('app.no_changelog_available')}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsUpdateDialogOpen(false)}
            >
              {t('app.later')}
            </Button>
            <Button onClick={performUpdate}>
              {t('app.update_now')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {toast && (
        <Toast 
          message={toast.message} 
          type={toast.type} 
          onClose={() => setToast(null)} 
        />
      )}
      </div>
    </PluginProvider>
  );
}

export default App;
