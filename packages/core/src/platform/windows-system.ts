import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

export function windowsSystemCommand(command: string): string {
  if (process.platform !== "win32" || path.isAbsolute(command)) {
    return command;
  }

  const roots = [process.env.SystemRoot, process.env.windir]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  const normalized = command.toLowerCase();
  const candidates = roots.flatMap((root) => {
    if (normalized === "powershell.exe") {
      return [
        path.join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
        path.join(root, "Sysnative", "WindowsPowerShell", "v1.0", "powershell.exe")
      ];
    }
    return [
      path.join(root, "System32", command),
      path.join(root, "Sysnative", command)
    ];
  });

  return candidates.find((candidate) => existsSync(candidate)) ?? command;
}

export function broadcastWindowsEnvironmentChanged(): void {
  if (process.platform !== "win32") {
    return;
  }

  const script = windowsEnvironmentChangedPowerShellLines().join(" ");

  spawnSync(windowsSystemCommand("powershell.exe"), [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    script
  ], {
    stdio: "ignore",
    windowsHide: true
  });
}

export function windowsEnvironmentChangedPowerShellLines(): string[] {
  return [
    "$signature = '[DllImport(\"user32.dll\", SetLastError=true, CharSet=CharSet.Auto)] public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, UIntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out UIntPtr lpdwResult);';",
    "Add-Type -MemberDefinition $signature -Namespace Win32 -Name NativeMethods;",
    "$result = [UIntPtr]::Zero;",
    "[Win32.NativeMethods]::SendMessageTimeout([IntPtr]0xffff, 0x1a, [UIntPtr]::Zero, 'Environment', 0x2, 5000, [ref]$result) | Out-Null;"
  ];
}
