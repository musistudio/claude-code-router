param(
    [switch]$ApplyConfig,
    [switch]$InstallDependencies,
    [switch]$Dev,
    [switch]$SkipPostgres
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot

if ($ApplyConfig) {
    powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "apply-local-config.ps1")
}

if ($InstallDependencies) {
    pnpm install --frozen-lockfile
}

Set-Location $projectRoot

# Start Postgres if Docker is available and not skipped
if (-not $SkipPostgres) {
    $dockerAvailable = Get-Command docker -ErrorAction SilentlyContinue
    if ($dockerAvailable) {
        Write-Host "Starting Postgres+pgvector..." -ForegroundColor Cyan
        docker compose -f (Join-Path $projectRoot "docker-compose.yml") up -d 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "Waiting for Postgres to be healthy..." -ForegroundColor Cyan
            $retries = 0
            while ($retries -lt 30) {
                $healthy = docker inspect --format='{{.State.Health.Status}}' proxy-local-postgres 2>$null
                if ($healthy -eq "healthy") {
                    Write-Host "Postgres is healthy" -ForegroundColor Green
                    break
                }
                Start-Sleep -Seconds 1
                $retries++
            }
            if ($retries -eq 30) {
                Write-Host "Warning: Postgres health check timed out, continuing anyway" -ForegroundColor Yellow
            }
        }
    } else {
        Write-Host "Docker not available, skipping Postgres startup" -ForegroundColor Yellow
    }
}

if ($Dev) {
    pnpm dev:server
    exit $LASTEXITCODE
}

pnpm build:shared
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
pnpm build:core
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
pnpm build:server
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Starting gateway server..." -ForegroundColor Cyan
node .\packages\server\dist\index.js
