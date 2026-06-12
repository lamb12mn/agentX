$ErrorActionPreference = "SilentlyContinue"

$srcFiles = Get-ChildItem "agentx-mcp/src" -Recurse -Filter "*.ts" | Where-Object { $_.FullName -notmatch "node_modules" }

foreach ($file in $srcFiles) {
    $lines = Get-Content $file.FullName -Encoding UTF8
    $lineCount = $lines.Length
    for ($i = 0; $i -lt $lineCount; $i++) {
        $line = $lines[$i]
        $isExport = $false
        if ($line -match '^\s*export\s+(function|class|interface|type|const|async\s+function)\s+(\w+)') { $isExport = $true }
        if ($line -match '^\s*export\s+default\s+(function|class)\s+(\w+)') { $isExport = $true }
        
        if ($isExport) {
            $hasJsDoc = $false
            $lookback = [Math]::Max(0, $i - 10)
            for ($j = $i - 1; $j -ge $lookback; $j--) {
                $prev = $lines[$j]
                if ($prev -match '/\*\*') { $hasJsDoc = $true; break }
                if ($prev -match '^\s*(export|import|function|class|const|let|var)\s') { break }
            }
            if (-not $hasJsDoc) {
                $name = $Matches[2]
                Write-Host "$($file.Name):$($i+1) - export $name"
            }
        }
    }
}
