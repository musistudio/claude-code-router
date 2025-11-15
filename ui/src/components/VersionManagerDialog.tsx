import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Package,
  Download,
  CheckCircle,
  Clock,
  AlertCircle,
  RefreshCw,
  Trash2,
  AlertTriangle
} from 'lucide-react';
import { api } from '@/lib/api';

interface Version {
  version: string;
  isCurrent?: boolean;
  isDownloaded?: boolean;
  downloadPath?: string;
  status?: 'available' | 'downloading' | 'downloaded' | 'error';
}

interface VersionManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showToast?: (message: string, type: 'success' | 'error' | 'warning') => void;
}

export const VersionManagerDialog: React.FC<VersionManagerDialogProps> = ({
  open,
  onOpenChange,
  showToast
}) => {
  const { t } = useTranslation();
  const [downloadedVersions, setDownloadedVersions] = useState<Version[]>([]);
  const [availableVersions, setAvailableVersions] = useState<string[]>([]);
  const [currentVersion, setCurrentVersion] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [downloadingVersion, setDownloadingVersion] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [versionToDelete, setVersionToDelete] = useState<string>('');
  const [deleteError, setDeleteError] = useState<string>('');

  // 加载已下载的版本数据
  const loadDownloadedVersions = async () => {
    try {
      const response = await api.getDownloadedClaudeCodeVersions();
      setDownloadedVersions(response.versions.map(v => ({
        ...v,
        isDownloaded: true,
        status: 'downloaded' as const
      })));
      setCurrentVersion(response.currentVersion);
    } catch (error) {
      console.error('Failed to load downloaded versions:', error);
      showToast?.('获取已下载版本失败', 'error');
    }
  };


  // 获取可用的版本列表
  const fetchAvailableVersions = async () => {
    setIsLoading(true);
    try {
      const response = await api.getClaudeCodeVersions();
      setAvailableVersions(response.versions);
    } catch (error) {
      console.error('Failed to fetch available versions:', error);
      showToast?.(t('version_manager.get_versions_failed'), 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // 下载指定版本
  const downloadVersion = async (version: string) => {
    setDownloadingVersion(version);
    try {
      const response = await api.downloadClaudeCodeVersion(version);
      if (response.success) {
        // 重新加载已下载版本列表
        await loadDownloadedVersions();
        showToast?.(`版本 ${version} 下载成功`, 'success');
      } else {
        showToast?.(`下载版本 ${version} 失败`, 'error');
      }
    } catch (error) {
      console.error('Failed to download version:', error);
      showToast?.(`下载版本 ${version} 失败`, 'error');
    } finally {
      setDownloadingVersion(null);
    }
  };

  // 删除下载的版本
  const handleDeleteVersion = async (version: string) => {
    try {
      const response = await api.deleteClaudeCodeVersion(version);
      if (response.success) {
        // 重新加载已下载版本列表
        await loadDownloadedVersions();
        showToast?.(`版本 ${version} 已删除`, 'success');
        setDeleteConfirmOpen(false);
        setVersionToDelete('');
        setDeleteError('');
      } else {
        setDeleteError(t('version_manager.delete_server_error'));
        showToast?.(t('version_manager.delete_failed', { version }), 'error');
      }
    } catch (error: any) {
      console.error('Failed to remove version:', error);
      // 只使用接口返回的 error 字段内容，不显示 HTTP 层面的错误信息
      const errorMessage = error?.response?.data?.error || t('version_manager.delete_unknown_error');
      setDeleteError(errorMessage);
      showToast?.(t('version_manager.delete_failed', { version }), 'error');
    }
  };

  // 触发删除确认对话框
  const removeVersion = (version: string) => {
    setVersionToDelete(version);
    setDeleteError('');
    // 使用 setTimeout 确保 state 更新完成后再打开对话框
    setTimeout(() => {
      setDeleteConfirmOpen(true);
    }, 0);
  };

  // 确认删除
  const confirmDelete = () => {
    if (versionToDelete) {
      handleDeleteVersion(versionToDelete);
    }
  };

  // 取消删除
  const cancelDelete = () => {
    setDeleteConfirmOpen(false);
    setVersionToDelete('');
    setDeleteError('');
  };

  // 切换当前使用的版本
  const switchToVersion = async (version: string) => {
    try {
      const response = await api.switchClaudeCodeVersion(version);
      if (response.success) {
        // 重新加载已下载版本列表
        await loadDownloadedVersions();
        showToast?.(`已切换到版本 ${version}`, 'success');
      } else {
        showToast?.(`切换到版本 ${version} 失败`, 'error');
      }
    } catch (error) {
      console.error('Failed to switch version:', error);
      showToast?.(`切换到版本 ${version} 失败`, 'error');
    }
  };

  useEffect(() => {
    if (open) {
      loadDownloadedVersions();
      fetchAvailableVersions();
    }
  }, [open]);

  const getVersionIcon = (version: Version) => {
    if (version.isCurrent) {
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    }
    if (version.status === 'downloading') {
      return <Clock className="h-4 w-4 text-yellow-500 animate-pulse" />;
    }
    if (version.status === 'error') {
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    }
    return <Package className="h-4 w-4 text-blue-500" />;
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            {t('version_manager.title')}
          </DialogTitle>
          <DialogDescription>
            {t('version_manager.description')}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="installed" className="flex-1">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="installed">{t('version_manager.installed_versions')}</TabsTrigger>
            <TabsTrigger value="available">{t('version_manager.available_versions')}</TabsTrigger>
          </TabsList>

          <TabsContent value="installed" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{t('version_manager.installed_versions')}</CardTitle>
                <CardDescription>
                  {t('version_manager.current_version')}: <Badge variant="outline">{currentVersion}</Badge>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-64">
                  <div className="space-y-2">
                    {downloadedVersions.map((version) => (
                      <div
                        key={version.version}
                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
                      >
                        <div className="flex items-center gap-3">
                          {getVersionIcon(version)}
                          <div>
                            <span className="font-medium">{version.version}</span>
                            {version.isCurrent && (
                              <Badge className="ml-2" variant="default">
                                {t('version_manager.current_version')}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {!version.isCurrent && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => switchToVersion(version.version)}
                            >
                              {t('version_manager.switch_to_version')}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => removeVersion(version.version)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    {downloadedVersions.length === 0 && (
                      <div className="text-center py-8 text-gray-500">
                        <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>{t('version_manager.no_downloaded_versions')}</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="available" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{t('version_manager.available_versions')}</CardTitle>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={fetchAvailableVersions}
                    disabled={isLoading}
                  >
                    <RefreshCw className={`h-4 w-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
                    {t('version_manager.refresh')}
                  </Button>
                </div>
                <CardDescription>
                  {t('version_manager.download_description')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-64">
                  <div className="grid gap-2">
                    {availableVersions.map((version) => {
                      const isDownloaded = downloadedVersions.some(v => v.version === version);
                      const isDownloading = downloadingVersion === version;

                      return (
                        <div
                          key={version}
                          className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
                        >
                          <div className="flex items-center gap-3">
                            <Package className="h-4 w-4 text-blue-500" />
                            <span className="font-medium">{version}</span>
                            {isDownloaded && (
                              <Badge variant="secondary">{t('version_manager.downloaded')}</Badge>
                            )}
                          </div>
                          <Button
                            size="sm"
                            onClick={() => downloadVersion(version)}
                            disabled={isDownloaded || isDownloading}
                          >
                            {isDownloading ? (
                              <>
                                <Clock className="h-4 w-4 mr-1 animate-pulse" />
                                {t('version_manager.downloading')}
                              </>
                            ) : isDownloaded ? (
                              <>
                                <CheckCircle className="h-4 w-4 mr-1" />
                                {t('version_manager.downloaded')}
                              </>
                            ) : (
                              <>
                                <Download className="h-4 w-4 mr-1" />
                                {t('version_manager.download')}
                              </>
                            )}
                          </Button>
                        </div>
                      );
                    })}
                    {availableVersions.length === 0 && !isLoading && (
                      <div className="text-center py-8 text-gray-500">
                        <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>{t('version_manager.no_available_versions')}</p>
                      </div>
                    )}
                    {isLoading && (
                      <div className="text-center py-8 text-gray-500">
                        <RefreshCw className="h-12 w-12 mx-auto mb-2 animate-spin" />
                        <p>{t('version_manager.loading_versions')}</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('version_manager.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

      {/* 删除确认对话框 */}
      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              {t('version_manager.confirm_delete_title')}
            </DialogTitle>
            <DialogDescription>
              {(() => {
                if (!versionToDelete) {
                  return t('version_manager.confirm_delete_message', { version: '未知版本' });
                }
                // 直接使用字符串插值作为后备方案，以防i18next插值失败
                const message = t('version_manager.confirm_delete_message', { version: versionToDelete });
                if (message.includes('{version}')) {
                  // i18next插值失败，手动替换
                  return message.replace('{version}', versionToDelete);
                }
                return message;
              })()}
              {deleteError && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-sm text-red-600">{deleteError}</p>
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={cancelDelete}>
              {t('version_manager.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              className="text-white bg-red-600 hover:bg-red-700"
            >
              {t('version_manager.confirm_delete_button')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};