param(
  [int]$Port = 5174
)

$ErrorActionPreference = "Stop"

$processes = Get-CimInstance Win32_Process |
  Where-Object {
    $_.Name -match "powershell" -and
    $_.CommandLine -match "serve\.ps1" -and
    $_.CommandLine -match "-Port\s+$Port"
  }

if (-not $processes) {
  Write-Host "No Project Genesis server found on port $Port."
  exit 0
}

foreach ($process in $processes) {
  Stop-Process -Id $process.ProcessId -Force
  Write-Host "Stopped server process: $($process.ProcessId)"
}
