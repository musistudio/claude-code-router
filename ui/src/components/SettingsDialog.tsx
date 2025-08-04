
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
import { useConfig } from "./ConfigProvider";

interface SettingsDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

export function SettingsDialog({ isOpen, onOpenChange }: SettingsDialogProps) {
  const { t } = useTranslation();
  const { config, setConfig } = useConfig();

  if (!config) {
    return null;
  }

  const handleLogChange = (checked: boolean) => {
    setConfig({ ...config, LOG: checked });
  };

  const handlePathChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfig({ ...config, CLAUDE_PATH: e.target.value });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("toplevel.title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="flex items-center space-x-2">
            <Switch id="log" checked={config.LOG} onCheckedChange={handleLogChange} />
            <Label htmlFor="log" className="transition-all-ease hover:scale-[1.02] cursor-pointer">{t("toplevel.log")}</Label>
          </div>
          <div className="space-y-2">
            <Label htmlFor="claude-path" className="transition-all-ease hover:scale-[1.01] cursor-pointer">{t("toplevel.claude_path")}</Label>
            <Input id="claude-path" value={config.CLAUDE_PATH} onChange={handlePathChange} className="transition-all-ease focus:scale-[1.01]" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="host" className="transition-all-ease hover:scale-[1.01] cursor-pointer">{t("toplevel.host")}</Label>
            <Input id="host" value={config.HOST} onChange={(e) => setConfig({ ...config, HOST: e.target.value })} className="transition-all-ease focus:scale-[1.01]" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="port" className="transition-all-ease hover:scale-[1.01] cursor-pointer">{t("toplevel.port")}</Label>
            <Input id="port" type="number" value={config.PORT} onChange={(e) => setConfig({ ...config, PORT: parseInt(e.target.value, 10) })} className="transition-all-ease focus:scale-[1.01]" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="timeout" className="transition-all-ease hover:scale-[1.01] cursor-pointer">{t("toplevel.timeout")}</Label>
            <Input id="timeout" value={config.API_TIMEOUT_MS} onChange={(e) => setConfig({ ...config, API_TIMEOUT_MS: e.target.value })} className="transition-all-ease focus:scale-[1.01]" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="proxy-url" className="transition-all-ease hover:scale-[1.01] cursor-pointer">{t("toplevel.proxy_url")}</Label>
            <Input id="proxy-url" value={config.PROXY_URL} onChange={(e) => setConfig({ ...config, PROXY_URL: e.target.value })} className="transition-all-ease focus:scale-[1.01]" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="apikey" className="transition-all-ease hover:scale-[1.01] cursor-pointer">{t("toplevel.apikey")}</Label>
            <Input id="apikey" type="password" value={config.APIKEY} onChange={(e) => setConfig({ ...config, APIKEY: e.target.value })} className="transition-all-ease focus:scale-[1.01]" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ocp-apim-subscription-key" className="transition-all-ease hover:scale-[1.01] cursor-pointer">{t("toplevel.ocp_apim_subscription_key")}</Label>
            <Input id="ocp-apim-subscription-key" type="password" value={config.OCP_APIM_SUBSCRIPTION_KEY} onChange={(e) => setConfig({ ...config, OCP_APIM_SUBSCRIPTION_KEY: e.target.value })} className="transition-all-ease focus:scale-[1.01]" />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} className="transition-all-ease hover:scale-[1.02] active:scale-[0.98]">{t("app.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
