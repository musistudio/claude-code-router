import {
  AnimatedIconSwap, AppConfig, Badge, Button, Card, CardContent, CardHeader,
  CardTitle, certificateStatusLabel, certificateStatusVariant, cn, endpointFromHostPort, Field,
  Input, LoaderCircle, motion, numberValue, ProxyCertificateStatus, proxyCertificateTrustSteps,
  ProxyStatus, RefreshCw, ServerActionBusy, ShieldCheck, StatusBadge, Toggle,
  translateProxyCertificateMessage, useAppText
} from "../shared";
export function ServerView({
  actionBusy,
  actionError,
  actionMessage,
  config,
  installProxyCertificate,
  onProxyEnabledChange,
  onProxyNetworkCaptureChange,
  onProxySystemProxyChange,
  proxyCertificateChecking,
  proxyCertificateStatus,
  proxyStatus,
  refreshProxyCertificateStatus,
  restartProxy,
  updateConfig
}: {
  actionBusy: ServerActionBusy;
  actionError: string;
  actionMessage: string;
  config: AppConfig;
  installProxyCertificate: () => void;
  onProxyEnabledChange: (checked: boolean) => void;
  onProxyNetworkCaptureChange: (enabled: boolean) => void;
  onProxySystemProxyChange: (enabled: boolean) => void;
  proxyCertificateChecking: boolean;
  proxyCertificateStatus: ProxyCertificateStatus;
  proxyStatus: ProxyStatus;
  refreshProxyCertificateStatus: () => void;
  restartProxy: () => void;
  updateConfig: (mutator: (config: AppConfig) => AppConfig) => void;
}) {
  const t = useAppText();
  const trustSteps = proxyCertificateTrustSteps(proxyCertificateStatus);
  const certificateMessage = translateProxyCertificateMessage(proxyCertificateStatus.message, t);

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="w-full"
      initial={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>{t("Server")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={t("Host")}>
              <Input
                value={config.HOST}
                onChange={(event) => updateConfig((next) => {
                  const host = event.target.value;
                  return {
                    ...next,
                    HOST: host,
                    gateway: { ...next.gateway, host },
                    routerEndpoint: endpointFromHostPort(host, next.PORT)
                  };
                })}
              />
            </Field>
            <Field label={t("Port")}>
              <Input
                type="number"
                value={String(config.PORT)}
                onChange={(event) => updateConfig((next) => {
                  const port = numberValue(event.target.value);
                  return {
                    ...next,
                    PORT: port,
                    gateway: { ...next.gateway, port },
                    routerEndpoint: endpointFromHostPort(next.HOST, port)
                  };
                })}
              />
            </Field>
            <Field className="sm:col-span-2" label={t("Proxy mode")}>
              <div className="flex h-10 items-center justify-between gap-3 rounded-md border border-input bg-background px-3">
                <span className="truncate text-[12px] font-medium text-foreground">
                  {proxyCertificateChecking ? t("Checking CA certificate...") : config.proxy.enabled ? t("Enabled") : t("Disabled")}
                </span>
                <Toggle checked={config.proxy.enabled} disabled={proxyCertificateChecking} onChange={onProxyEnabledChange} />
              </div>
            </Field>
            {config.proxy.enabled ? (
              <>
                <Field label={t("System proxy")}>
                  <div className="flex h-10 items-center justify-between gap-3 rounded-md border border-input bg-background px-3">
                    <span className="truncate text-[12px] font-medium text-foreground">
                      {config.proxy.systemProxy ? t("Enabled") : t("Disabled")}
                    </span>
                    <Toggle checked={config.proxy.systemProxy} onChange={onProxySystemProxyChange} />
                  </div>
                </Field>
                <Field label={t("Capture network")}>
                  <div className="flex h-10 items-center justify-between gap-3 rounded-md border border-input bg-background px-3">
                    <span className="truncate text-[12px] font-medium text-foreground">
                      {config.proxy.captureNetwork ? t("Enabled") : t("Disabled")}
                    </span>
                    <Toggle checked={config.proxy.captureNetwork} onChange={onProxyNetworkCaptureChange} />
                  </div>
                </Field>
              </>
            ) : null}
          </div>

          {config.proxy.enabled || !proxyCertificateStatus.trusted ? (
            <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-[12px] font-medium">{t("CA certificate")}</span>
                <Badge variant={certificateStatusVariant(proxyCertificateStatus)}>
                  {t(certificateStatusLabel(proxyCertificateStatus))}
                </Badge>
              </div>
              {!proxyCertificateStatus.trusted ? (
                <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
                  <div className="font-medium">{certificateMessage}</div>
                  <div className="grid gap-1.5">
                    {trustSteps.map((step, index) => (
                      <div className="flex gap-2" key={step}>
                        <span className="shrink-0 font-semibold">{index + 1}.</span>
                        <span className="min-w-0">{t(step)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="break-all font-mono text-[11px] text-amber-950/80">{proxyCertificateStatus.caCertFile}</div>
                </div>
              ) : null}
              {config.proxy.enabled ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-[12px] font-medium">{t("Proxy status")}</span>
                  <StatusBadge state={proxyStatus.state} />
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <Button disabled={Boolean(actionBusy) || !proxyCertificateStatus.canInstall} onClick={installProxyCertificate} size="sm" type="button" variant="outline">
                  <AnimatedIconSwap iconKey={actionBusy === "cert" ? "installing" : "cert"}>
                    {actionBusy === "cert" ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                  </AnimatedIconSwap>
                  {t("Install CA")}
                </Button>
                <Button disabled={Boolean(actionBusy) || proxyCertificateChecking} onClick={refreshProxyCertificateStatus} size="sm" type="button" variant="outline">
                  <AnimatedIconSwap iconKey={proxyCertificateChecking ? "checking" : "refresh"}>
                    {proxyCertificateChecking ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  </AnimatedIconSwap>
                  {t("Check Trust")}
                </Button>
                {config.proxy.enabled ? (
                  <Button disabled={Boolean(actionBusy)} onClick={restartProxy} size="sm" type="button" variant="outline">
                    <AnimatedIconSwap iconKey={actionBusy === "proxy" ? "restarting" : "refresh"}>
                      {actionBusy === "proxy" ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    </AnimatedIconSwap>
                    {t("Restart Proxy")}
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          {actionError || actionMessage ? (
            <div className={cn(
              "whitespace-pre-wrap rounded-lg border px-3 py-2 text-[12px]",
              actionError ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-border/60 bg-background/80 text-muted-foreground"
            )}>
              {actionError || actionMessage}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </motion.div>
  );
}
