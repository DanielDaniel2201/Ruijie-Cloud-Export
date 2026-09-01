$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$private = Join-Path $root ".private"
$tokenFile = Join-Path $private "ruijie-mcp-token.txt"
if (!(Test-Path -LiteralPath $tokenFile)) { throw "Missing $tokenFile" }

$env:PI_CODING_AGENT_DIR = Join-Path $private "pi-agent"
$env:PI_CODING_AGENT_SESSION_DIR = Join-Path $private "sessions"
$env:PI_SKIP_VERSION_CHECK = "1"
$env:PI_TELEMETRY = "0"
Set-Location $root
& pi -a @args
exit $LASTEXITCODE
