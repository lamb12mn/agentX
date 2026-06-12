@echo off
echo Cleaning up unused dependencies in agentx-mcp...
cd /d D:\xiaoyue\mcps\agentX\agentx-mcp

REM 根据 dependency_cleanup_report.md 列出的可能未使用依赖
REM 注意：请先确认这些包确实未使用，可以运行 npx depcheck 验证
set DEPS_TO_REMOVE=@inquirer/prompts archiver better-sqlite3 chalk cli-table3 js-yaml lru-cache uuid

for %%d in (%DEPS_TO_REMOVE%) do (
    echo Removing %%d...
    call npm uninstall %%d
)

REM 开发依赖（谨慎）
set DEV_DEPS_TO_REMOVE=@types/better-sqlite3 @types/js-yaml @types/uuid
for %%d in (%DEV_DEPS_TO_REMOVE%) do (
    echo Removing dev dependency %%d...
    call npm uninstall -D %%d
)

echo Cleanup finished. Run 'npm test' to verify.
pause
