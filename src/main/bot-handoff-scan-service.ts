import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { BotHandoffScanTarget } from "../shared/app";

const execFileAsync = promisify(execFile);

export async function scanBotHandoffWifiTargets(): Promise<BotHandoffScanTarget[]> {
  const output = await commandStdout("arp", ["-a"]);
  if (!output.trim()) {
    throw new Error("No Wi-Fi/LAN targets found.");
  }
  return parseArpScanTargets(output);
}

export async function scanBotHandoffBluetoothTargets(): Promise<BotHandoffScanTarget[]> {
  const targets: BotHandoffScanTarget[] = [];
  if (process.platform === "darwin") {
    await collectBluetoothTargetsFromCommand(targets, "blueutil", ["--format", "json", "--connected"], "blueutil connected");
    await collectBluetoothTargetsFromCommand(targets, "blueutil", ["--format", "json", "--paired"], "blueutil paired");
    await collectBluetoothTargetsFromCommand(targets, "blueutil", ["--format", "json", "--recent"], "blueutil recent");
    await collectBluetoothTargetsFromCommand(targets, "/usr/sbin/system_profiler", ["SPBluetoothDataType", "-json"], "system_profiler bluetooth json");
    await collectBluetoothTargetsFromCommand(targets, "/usr/sbin/system_profiler", ["SPBluetoothDataType"], "system_profiler bluetooth");
    await collectBluetoothTargetsFromCommand(targets, "ioreg", ["-r", "-c", "IOBluetoothDevice", "-l"], "ioreg IOBluetoothDevice");
  } else if (process.platform === "win32") {
    await collectBluetoothTargetsFromCommand(targets, "powershell.exe", [
      "-NoProfile",
      "-Command",
      "Get-PnpDevice -Class Bluetooth | Where-Object { $_.FriendlyName } | ForEach-Object { $_.FriendlyName }"
    ], "Windows Bluetooth device");
  }
  return uniqueTargets(targets);
}

async function collectBluetoothTargetsFromCommand(
  targets: BotHandoffScanTarget[],
  command: string,
  args: string[],
  sourceDetail: string
) {
  const output = await commandStdout(command, args).catch(() => "");
  if (!output.trim()) {
    return;
  }
  for (const target of parseBluetoothScanTargets(output)) {
    pushUniqueTarget(targets, {
      ...target,
      detail: target.detail || sourceDetail
    });
  }
}

async function commandStdout(command: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync(command, args, {
    maxBuffer: 4 * 1024 * 1024,
    timeout: 12_000
  });
  return stdout;
}

function parseArpScanTargets(output: string): BotHandoffScanTarget[] {
  const targets: BotHandoffScanTarget[] = [];
  for (const line of output.split(/\r?\n/)) {
    const target = parseArpScanTarget(line);
    if (target) {
      pushUniqueTarget(targets, target);
    }
  }
  return targets;
}

function parseArpScanTarget(line: string): BotHandoffScanTarget | undefined {
  const trimmed = line.trim();
  if (!trimmed || trimmed.includes("(incomplete)")) {
    return undefined;
  }
  const windowsTarget = parseWindowsArpScanTarget(trimmed);
  if (windowsTarget) {
    return windowsTarget;
  }
  const open = trimmed.indexOf("(");
  const close = open >= 0 ? trimmed.indexOf(")", open + 1) : -1;
  if (open < 0 || close < 0) {
    return undefined;
  }
  const host = trimmed.slice(0, open).trim().replace(/\.$/, "");
  const ip = trimmed.slice(open + 1, close).trim();
  const afterAt = trimmed.split(" at ")[1]?.trim() ?? "";
  const mac = afterAt.split(/\s+/)[0]?.replace(/,$/, "") ?? "";
  const networkInterface = trimmed.split(" on ")[1]?.split(/\s+/)[0] ?? "";
  const target = ip || mac;
  if (!target) {
    return undefined;
  }
  const detailParts = [];
  if (mac && mac !== "(incomplete)") {
    detailParts.push(`MAC ${mac}`);
  }
  if (networkInterface) {
    detailParts.push(`interface ${networkInterface}`);
  }
  return {
    detail: detailParts.join(" / "),
    id: `wifi:${target}`,
    label: host && host !== "?" ? `${host} (${target})` : target,
    source: "wifi",
    target
  };
}

function parseWindowsArpScanTarget(line: string): BotHandoffScanTarget | undefined {
  const [ip, mac] = line.split(/\s+/);
  if (!looksLikeIpv4(ip) || !looksLikeMac(mac)) {
    return undefined;
  }
  return {
    detail: `MAC ${mac}`,
    id: `wifi:${ip}`,
    label: `${ip} (${mac})`,
    source: "wifi",
    target: ip
  };
}

function parseBluetoothScanTargets(output: string): BotHandoffScanTarget[] {
  const targets: BotHandoffScanTarget[] = [];
  try {
    collectBluetoothScanTargets(JSON.parse(output), targets);
  } catch {
    // Text output is parsed below.
  }
  if (targets.length === 0) {
    collectBluetoothScanTargetsFromText(output, targets);
  }
  return uniqueTargets(targets);
}

function collectBluetoothScanTargets(value: unknown, targets: BotHandoffScanTarget[]) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectBluetoothScanTargets(item, targets);
    }
    return;
  }
  if (!isRecord(value)) {
    return;
  }
  const target = bluetoothScanTargetFromObject(value);
  if (target) {
    pushUniqueTarget(targets, target);
  }
  for (const item of Object.values(value)) {
    if (typeof item === "object" && item !== null) {
      collectBluetoothScanTargets(item, targets);
    }
  }
}

function bluetoothScanTargetFromObject(record: Record<string, unknown>): BotHandoffScanTarget | undefined {
  const name = firstStringField(record, [
    "device_name",
    "device_title",
    "name",
    "_name",
    "displayName",
    "deviceName",
    "DeviceName",
    "localName",
    "Product"
  ])?.trim() ?? "";
  const address = firstStringField(record, [
    "device_address",
    "address",
    "bd_addr",
    "macAddress",
    "deviceAddress",
    "BD_ADDR",
    "BTAddress",
    "DeviceAddress"
  ])?.trim();
  const identifier = firstStringField(record, ["identifier", "id", "uuid", "UUID", "peripheralIdentifier"])?.trim();
  const hasDeviceMarker = Boolean(address || identifier || firstStringField(record, ["device_rssi", "rssi", "RSSI"])) ||
    Object.keys(record).some((key) => key.toLowerCase().includes("device"));
  if (!hasDeviceMarker || name.toLowerCase() === "bluetooth" || name.toLowerCase() === "bluetooth-incoming-port") {
    return undefined;
  }
  const target = address || identifier || name;
  if (!target) {
    return undefined;
  }
  const detailParts = [];
  if (address) {
    detailParts.push(`address ${address}`);
  }
  if (identifier && identifier !== address) {
    detailParts.push(`id ${identifier}`);
  }
  const connected = firstStringField(record, ["device_connected", "connected"]);
  if (connected) {
    detailParts.push(`connected ${connected}`);
  }
  const rssi = firstStringField(record, ["device_rssi", "rssi", "RSSI"]);
  if (rssi) {
    detailParts.push(`RSSI ${rssi}`);
  }
  return {
    detail: detailParts.join(" / "),
    id: `bluetooth:${target}`,
    label: name || bluetoothFallbackLabel(target),
    source: "bluetooth",
    target
  };
}

function collectBluetoothScanTargetsFromText(output: string, targets: BotHandoffScanTarget[]) {
  const blocks: Array<Record<string, string>> = [];
  let current: Record<string, string> = {};
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const quoted = trimmed.match(/"([^"]+)"\s*=\s*"([^"]*)"/);
    if (quoted) {
      current[quoted[1]] = quoted[2];
      continue;
    }
    const keyValue = trimmed.match(/^([^:]+):\s*(.+)$/);
    if (keyValue) {
      current[keyValue[1].trim()] = keyValue[2].trim();
      continue;
    }
    const heading = trimmed.match(/^(.+):$/);
    if (heading) {
      if (Object.keys(current).length > 0) {
        blocks.push(current);
      }
      current = { name: heading[1].trim() };
    }
  }
  if (Object.keys(current).length > 0) {
    blocks.push(current);
  }
  for (const block of blocks) {
    const target = bluetoothScanTargetFromObject(block);
    if (target) {
      pushUniqueTarget(targets, target);
    }
  }
}

function firstStringField(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if ((typeof value === "number" || typeof value === "boolean") && String(value).trim()) {
      return String(value);
    }
  }
  return undefined;
}

function bluetoothFallbackLabel(target: string): string {
  const short = target.length > 12 ? `${target.slice(0, 8)}...${target.slice(-4)}` : target;
  return `Bluetooth device ${short}`;
}

function pushUniqueTarget(targets: BotHandoffScanTarget[], target: BotHandoffScanTarget) {
  if (!targets.some((item) => item.id === target.id || (item.source === target.source && item.target === target.target))) {
    targets.push(target);
  }
}

function uniqueTargets(targets: BotHandoffScanTarget[]): BotHandoffScanTarget[] {
  const result: BotHandoffScanTarget[] = [];
  for (const target of targets) {
    pushUniqueTarget(result, target);
  }
  return result;
}

function looksLikeIpv4(value: string | undefined): value is string {
  return Boolean(value && /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value));
}

function looksLikeMac(value: string | undefined): value is string {
  return Boolean(value && /^[0-9a-f]{2}(?:[:-][0-9a-f]{2}){5}$/i.test(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
