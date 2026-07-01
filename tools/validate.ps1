param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$cardsPath = Join-Path $Root "data/cards-v0.json"
$decksPath = Join-Path $Root "data/decks-v0.json"
$appPaths = @(
  (Join-Path $Root "app/app.js"),
  (Join-Path $Root "app/print.js")
)

$cardsData = Get-Content -Raw -Encoding UTF8 $cardsPath | ConvertFrom-Json
$decksData = Get-Content -Raw -Encoding UTF8 $decksPath | ConvertFrom-Json

$ids = @{}
$duplicateIds = New-Object System.Collections.Generic.List[string]
foreach ($card in $cardsData.cards) {
  if ($ids.ContainsKey($card.id)) {
    $duplicateIds.Add($card.id)
  }
  else {
    $ids[$card.id] = $true
  }
}

if ($duplicateIds.Count -gt 0) {
  throw "Duplicate card IDs: $($duplicateIds -join ', ')"
}

foreach ($deck in $decksData.decks) {
  $count = 0
  $missing = New-Object System.Collections.Generic.List[string]

  foreach ($entry in $deck.cards) {
    $count += [int]$entry.count
    if (-not $ids.ContainsKey($entry.id)) {
      $missing.Add($entry.id)
    }
  }

  if ($missing.Count -gt 0) {
    throw "$($deck.name) has missing card IDs: $($missing -join ', ')"
  }

  if ($count -ne 40) {
    throw "$($deck.name) has $count cards. Expected 40."
  }

  Write-Host "$($deck.name): 40 cards, all IDs valid"
}

$nodeCandidates = @(
  "C:\Users\user\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe",
  "node"
)

$node = $null
foreach ($candidate in $nodeCandidates) {
  try {
    $resolved = Get-Command $candidate -ErrorAction Stop
    $node = $resolved.Source
    break
  }
  catch {
  }
}

if ($node) {
  foreach ($appPath in $appPaths) {
    & $node --check $appPath
    if ($LASTEXITCODE -ne 0) {
      throw "$appPath syntax check failed."
    }
    $relativeAppPath = $appPath.Substring($Root.TrimEnd("\").Length + 1)
    Write-Host "${relativeAppPath}: syntax OK"
  }
}
else {
  Write-Host "Node.js not found. Skipped app syntax checks."
}

Write-Host "Validation complete."
