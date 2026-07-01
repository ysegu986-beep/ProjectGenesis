param(
  [int]$Port = 5173,
  [string]$Root = (Get-Location).Path
)

$ErrorActionPreference = "Stop"

$ip = [System.Net.IPAddress]::Parse("127.0.0.1")
$server = [System.Net.Sockets.TcpListener]::new($ip, $Port)
$server.Start()

Write-Host "Serving $Root at http://127.0.0.1:$Port/"

$mimeTypes = @{
  ".html" = "text/html; charset=utf-8"
  ".css" = "text/css; charset=utf-8"
  ".js" = "text/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".md" = "text/markdown; charset=utf-8"
  ".txt" = "text/plain; charset=utf-8"
  ".svg" = "image/svg+xml"
  ".png" = "image/png"
  ".jpg" = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".webp" = "image/webp"
}

function Send-Response {
  param(
    [System.Net.Sockets.NetworkStream]$Stream,
    [int]$StatusCode,
    [string]$StatusText,
    [string]$ContentType,
    [byte[]]$Body
  )

  $header = "HTTP/1.1 $StatusCode $StatusText`r`nContent-Type: $ContentType`r`nContent-Length: $($Body.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
  $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
  $Stream.Write($headerBytes, 0, $headerBytes.Length)
  if ($Body.Length -gt 0) {
    $Stream.Write($Body, 0, $Body.Length)
  }
}

try {
  while ($true) {
    $client = $server.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $buffer = New-Object byte[] 8192
      $read = $stream.Read($buffer, 0, $buffer.Length)
      if ($read -le 0) {
        $client.Close()
        continue
      }

      $request = [System.Text.Encoding]::ASCII.GetString($buffer, 0, $read)
      $firstLine = ($request -split "`r?`n")[0]
      $parts = $firstLine -split " "
      if ($parts.Length -lt 2 -or $parts[0] -ne "GET") {
        $body = [System.Text.Encoding]::UTF8.GetBytes("Method Not Allowed")
        Send-Response $stream 405 "Method Not Allowed" "text/plain; charset=utf-8" $body
        $client.Close()
        continue
      }

      $requestPath = [System.Uri]::UnescapeDataString(($parts[1] -split "\?")[0].TrimStart("/"))
      if ([string]::IsNullOrWhiteSpace($requestPath)) {
        $requestPath = "app/index.html"
      }

      $relativePath = $requestPath -replace "/", [System.IO.Path]::DirectorySeparatorChar
      $fullPath = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($Root, $relativePath))
      $rootFullPath = [System.IO.Path]::GetFullPath($Root)

      if (-not $fullPath.StartsWith($rootFullPath, [System.StringComparison]::OrdinalIgnoreCase)) {
        $body = [System.Text.Encoding]::UTF8.GetBytes("Forbidden")
        Send-Response $stream 403 "Forbidden" "text/plain; charset=utf-8" $body
        $client.Close()
        continue
      }

      if ([System.IO.Directory]::Exists($fullPath)) {
        $fullPath = [System.IO.Path]::Combine($fullPath, "index.html")
      }

      if (-not [System.IO.File]::Exists($fullPath)) {
        $body = [System.Text.Encoding]::UTF8.GetBytes("Not Found")
        Send-Response $stream 404 "Not Found" "text/plain; charset=utf-8" $body
        $client.Close()
        continue
      }

      $extension = [System.IO.Path]::GetExtension($fullPath).ToLowerInvariant()
      $contentType = if ($mimeTypes.ContainsKey($extension)) { $mimeTypes[$extension] } else { "application/octet-stream" }
      $bodyBytes = [System.IO.File]::ReadAllBytes($fullPath)
      Send-Response $stream 200 "OK" $contentType $bodyBytes
    }
    catch {
      try {
        $body = [System.Text.Encoding]::UTF8.GetBytes("Server Error")
        Send-Response $stream 500 "Server Error" "text/plain; charset=utf-8" $body
      }
      catch {
      }
    }
    finally {
      $client.Close()
    }
  }
}
finally {
  $server.Stop()
}
