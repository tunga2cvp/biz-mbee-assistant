param([ValidateSet('Install','Server','Demo','Build','VerifyProvider','Typecheck','Unit','Smoke','Acceptance')][string]$Action = 'Server')
$ErrorActionPreference = 'Stop'
$nodeCandidates = @(
  $env:WEBMCP_NODE_BIN,
  (Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'),
  (Get-Command node -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -First 1)
)
$pocNode = $null
foreach ($candidate in $nodeCandidates) {
  if (-not $candidate -or -not (Test-Path -LiteralPath $candidate)) { continue }
  $version = (& $candidate --version).TrimStart('v') -as [version]
  if ($version -ge [version]'22.18') { $pocNode = $candidate; break }
}
if (-not $pocNode) { throw 'Install Node >=22.18 or set WEBMCP_NODE_BIN to its node.exe.' }
if ($Action -eq 'Demo') { & $pocNode (Join-Path $PSScriptRoot 'demo\serve.mjs'); exit $LASTEXITCODE }
Push-Location (Join-Path $PSScriptRoot 'webmcp-extension')
try {
  switch ($Action) {
    Install {
      $npmCommand = Get-Command npm -ErrorAction Stop
      $npmCli = Join-Path (Split-Path $npmCommand.Source) 'node_modules\npm\bin\npm-cli.js'
      if (-not (Test-Path -LiteralPath $npmCli)) { throw 'Could not locate npm-cli.js alongside npm; install dependencies with npm under Node >=22.18.' }
      & $pocNode $npmCli ci --ignore-scripts --no-audit --no-fund
    }
    Server { & $pocNode server/server.ts }
    Build { & $pocNode scripts/build.ts }
    VerifyProvider { & $pocNode scripts/verifyProvider.ts }
    Acceptance { & $pocNode scripts/acceptanceReal.ts }
    Typecheck {
      & $pocNode node_modules/typescript/bin/tsc --noEmit
      if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
      & $pocNode node_modules/typescript/bin/tsc --noEmit -p tsconfig.node.json
    }
    Unit { & $pocNode scripts/test.ts unit }
    Smoke {
      if (-not $env:CHROME_BIN) { $env:CHROME_BIN = Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe' }
      & $pocNode scripts/test.ts smoke
    }
  }
  exit $LASTEXITCODE
} finally { Pop-Location }
