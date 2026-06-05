import { useState, useEffect, useCallback, useRef } from "react";
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
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ViewTabs } from "@/components/ViewTabs";
import { ProxyToggle } from "@/components/ProxyToggle";
import { Settings, Languages, Save, RefreshCw, FileJson, CircleArrowUp, FileText, FileCog } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Toast } from "@/components/ui/toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import "@/styles/animations.css";

type ViewName = "dashboard" | "providers" | "tools" | "monitoring" | "cache" | "budget";

function App() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { config, error } = useConfig();
  const [activeView, setActiveView] = useState<ViewName>("dashboard");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isJsonEditorOpen, setIsJsonEditorOpen] = useState(false);
  const [isLogViewerOpen, setIsLogViewerOpen] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [isNewVersionAvailable, setIsNewVersionAvailable] = useState(false);
  const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false);
  const [newVersionInfo, setNewVersionInfo] = useState<{ version: string; changelog: string } | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [hasCheckedUpdate, setHasCheckedUpdate] = useState(false);
  const [isUpdateFeatureAvailable, setIsUpdateFeatureAvailable] = useState(true);
  const [proxyActive, setProxyActive] = useState(false);
  const hasAutoCheckedUpdate = useRef(false);

  const saveConfig = async () => {
    if (!config) {
      setToast({ message: t('app.config_missing'), type: 'error' });
      return;
    }
    
    try {
      const response = await api.updateConfig(config);
      console.log('Config saved successfully');
      
      if (response && typeof response === 'object' && 'success' in response) {
        const apiResponse = response as { success: boolean; message?: string };
        if (apiResponse.success) {
          setToast({ message: apiResponse.message || t('app.config_saved_success'), type: 'success' });
        } else {
          setToast({ message: apiResponse.message || t('app.config_saved_failed'), type: 'error' });
        }
      } else {
        setToast({ message: t('app.config_saved_success'), type: 'success' });
      }
    } catch (error) {
      console.error('Failed to save config:', error);
      setToast({ message: t('app.config_saved_failed') + ': ' + (error as Error).message, type: 'error' });
    }
  };

  const saveConfigAndRestart = async () => {
    if (!config) {
      setToast({ message: t('app.config_missing'), type: 'error' });
      return;
    }
    
    try {
      const response = await api.updateConfig(config);
      
      let saveSuccessful = true;
      if (response && typeof response === 'object' && 'success' in response) {
        const apiResponse = response as { success: boolean; message?: string };
        if (!apiResponse.success) {
          saveSuccessful = false;
          setToast({ message: apiResponse.message || t('app.config_saved_failed'), type: 'error' });
        }
      }
      
      if (saveSuccessful) {
        const response = await api.restartService();
        console.log('Config saved and service restarted successfully');
        
        if (response && typeof response === 'object' && 'success' in response) {
          const apiResponse = response as { success: boolean; message?: string };
          if (apiResponse.success) {
            setToast({ message: apiResponse.message || t('app.config_saved_restart_success'), type: 'success' });
          }
        } else {
          setToast({ message: t('app.config_saved_restart_success'), type: 'success' });
        }
      }
    } catch (error) {
      console.error('Failed to save config and restart:', error);
      setToast({ message: t('app.config_saved_restart_failed') + ': ' + (error as Error).message, type: 'error' });
    }
  };
  
  const checkForUpdates = useCallback(async (showDialog: boolean = true) => {
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
        if (showDialog) {
          setIsUpdateDialogOpen(true);
        }
      } else if (showDialog) {
        setToast({ message: t('app.no_updates_available'), type: 'success' });
      }
      
      setHasCheckedUpdate(true);
    } catch (error) {
      console.error('Failed to check for updates:', error);
      setIsUpdateFeatureAvailable(false);
      if (showDialog) {
        setToast({ message: t('app.update_check_failed') + ': ' + (error as Error).message, type: 'error' });
      }
    } finally {
      setIsCheckingUpdate(false);
    }
  }, [hasCheckedUpdate, isNewVersionAvailable, t]);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const resp = await fetch('/api/setup/status');
        const status = await resp.json();
        if (status.needsSetup) {
          navigate('/setup');
          return;
        }
      } catch {}

      if (config) {
        setIsCheckingAuth(false);
        if (!hasCheckedUpdate && !hasAutoCheckedUpdate.current) {
          hasAutoCheckedUpdate.current = true;
          checkForUpdates(false);
        }
        return;
      }
      
      const apiKey = localStorage.getItem('apiKey');
      if (!apiKey) {
        setIsCheckingAuth(false);
        return;
      }
      
      try {
        await api.getConfig();
      } catch (err) {
        console.error('Error checking auth:', err);
        if ((err as Error).message === 'Unauthorized') {
          navigate('/login');
        }
      } finally {
        setIsCheckingAuth(false);
        if (!hasCheckedUpdate && !hasAutoCheckedUpdate.current) {
          hasAutoCheckedUpdate.current = true;
          checkForUpdates(false);
        }
      }
    };

    checkAuth();
    
    const handleUnauthorized = () => {
      navigate('/login');
    };
    
    window.addEventListener('unauthorized', handleUnauthorized);
    
    return () => {
      window.removeEventListener('unauthorized', handleUnauthorized);
    };
  }, [config, navigate, hasCheckedUpdate, checkForUpdates]);
  
  const performUpdate = async () => {
    if (!newVersionInfo) return;
    
    try {
      const result = await api.performUpdate();
      
      if (result.success) {
        setToast({ message: t('app.update_successful'), type: 'success' });
        setIsNewVersionAvailable(false);
        setIsUpdateDialogOpen(false);
        setHasCheckedUpdate(false);
      } else {
        setToast({ message: t('app.update_failed') + ': ' + result.message, type: 'error' });
      }
    } catch (error) {
      console.error('Failed to perform update:', error);
      setToast({ message: t('app.update_failed') + ': ' + (error as Error).message, type: 'error' });
    }
  };

  const handleViewChange = (view: ViewName) => {
    setActiveView(view);
    if (view === "monitoring") {
      navigate('/monitoring');
    } else if (view === "cache") {
      navigate('/cache');
    } else if (view === "budget") {
      navigate('/budget');
    } else if (view === "tools") {
      navigate('/pipeline');
    } else if (view === "providers") {
      navigate('/providers-monitor');
    }
  };
  
  if (isCheckingAuth) {
    return (
      <div className="h-screen bg-background font-sans flex items-center justify-center">
        <div className="text-muted-foreground">{t('app.loading', 'Loading application...')}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen bg-background font-sans flex items-center justify-center">
        <div className="text-destructive">Error: {error.message}</div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="h-screen bg-background font-sans flex items-center justify-center">
        <div className="text-muted-foreground">{t('app.loading_config', 'Loading configuration...')}</div>
      </div>
    );
  }

  const renderContent = () => {
    switch (activeView) {
      case "dashboard":
        return (
          <div className="flex h-full gap-4">
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
          </div>
        );
      case "providers":
        return (
          <div className="h-full">
            <iframe src="/providers-monitor" className="w-full h-full border-0" title="Providers" />
          </div>
        );
      case "tools":
        return (
          <div className="h-full">
            <iframe src="/pipeline" className="w-full h-full border-0" title="Pipeline" />
          </div>
        );
      case "monitoring":
        return (
          <div className="h-full">
            <iframe src="/monitoring" className="w-full h-full border-0" title="Monitoring" />
          </div>
        );
      case "cache":
        return (
          <div className="h-full">
            <iframe src="/cache" className="w-full h-full border-0" title="Cache" />
          </div>
        );
      case "budget":
        return (
          <div className="h-full">
            <iframe src="/budget" className="w-full h-full border-0" title="Budget" />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <TooltipProvider>
      <div className="h-screen bg-background font-sans flex flex-col">
        <header className="glass sticky top-0 z-50 flex h-14 items-center justify-between border-b px-4">
          <div className="flex items-center gap-4 min-w-0">
            <h1 className={cn(
              "text-lg font-bold tracking-tight whitespace-nowrap transition-colors",
              proxyActive ? "text-green-500" : "text-primary"
            )}>
              CCR Proxy
            </h1>
            <div className="hidden sm:block">
              <ProxyToggle active={proxyActive} onActiveChange={setProxyActive} />
            </div>
          </div>

          <div className="flex-1 flex justify-center">
            <ViewTabs activeView={activeView} onViewChange={handleViewChange} />
          </div>

          <div className="flex items-center gap-1 min-w-0">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 transition-all-ease hover:scale-110">
                  <Languages className="h-4 w-4" />
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
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => setIsSettingsOpen(true)} className="h-8 w-8 transition-all-ease hover:scale-110">
                  <Settings className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p>{t('app.settings')}</p></TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => setIsJsonEditorOpen(true)} className="h-8 w-8 transition-all-ease hover:scale-110">
                  <FileJson className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p>{t('app.json_editor')}</p></TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => setIsLogViewerOpen(true)} className="h-8 w-8 transition-all-ease hover:scale-110">
                  <FileText className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p>{t('app.log_viewer')}</p></TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => navigate('/presets')} className="h-8 w-8 transition-all-ease hover:scale-110">
                  <FileCog className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p>{t('app.presets')}</p></TooltipContent>
            </Tooltip>
            {isUpdateFeatureAvailable && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => checkForUpdates(true)}
                    disabled={isCheckingUpdate}
                    className="h-8 w-8 transition-all-ease hover:scale-110 relative"
                  >
                    <div className="relative">
                      <CircleArrowUp className="h-4 w-4" />
                      {isNewVersionAvailable && !isCheckingUpdate && (
                        <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-background"></div>
                      )}
                    </div>
                    {isCheckingUpdate && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"></div>
                      </div>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>{t('app.check_updates')}</p></TooltipContent>
              </Tooltip>
            )}
            <div className="flex items-center gap-1 ml-1">
              <Button onClick={saveConfig} variant="outline" size="sm" className="h-8 transition-all-ease hover:scale-[1.02] active:scale-[0.98]">
                <Save className="mr-1.5 h-3.5 w-3.5" />
                {t('app.save')}
              </Button>
              <Button onClick={saveConfigAndRestart} size="sm" className="h-8 transition-all-ease hover:scale-[1.02] active:scale-[0.98]">
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                {t('app.save_and_restart')}
              </Button>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 overflow-hidden">
          <div className="view-transition-enter-active h-full">
            {renderContent()}
          </div>
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
    </TooltipProvider>
  );
}

export default App;
