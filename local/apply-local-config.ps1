param(
    [string]$TemplatePath = "D:\project\proxy_local\local\config.example.json"
)

$ErrorActionPreference = "Stop"

$configDir = Join-Path $env:USERPROFILE ".claude-code-router"
$configPath = Join-Path $configDir "config.json"

if (-not (Test-Path $TemplatePath)) {
    throw "Config template not found: $TemplatePath"
}

New-Item -ItemType Directory -Force -Path $configDir | Out-Null

if (Test-Path $configPath) {
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    Copy-Item -LiteralPath $configPath -Destination "$configPath.$timestamp.bak"
}

Copy-Item -LiteralPath $TemplatePath -Destination $configPath -Force
Write-Host "Wrote Claude Code Router config: $configPath" -ForegroundColor Green
Write-Host "Provider keys are read from XFYUN_API_KEY and DEEPSEEK_API_KEY at runtime." -ForegroundColor Cyan
