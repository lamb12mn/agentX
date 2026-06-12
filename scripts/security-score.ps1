# security-score.ps1 — count remaining security vulnerabilities (0-5)
param([string]$BaseDir = ".")
$ErrorActionPreference = "SilentlyContinue"
$score = 0

# I1: Auth not enabled in start()
$authCalls = (Select-String -Path "$BaseDir/agentx-mcp/src/api/rest-api.ts" -Pattern "addAuthMiddleware\(").Count
if ($authCalls -le 1) { $score++ }

# I3: Path traversal risk - check for protection (resolve + startsWith)
$assetsContent = Get-Content "$BaseDir/agentx-mcp/src/store/assets.ts" -Raw
if ($assetsContent -notmatch "resolvedPath\.startsWith\(resolvedBase\)") { $score++ }

# I4: FTS5 injection - check for sanitization function
if (-not (Select-String -Path "$BaseDir/agentx-mcp/src/store/search.ts" -Pattern "function sanitizeFts5Query" -Quiet)) { $score++ }

# I5: Audit logging not integrated
$auditCallCount = (Select-String -Path "$BaseDir/agentx-mcp/src/store/assets.ts" -Pattern "logAudit\(").Count
if ($auditCallCount -le 1) { $score++ }

# I7: Error path leak - file ops should have sanitized error messages
$assetsContent = Get-Content "$BaseDir/agentx-mcp/src/store/assets.ts" -Raw
# Check for insufficient error handling (readFile/writeFile wrapped with path-safe messages)
if ($assetsContent -notmatch "Failed to write asset file" -or $assetsContent -notmatch "Failed to read asset content") { $score++ }

Write-Host $score
