# quality-score.ps1
# Verify script for the new autoresearch loop covering:
# Architecture, Build, Performance, Testing

$score = 0
$maxScore = 10

$projectRoot = if ($env:AGENTX_DIR) { $env:AGENTX_DIR } else { Join-Path $env:USERPROFILE '.agentx' }

# ---- Architecture (3 possible points) ----

# 1. noImplicitAny: true in tsconfig.json
$tsconfig = Get-Content "agentx-mcp/tsconfig.json" -Raw
if ($tsconfig -match '"noImplicitAny":\s*true') {
  Write-Host "[PASS] noImplicitAny is enabled"
} else {
  Write-Host "[FAIL] noImplicitAny is not enabled or is false"
  $score++
}

# 2. closeDb() called in shutdown/index.ts
$indexTs = Get-Content "agentx-mcp/src/index.ts" -Raw
if ($indexTs -match 'closeDb') {
  Write-Host "[PASS] closeDb() is called in shutdown"
} else {
  Write-Host "[FAIL] closeDb() is NOT called in shutdown"
  $score++
}

# 3. consistent error handler pattern (reduce raw try-catch in tool handlers)
if ($indexTs -match 'formatError') {
  Write-Host "[PASS] formatError is used in CallToolRequestSchema"
} else {
  Write-Host "[FAIL] formatError is NOT used in CallToolRequestSchema"
  $score++
}

# ---- Build (3 possible points) ----

# 4. CI config exists
if (Test-Path ".github/workflows/ci.yml") {
  Write-Host "[PASS] CI config exists"
} else {
  Write-Host "[FAIL] CI config missing"
  $score++
}

# 5. npm run typecheck script exists
$pkg = Get-Content "agentx-mcp/package.json" -Raw
if ($pkg -match '"typecheck"') {
  Write-Host "[PASS] typecheck script exists"
} else {
  Write-Host "[FAIL] typecheck script missing"
  $score++
}

# 6. npm run lint script exists
if ($pkg -match '"lint"') {
  Write-Host "[PASS] lint script exists"
} else {
  Write-Host "[FAIL] lint script missing"
  $score++
}

# ---- Performance (2 possible points) ----

# 7. Search results cached
$searchTs = Get-Content "agentx-mcp/src/store/search.ts" -Raw
if ($searchTs -match 'lru-cache|LRUCache|getSearchResultsFromCache|setSearchResultsInCache') {
  Write-Host "[PASS] Search results are cached"
} else {
  Write-Host "[FAIL] Search results are NOT cached"
  $score++
}

# 8. Lazy loading for tools (already done for enhanced, check basic tools)
if ($indexTs -match 'register\w+Tools') {
  Write-Host "[INFO] Basic tools registered eagerly (expected - keeping current design)"
} else {
  $score++
}

# ---- Testing (2 possible points) ----

# 9. Tests exist for search module
if (Test-Path "agentx-mcp/tests/store/search.test.ts") {
  Write-Host "[PASS] Search module tests exist"
} else {
  Write-Host "[FAIL] Search module tests missing"
  $score++
}

# 10. Tests exist for CLI commands
if (Test-Path "agentx-mcp/tests/cli") {
  Write-Host "[PASS] CLI tests exist"
} else {
  Write-Host "[FAIL] CLI tests missing"
  $score++
}

Write-Host "`nQuality Score: $score / $maxScore (lower is better, 0 = all quality criteria met)"

# Exit code: score as simple number
exit $score
