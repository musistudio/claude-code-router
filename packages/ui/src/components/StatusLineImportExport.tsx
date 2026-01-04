import { useTranslation } from "react-i18next";
import React, { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { validateStatusLineConfig, backupConfig, restoreConfig, createDefaultStatusLineConfig } from "@/utils/statusline";
import type { StatusLineConfig } from "@/types";

interface StatusLineImportExportProps {
  config: StatusLineConfig;
  onImport: (config: StatusLineConfig) => void;
  onShowToast: (message: string, type: 'success' | 'error' | 'warning') => void;
}

export function StatusLineImportExport({ config, onImport, onShowToast }: StatusLineImportExportProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);

  // 导出配置为JSON文件
  const handleExport = () => {
    try {
      // 在导出前验证配置
      const validationResult = validateStatusLineConfig(config);
      
      if (!validationResult.isValid) {
        onShowToast(t("statusline.export_validation_failed"), 'error');
        return;
      }
      
      const dataStr = JSON.stringify(config, null, 2);
      const dataUri = `data:application/json;charset=utf-8,${encodeURIComponent(dataStr)}`;
      
      const exportFileDefaultName = `statusline-config-${new Date().toISOString().slice(0, 10)}.json`;
      
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();
      
      onShowToast(t("statusline.export_success"), 'success');
    } catch (error) {
      console.error("Export failed:", error);
      onShowToast(t("statusline.export_failed"), 'error');
    }
  };

  // 导入配置从JSON文件
  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const importedConfig = JSON.parse(content) as StatusLineConfig;
        
        // 验证导入的配置
        const validationResult = validateStatusLineConfig(importedConfig);
        
        if (!validationResult.isValid) {
          // 格式化错误信息
          const errorMessages = validationResult.errors.map(error => 
            error.message
          ).join('; ');
          throw new Error(`${t("statusline.invalid_config")}: ${errorMessages}`);
        }
        
        onImport(importedConfig);
        onShowToast(t("statusline.import_success"), 'success');
      } catch (error) {
        console.error("Import failed:", error);
        onShowToast(t("statusline.import_failed") + (error instanceof Error ? `: ${error.message}` : ""), 'error');
      } finally {
        setIsImporting(false);
        // 重置文件输入，以便可以再次选择同一个文件
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    };
    
    reader.onerror = () => {
      onShowToast(t("statusline.import_failed"), 'error');
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    };
    
    reader.readAsText(file);
  };

  // 下载配置模板
  const handleDownloadTemplate = () => {
    try {
      // 使用新的默认配置函数
      const templateConfig = createDefaultStatusLineConfig();
      
      const dataStr = JSON.stringify(templateConfig, null, 2);
      const dataUri = `data:application/json;charset=utf-8,${encodeURIComponent(dataStr)}`;
      
      const templateFileName = "statusline-config-template.json";
      
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', templateFileName);
      linkElement.click();
      
      onShowToast(t("statusline.template_download_success"), 'success');
    } catch (error) {
      console.error("Template download failed:", error);
      onShowToast(t("statusline.template_download_failed"), 'error');
    }
  };

  // 配置备份功能
  const handleBackup = () => {
    try {
      const backupStr = backupConfig(config);
      const dataUri = `data:application/json;charset=utf-8,${encodeURIComponent(backupStr)}`;
      
      const backupFileName = `statusline-backup-${new Date().toISOString().slice(0, 10)}.json`;
      
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', backupFileName);
      linkElement.click();
      
      onShowToast(t("statusline.backup_success"), 'success');
    } catch (error) {
      console.error("Backup failed:", error);
      onShowToast(t("statusline.backup_failed"), 'error');
    }
  };

  // 配置恢复功能
  const handleRestore = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const restoredConfig = restoreConfig(content);
        
        if (!restoredConfig) {
          throw new Error(t("statusline.invalid_backup_file"));
        }
        
        // 验证恢复的配置
        const validationResult = validateStatusLineConfig(restoredConfig);
        
        if (!validationResult.isValid) {
          // 格式化错误信息
          const errorMessages = validationResult.errors.map(error => 
            error.message
          ).join('; ');
          throw new Error(`${t("statusline.invalid_config")}: ${errorMessages}`);
        }
        
        onImport(restoredConfig);
        onShowToast(t("statusline.restore_success"), 'success');
      } catch (error) {
        console.error("Restore failed:", error);
        onShowToast(t("statusline.restore_failed") + (error instanceof Error ? `: ${error.message}` : ""), 'error');
      } finally {
        // 重置文件输入
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    };
    
    reader.onerror = () => {
      onShowToast(t("statusline.restore_failed"), 'error');
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    };
    
    reader.readAsText(file);
  };

  // 移除本地验证函数，因为我们现在使用utils中的验证函数

  return (
    <Card className="transition-all hover:shadow-md">
      <CardHeader className="p-4">
        <CardTitle className="text-lg flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          {t("statusline.import_export")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 px-4 pb-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Button 
              onClick={handleExport} 
              variant="outline" 
              className="transition-all hover:scale-105"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              {t("statusline.export")}
            </Button>
            
            <Button 
              onClick={() => fileInputRef.current?.click()} 
              variant="outline" 
              disabled={isImporting}
              className="transition-all hover:scale-105"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              {t("statusline.import")}
            </Button>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <Button 
              onClick={handleBackup} 
              variant="outline" 
              className="transition-all hover:scale-105"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
              {t("statusline.backup")}
            </Button>
            
            <Button 
              onClick={() => {
                // 创建一个隐藏的文件输入用于恢复
                const restoreInput = document.createElement('input');
                restoreInput.type = 'file';
                restoreInput.accept = '.json';
                restoreInput.onchange = (e) => handleRestore(e as any);
                restoreInput.click();
              }} 
              variant="outline" 
              className="transition-all hover:scale-105"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                <path d="M3 15v4c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2v-4M17 9l-5 5-5-5M12 12.8V2.5"/>
              </svg>
              {t("statusline.restore")}
            </Button>
          </div>
          
          <Button 
            onClick={handleDownloadTemplate} 
            variant="outline" 
            className="transition-all hover:scale-105 sm:col-span-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
              <polyline points="10 9 9 9 8 9"/>
            </svg>
            {t("statusline.download_template")}
          </Button>
        </div>
        
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleImport}
          accept=".json"
          className="hidden"
        />
        
        <div className="p-3 bg-secondary/50 rounded-md">
          <div className="flex items-start gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground mt-0.5 flex-shrink-0">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="16" x2="12" y2="12"/>
              <line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
            <div>
              <p className="text-xs text-muted-foreground">
                {t("statusline.import_export_help")}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
