param(
  [int]$BackendPort = 3002,
  [int]$FrontendPort = 5173,
  [ValidateSet('start', 'dev')]
  [string]$BackendMode = 'start',
  [switch]$NoStopExisting
)

$ErrorActionPreference = 'Stop'

function Write-Step {
  param([string]$Message)
  Write-Host "[NeoNEI] $Message"
}

function Stop-PortListeners {
  param([int[]]$Ports)

  $listeners = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $Ports -contains $_.LocalPort } |
    Select-Object -ExpandProperty OwningProcess -Unique

  foreach ($processId in $listeners) {
    if ($processId -and $processId -ne $PID) {
      Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }
  }
}

function Wait-HttpOk {
  param(
    [string]$Url,
    [int]$TimeoutSeconds = 35
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 5
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        return $true
      }
    } catch {
      Start-Sleep -Milliseconds 700
    }
  } while ((Get-Date) -lt $deadline)

  return $false
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $repoRoot 'backend'
$frontendDir = Join-Path $repoRoot 'frontend'
$logDir = Join-Path $repoRoot '.tmp\runtime-logs'

if (!(Test-Path (Join-Path $backendDir 'package.json'))) {
  throw "Backend package.json not found: $backendDir"
}
if (!(Test-Path (Join-Path $frontendDir 'package.json'))) {
  throw "Frontend package.json not found: $frontendDir"
}

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

if (!$NoStopExisting) {
  Write-Step "Stopping existing listeners on ports $BackendPort/$FrontendPort..."
  Stop-PortListeners -Ports @($BackendPort, $FrontendPort)
  Start-Sleep -Seconds 2
}

$backendLog = Join-Path $logDir 'backend.log'
$frontendLog = Join-Path $logDir 'frontend.log'
$backendCommand = if ($BackendMode -eq 'dev') { 'npm run dev' } else { 'npm run start' }
$frontendCommand = "npm run dev -- --host 127.0.0.1 --port $FrontendPort"

Write-Step "Starting backend ($BackendMode) on http://127.0.0.1:$BackendPort ..."
Start-Process -FilePath 'cmd.exe' `
  -ArgumentList '/c', "$backendCommand > `"$backendLog`" 2>&1" `
  -WorkingDirectory $backendDir `
  -WindowStyle Hidden

Write-Step "Starting frontend on http://127.0.0.1:$FrontendPort ..."
Start-Process -FilePath 'cmd.exe' `
  -ArgumentList '/c', "$frontendCommand > `"$frontendLog`" 2>&1" `
  -WorkingDirectory $frontendDir `
  -WindowStyle Hidden

$backendOk = Wait-HttpOk -Url "http://127.0.0.1:$BackendPort/api/health"
$frontendOk = Wait-HttpOk -Url "http://127.0.0.1:$FrontendPort"

Write-Host ''
if ($backendOk -and $frontendOk) {
  Write-Host "NeoNEI started successfully."
  Write-Host "Frontend: http://127.0.0.1:$FrontendPort"
  Write-Host "Backend:  http://127.0.0.1:$BackendPort/api"
} else {
  Write-Warning "NeoNEI started with warnings."
  Write-Host "Backend health:  $backendOk"
  Write-Host "Frontend health: $frontendOk"
}

Write-Host "Logs:"
Write-Host "  $backendLog"
Write-Host "  $frontendLog"

