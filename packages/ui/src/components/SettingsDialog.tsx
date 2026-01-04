import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Combobox } from "@/components/ui/combobox";
import { useConfig } from "./ConfigProvider";
import { StatusLineConfigDialog } from "./StatusLineConfigDialog";
import { useState } from "react";
import type { StatusLineConfig } from "@/types";

interface SettingsDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

export function SettingsDialog({ isOpen, onOpenChange }: SettingsDialogProps) {
  const { t } = useTranslation();
  const { config, setConfig } = useConfig();
  const [isStatusLineConfigOpen, setIsStatusLineConfigOpen] = useState(false);

  if (!config) {
    return null;
  }

  const handleLogChange = (checked: boolean) => {
    setConfig({ ...config, LOG: checked });
  };

  const handlePathChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfig({ ...config, CLAUDE_PATH: e.target.value });
  };

  const handleStatusLineEnabledChange = (checked: boolean) => {
    // Ensure we have a complete StatusLineConfig object
    const newStatusLineConfig: StatusLineConfig = {
      enabled: checked,
      currentStyle: config.StatusLine?.currentStyle || "default",
      default: config.StatusLine?.default || { modules: [] },
      powerline: config.StatusLine?.powerline || { modules: [] },
    };

    setConfig({
      ...config,
      StatusLine: newStatusLineConfig,
    });
  };

  const openStatusLineConfig = () => {
    setIsStatusLineConfigOpen(true);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange} >
      <DialogContent data-testid="settings-dialog" className="max-h-[80vh] flex flex-col p-0">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle>{t("toplevel.title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 p-4 px-8 overflow-y-auto flex-1">
          <div className="flex items-center space-x-2">
            <Switch
              id="log"
              checked={config.LOG}
              onCheckedChange={handleLogChange}
            />
            <Label
              htmlFor="log"
              className="transition-all-ease hover:scale-[1.02] cursor-pointer"
            >
              {t("toplevel.log")}
            </Label>
          </div>
          {/* StatusLine Configuration */}
          <div className="space-y-2 border-t pt-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Switch
                  id="statusline"
                  checked={config.StatusLine?.enabled || false}
                  onCheckedChange={handleStatusLineEnabledChange}
                />
                <Label
                  htmlFor="statusline"
                  className="transition-all-ease hover:scale-[1.02] cursor-pointer"
                >
                  {t("statusline.title")}
                </Label>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={openStatusLineConfig}
                className="transition-all-ease hover:scale-[1.02] active:scale-[0.98]"
                data-testid="statusline-config-button"
              >
                {t("app.settings")}
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="log-level" className="transition-all-ease hover:scale-[1.01] cursor-pointer">{t("toplevel.log_level")}</Label>
            <Combobox
              options={[
                { label: "fatal", value: "fatal" },
                { label: "error", value: "error" },
                { label: "warn", value: "warn" },
                { label: "info", value: "info" },
                { label: "debug", value: "debug" },
                { label: "trace", value: "trace" },
              ]}
              value={config.LOG_LEVEL}
              onChange={(value) => setConfig({ ...config, LOG_LEVEL: value })}
            />
          </div>
          <div className="space-y-2">
            <Label
              htmlFor="claude-path"
              className="transition-all-ease hover:scale-[1.01] cursor-pointer"
            >
              {t("toplevel.claude_path")}
            </Label>
            <Input
              id="claude-path"
              value={config.CLAUDE_PATH}
              onChange={handlePathChange}
              className="transition-all-ease focus:scale-[1.01]"
            />
          </div>
          <div className="space-y-2">
            <Label
              htmlFor="host"
              className="transition-all-ease hover:scale-[1.01] cursor-pointer"
            >
              {t("toplevel.host")}
            </Label>
            <Input
              id="host"
              value={config.HOST}
              onChange={(e) => setConfig({ ...config, HOST: e.target.value })}
              className="transition-all-ease focus:scale-[1.01]"
            />
          </div>
          <div className="space-y-2">
            <Label
              htmlFor="port"
              className="transition-all-ease hover:scale-[1.01] cursor-pointer"
            >
              {t("toplevel.port")}
            </Label>
            <Input
              id="port"
              type="number"
              value={config.PORT}
              onChange={(e) =>
                setConfig({ ...config, PORT: parseInt(e.target.value, 10) })
              }
              className="transition-all-ease focus:scale-[1.01]"
            />
          </div>
          <div className="space-y-2">
            <Label
              htmlFor="timeout"
              className="transition-all-ease hover:scale-[1.01] cursor-pointer"
            >
              {t("toplevel.timeout")}
            </Label>
            <Input
              id="timeout"
              value={config.API_TIMEOUT_MS}
              onChange={(e) =>
                setConfig({ ...config, API_TIMEOUT_MS: e.target.value })
              }
              className="transition-all-ease focus:scale-[1.01]"
            />
          </div>
          <div className="space-y-2">
            <Label
              htmlFor="proxy-url"
              className="transition-all-ease hover:scale-[1.01] cursor-pointer"
            >
              {t("toplevel.proxy_url")}
            </Label>
            <Input
              id="proxy-url"
              value={config.PROXY_URL}
              onChange={(e) =>
                setConfig({ ...config, PROXY_URL: e.target.value })
              }
              placeholder="http://127.0.0.1:7890"
              className="transition-all-ease focus:scale-[1.01]"
            />
          </div>
          <div className="space-y-2">
            <Label
              htmlFor="apikey"
              className="transition-all-ease hover:scale-[1.01] cursor-pointer"
            >
              {t("toplevel.apikey")}
            </Label>
            <Input
              id="apikey"
              type="password"
              value={config.APIKEY}
              onChange={(e) => setConfig({ ...config, APIKEY: e.target.value })}
              className="transition-all-ease focus:scale-[1.01]"
            />
          </div>
          <div className="space-y-2">
            <Label
              htmlFor="custom-router-path"
              className="transition-all-ease hover:scale-[1.01] cursor-pointer"
            >
              {t("toplevel.custom_router_path")}
            </Label>
            <Input
              id="custom-router-path"
              value={config.CUSTOM_ROUTER_PATH || ""}
              onChange={(e) => setConfig({ ...config, CUSTOM_ROUTER_PATH: e.target.value })}
              placeholder={t("toplevel.custom_router_path_placeholder")}
              className="transition-all-ease focus:scale-[1.01]"
            />
          </div>
        </div>
        <DialogFooter className="p-4 pt-0">
          <Button
            onClick={() => onOpenChange(false)}
            className="transition-all-ease hover:scale-[1.02] active:scale-[0.98]"
          >
            {t("app.save")}
          </Button>
        </DialogFooter>
      </DialogContent>

      <StatusLineConfigDialog
        isOpen={isStatusLineConfigOpen}
        onOpenChange={setIsStatusLineConfigOpen}
        data-testid="statusline-config-dialog"
      />
    </Dialog>
  );
}
