import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useConfig } from "./ConfigProvider";
import { Combobox } from "./ui/combobox";

export function Router() {
  const { t } = useTranslation();
  const { config, setConfig } = useConfig();

  // Handle case where config is null or undefined
  if (!config) {
    return (
      <Card className="flex h-full flex-col rounded-lg border shadow-sm">
        <CardHeader className="border-b p-4">
          <CardTitle className="text-lg">{t("router.title")}</CardTitle>
        </CardHeader>
        <CardContent className="flex-grow flex items-center justify-center p-4">
          <div className="text-gray-500">Loading router configuration...</div>
        </CardContent>
      </Card>
    );
  }

  // Handle case where config.Router is null or undefined
  const routerConfig = config.Router || {
    default: "",
    background: "",
    think: "",
    longContext: "",
    longContextThreshold: 60000,
    webSearch: "",
    image: ""
  };

  const handleRouterChange = (field: string, value: string | number) => {
    // Handle case where config.Router might be null or undefined
    const currentRouter = config.Router || {};
    const newRouter = { ...currentRouter, [field]: value };
    setConfig({ ...config, Router: newRouter });
  };

  const handleForceUseImageAgentChange = (value: boolean) => {
    setConfig({ ...config, forceUseImageAgent: value });
  };

  // Handle case where config.Providers might be null or undefined
  const providers = Array.isArray(config.Providers) ? config.Providers : [];
  
  const modelOptions = providers.flatMap((provider) => {
    // Handle case where individual provider might be null or undefined
    if (!provider) return [];
    
    // Handle case where provider.models might be null or undefined
    const models = Array.isArray(provider.models) ? provider.models : [];
    
    // Handle case where provider.name might be null or undefined
    const providerName = provider.name || "Unknown Provider";
    
    return models.map((model) => ({
      value: `${providerName},${model || "Unknown Model"}`,
      label: `${providerName}, ${model || "Unknown Model"}`,
    }));
  });

  return (
    <Card className="flex h-full flex-col rounded-lg border shadow-sm">
      <CardHeader className="border-b p-4">
        <CardTitle className="text-lg">{t("router.title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex-grow space-y-5 overflow-y-auto p-4">
        <div className="space-y-2">
          <Label>{t("router.default")}</Label>
          <Combobox
            options={modelOptions}
            value={routerConfig.default || ""}
            onChange={(value) => handleRouterChange("default", value)}
            placeholder={t("router.selectModel")}
            searchPlaceholder={t("router.searchModel")}
            emptyPlaceholder={t("router.noModelFound")}
          />
        </div>
        <div className="space-y-2">
          <Label>{t("router.background")}</Label>
          <Combobox
            options={modelOptions}
            value={routerConfig.background || ""}
            onChange={(value) => handleRouterChange("background", value)}
            placeholder={t("router.selectModel")}
            searchPlaceholder={t("router.searchModel")}
            emptyPlaceholder={t("router.noModelFound")}
          />
        </div>
        <div className="space-y-2">
          <Label>{t("router.think")}</Label>
          <Combobox
            options={modelOptions}
            value={routerConfig.think || ""}
            onChange={(value) => handleRouterChange("think", value)}
            placeholder={t("router.selectModel")}
            searchPlaceholder={t("router.searchModel")}
            emptyPlaceholder={t("router.noModelFound")}
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Label>{t("router.longContext")}</Label>
              <Combobox
                options={modelOptions}
                value={routerConfig.longContext || ""}
                onChange={(value) => handleRouterChange("longContext", value)}
                placeholder={t("router.selectModel")}
                searchPlaceholder={t("router.searchModel")}
                emptyPlaceholder={t("router.noModelFound")}
              />
            </div>
            <div className="w-48">
              <Label>{t("router.longContextThreshold")}</Label>
              <Input
                type="number"
                value={routerConfig.longContextThreshold || 60000}
                onChange={(e) => handleRouterChange("longContextThreshold", parseInt(e.target.value) || 60000)}
                placeholder="60000"
              />
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <Label>{t("router.webSearch")}</Label>
          <Combobox
            options={modelOptions}
            value={routerConfig.webSearch || ""}
            onChange={(value) => handleRouterChange("webSearch", value)}
            placeholder={t("router.selectModel")}
            searchPlaceholder={t("router.searchModel")}
            emptyPlaceholder={t("router.noModelFound")}
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Label>{t("router.image")} (beta)</Label>
              <Combobox
                options={modelOptions}
                value={routerConfig.image || ""}
                onChange={(value) => handleRouterChange("image", value)}
                placeholder={t("router.selectModel")}
                searchPlaceholder={t("router.searchModel")}
                emptyPlaceholder={t("router.noModelFound")}
              />
            </div>
            <div className="w-48">
              <Label htmlFor="forceUseImageAgent">{t("router.forceUseImageAgent")}</Label>
              <select
                id="forceUseImageAgent"
                value={config.forceUseImageAgent ? "true" : "false"}
                onChange={(e) => handleForceUseImageAgentChange(e.target.value === "true")}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="false">{t("common.no")}</option>
                <option value="true">{t("common.yes")}</option>
              </select>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
