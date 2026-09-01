$tokenFile = Join-Path (Split-Path $PSScriptRoot -Parent) ".private\ruijie-mcp-token.txt"
if (!(Test-Path -LiteralPath $tokenFile)) { throw "Missing private Ruijie MCP token." }
(Get-Content -LiteralPath $tokenFile -Raw).Trim()
