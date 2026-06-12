# docs-score.ps1 - Documentation completeness score
# lower is better: counts undocumented public APIs + missing doc files

$ErrorActionPreference = "SilentlyContinue"
$score = 0

# Part 1: Count public exports without JSDoc
$srcFiles = Get-ChildItem "agentx-mcp/src" -Recurse -Filter "*.ts" | Where-Object { $_.FullName -notmatch "node_modules" }

foreach ($file in $srcFiles) {
    $lines = Get-Content $file.FullName
    $lineCount = $lines.Length
    for ($i = 0; $i -lt $lineCount; $i++) {
        $line = $lines[$i]
        # Check for public export
        $isExport = $false
        if ($line -match '^\s*export\s+(function|class|interface|type|const|async\s+function)\s+(\w+)') { $isExport = $true }
        if ($line -match '^\s*export\s+default\s+(function|class)\s+(\w+)') { $isExport = $true }
        
        if ($isExport) {
            # Look backwards up to 10 lines for JSDoc
            $hasJsDoc = $false
            $lookback = [Math]::Max(0, $i - 10)
            for ($j = $i - 1; $j -ge $lookback; $j--) {
                $prev = $lines[$j]
                if ($prev -match '/\*\*') { $hasJsDoc = $true; break }
                # Stop if we hit another declaration/statement
                if ($prev -match '^\s*(export|import|function|class|const|let|var)\s') { break }
            }
            if (-not $hasJsDoc) { $score++ }
        }
    }
}

# Part 2: Check core doc files exist
$docFiles = @(
    "docs/API_REFERENCE.md",
    "docs/master_plan.md",
    "README.md",
    "CHANGELOG.md"
)
foreach ($doc in $docFiles) {
    if (-not (Test-Path $doc)) { $score += 5 }
}

Write-Host $score
exit 0
