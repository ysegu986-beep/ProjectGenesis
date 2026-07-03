param(
  [int]$Port = 5174,
  [string]$Root = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = "Stop"

function Test-LocalPort {
  param([int]$Port)

  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $result = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
    if (-not $result.AsyncWaitHandle.WaitOne(300, $false)) {
      return $false
    }
    $client.EndConnect($result)
    return $true
  }
  catch {
    return $false
  }
  finally {
    $client.Close()
  }
}

if (Test-LocalPort -Port $Port) {
  Write-Host "Server already running: http://127.0.0.1:$Port/app/"
  exit 0
}

$serveScript = Join-Path $PSScriptRoot "serve.ps1"
$arguments = @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-File", "`"$serveScript`"",
  "-Port", $Port,
  "-Root", "`"$Root`""
)

$process = Start-Process -FilePath "powershell" -ArgumentList $arguments -WindowStyle Hidden -PassThru
Start-Sleep -Milliseconds 500

if (Test-LocalPort -Port $Port) {
  Write-Host "Server started in background: http://127.0.0.1:$Port/app/"
  Write-Host "Process id: $($process.Id)"
}
else {
  Write-Error "Server did not start. Try running tools\serve.ps1 directly."
}
