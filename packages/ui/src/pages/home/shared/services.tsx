import { Badge } from "@/components/ui/badge";
import type {
  AppConfig,
  GatewayStatus,
  ProxyCertificateInstallResult,
  ProxyCertificateStatus,
  ProxyStatus
} from "@ccr/core/contracts/app";
import {
  useAppText
} from "./i18n";

export function endpointFromHostPort(host: string, port: number): string {
  const trimmedHost = host.trim() || "127.0.0.1";
  const endpointHost = trimmedHost === "0.0.0.0" ? "127.0.0.1" : trimmedHost;
  const formattedHost = endpointHost.includes(":") && !endpointHost.startsWith("[") ? `[${endpointHost}]` : endpointHost;
  return `http://${formattedHost}:${port}`;
}

export function proxyRestartMessage(status: ProxyStatus): string {
  if (status.state !== "running") {
    return status.lastError || "Proxy is stopped.";
  }
  if (status.systemProxy.state === "error") {
    return `Proxy restarted, but system proxy switching failed: ${status.systemProxy.lastError || "Unknown error"}`;
  }
  return "Proxy restarted.";
}

export function gatewayServiceMessage(status: GatewayStatus, stopped: boolean): string {
  if (stopped) {
    return "Service paused.";
  }
  if (status.state === "running") {
    return "Service started.";
  }
  return status.lastError || "Service did not start.";
}

export function endpointDetails(endpoint: string, config: AppConfig): { host: string; port: string } {
  try {
    const parsed = new URL(endpoint);
    return {
      host: parsed.hostname || config.gateway.host || "127.0.0.1",
      port: parsed.port || String(config.gateway.port)
    };
  } catch {
    return {
      host: config.gateway.host || "127.0.0.1",
      port: String(config.gateway.port)
    };
  }
}

export function StatusBadge({ state }: { state: GatewayStatus["state"] | ProxyStatus["state"] }) {
  const t = useAppText();
  return <Badge variant={state === "running" ? "success" : state === "error" ? "danger" : state === "starting" ? "warning" : "outline"}>{t(state)}</Badge>;
}

export function certificateStatusLabel(status: ProxyCertificateStatus): string {
  if (status.trusted) {
    return "Trusted";
  }
  if (status.state === "missing") {
    return "Not installed";
  }
  if (status.state === "unsupported") {
    return "Manual install";
  }
  if (status.state === "untrusted") {
    return "Untrusted";
  }
  return "Unknown";
}

export function certificateStatusVariant(status: ProxyCertificateStatus): "danger" | "outline" | "success" | "warning" {
  if (status.trusted) {
    return "success";
  }
  if (status.state === "unsupported" || status.state === "unknown") {
    return "outline";
  }
  if (status.state === "untrusted") {
    return "danger";
  }
  return "warning";
}

export function formatProxyCertificateInstallMessage(
  result: ProxyCertificateInstallResult,
  status: ProxyCertificateStatus | undefined,
  translate: (value: string) => string
): string {
  const resultMessage = translateProxyCertificateMessage(result.message, translate) || translate(result.message);
  if (status?.trusted) {
    return resultMessage;
  }

  const parts = [resultMessage];
  if (status?.message && status.message !== result.message) {
    parts.push(`${translate("Status")}: ${translateProxyCertificateMessage(status.message, translate)}`);
  }
  const message = parts.join("\n\n");
  if (!result.manualCommand) {
    return message;
  }

  return `${message}\n\n${translate("Manual install command")}:\n${result.manualCommand}`;
}

export function translateProxyCertificateMessage(message: string | undefined, translate: (value: string) => string): string {
  if (!message) {
    return "";
  }

  const notTrustedPrefix = "Proxy CA certificate is not trusted: ";
  if (message.startsWith(notTrustedPrefix)) {
    return `${translate("Proxy CA certificate is not trusted:")} ${message.slice(notTrustedPrefix.length)}`;
  }

  const macosAuthorizationPrefix = "macOS did not allow CCR to request administrator authorization: ";
  if (message.startsWith(macosAuthorizationPrefix)) {
    return `${translate("macOS did not allow CCR to request administrator authorization:")} ${translateMacosAuthorizationDetail(message.slice(macosAuthorizationPrefix.length), translate)}`;
  }

  return translate(message);
}

export function translateMacosAuthorizationDetail(detail: string, translate: (value: string) => string): string {
  return detail
    .replace(" Opened Terminal installer:", ` ${translate("Opened Terminal installer:")}`)
    .replace(" Could not open Terminal installer:", ` ${translate("Could not open Terminal installer:")}`);
}

export function proxyCertificateTrustSteps(status: ProxyCertificateStatus): string[] {
  if (status.trusted) {
    return [];
  }

  if (status.platform === "darwin") {
    return [
      "Click Install CA and approve the administrator prompt to install it into the System keychain.",
      "If trust is still not detected, open Keychain Access > System and find the CCR MITM Proxy certificate.",
      "Open Trust, set When using this certificate to Always Trust, then restart the browser or client.",
      "Return here and click Check Trust."
    ];
  }

  if (status.platform === "win32") {
    return [
      "Click Install CA, or open the CA file and import it manually.",
      "Place it under Current User > Trusted Root Certification Authorities > Certificates.",
      "For Firefox, Java, Python, Node, or other clients with a private CA store, import the CA there as well.",
      "Restart the browser or client.",
      "Return here and click Check Trust."
    ];
  }

  return [
    "Open the CA file and import it into your OS or browser trust store.",
    "For Firefox, Java, Python, Node, or other clients with a private CA store, import the CA there as well.",
    "Restart the browser or client.",
    "Return here and click Check Trust."
  ];
}

export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
