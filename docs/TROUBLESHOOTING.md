# AgentX 故障排除指南

> 常见问题诊断和解决方案。如果问题未涵盖，请提交 [Issue](https://github.com/agentx/agentx-mcp/issues)。

---

## 🚨 紧急问题

### 数据丢失或损坏

**症状**：资产突然消失、数据库损坏、无法启动。

**立即行动**：
1. **停止所有写入操作**（关闭 Claude Code、CLI）
2. **备份当前目录**：
   ```bash
   cp -r ~/.agentx ~/.agentx.backup.$(date +%Y%m%d-%H%M%S)
   ```
3. **尝试恢复**：
   - 从备份恢复 `db.sqlite`
   - 从备份恢复资产文件
4. **报告问题**：提交 Issue 并附上错误日志（不包含敏感数据）

---

## 📋 常见问题分类

- [安装问题](#安装问题)
- [CLI 问题](#cli-问题)
- [MCP 集成问题](#mcp-集成问题)
- [数据库问题](#数据库问题)
- [资产问题](#资产问题)
- [导出问题](#导出问题)
- [性能问题](#性能问题)

---

## 安装问题

### 问题 1：`command not found: agentx`（Mac/Linux）或 `'agentx' 不是内部或外部命令`（Windows）

**现象**：
```bash
$ agentx --version
zsh: command not found: agentx
```

**原因**：
npm 全局安装目录未加入系统 PATH。

**诊断**：
```bash
# 查看 npm 全局安装位置
npm config get prefix

# 查看 PATH 是否包含该目录
echo $PATH  # macOS/Linux
echo $env:Path  # Windows PowerShell
```

**解决方案**：

**macOS/Linux**：
```bash
# 1. 获取 npm 全局路径
npm config get prefix
# 输出：/usr/local 或 /home/username/.npm-global

# 2. 添加到 PATH（bash 用户）
echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

# zsh 用户
echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc

# 3. 验证
which agentx
agentx --version
```

**Windows**：
```powershell
# 1. 查找 npm 安装路径
npm config get prefix
# 输出：C:\Users\YourName\AppData\Roaming\npm

# 2. 添加到 PATH（系统环境变量）
# 方法一：PowerShell（临时）
$env:Path += ";C:\Users\YourName\AppData\Roaming\npm"

# 方法二：系统设置（永久）
# 右键"此电脑" → 属性 → 高级系统设置 → 环境变量
# 编辑"Path"变量，添加：C:\Users\YourName\AppData\Roaming\npm

# 3. 重启 PowerShell 或 CMD
# 4. 验证
agentx --version
```

**验证修复**：
```bash
# 检查 agentx 可执行文件位置
which agentx  # macOS/Linux
where.exe agentx  # Windows

# 应输出类似：
# /usr/local/bin/agentx
# 或 C:\Users\YourName\AppData\Roaming\npm\agentx
```

---

### 问题 2：npm 安装失败（权限错误）

**现象**：
```bash
npm install -g agentx-mcp
npm ERR! code EACCES
npm ERR! permission denied
```

**原因**：全局安装目录权限不足。

**解决方案**：

**方案 A：使用 npm 目录修复（推荐）**
```bash
# 1. 创建专用 npm 目录
mkdir ~/.npm-global

# 2. 配置 npm 使用该目录
npm config set prefix '~/.npm-global'

# 3. 添加到 PATH（见上方问题 1）

# 4. 重新安装
npm install -g agentx-mcp
```

**方案 B：使用 sudo（macOS/Linux，谨慎）**
```bash
sudo npm install -g agentx-mcp
# 注意：可能引起文件权限问题，不推荐
```

**方案 C：使用 nvm（Node 版本管理器）**
```bash
# 安装 nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# 安装 Node.js
nvm install 18

# 无需 sudo 即可全局安装
npm install -g agentx-mcp
```

---

### 问题 3：Node.js 版本不兼容

**现象**：
```bash
$ agentx --version
Error: The engine 'node' is incompatible with this module...
```

**原因**：当前 Node.js 版本 < 18。

**解决方案**：
```bash
# 查看当前版本
node --version

# 升级到 Node.js 18+（推荐使用 nvm）
nvm install 18
nvm use 18

# 或从官网下载：https://nodejs.org
```

---

## CLI 问题

### 问题 4：`agentx list` 显示空列表

**现象**：
```bash
$ agentx list
ID  Name  Tags  Updated
```

**原因 1**：尚未创建任何资产。

**诊断**：
```bash
agentx info
# 应显示：skills: 0, prompts: 0, ...
```

**解决方案**：
```bash
# 通过 Claude Code 创建第一个资产
# 在 Claude Code 中发送："请帮我创建一个技能"
# 按提示输入信息

# 再次查看
agentx list
```

---

**原因 2**：`AGENTX_DIR` 指向错误目录。

**诊断**：
```bash
# 查看当前 AGENTX_DIR
echo $AGENTX_DIR  # macOS/Linux
echo $env:AGENTX_DIR  # Windows

# 查看实际数据库位置
agentx info
# 输出：db: /path/to/db.sqlite
```

**解决方案**：
```bash
# 方式一：取消环境变量（使用默认）
unset AGENTX_DIR  # macOS/Linux
Remove-Item Env:\AGENTX_DIR  # Windows

# 方式二：指向正确目录
export AGENTX_DIR="/correct/path"
```

---

### 问题 5：MCP 创建资产时编辑器无法打开

**现象**：在 Claude Code 中调用 `create_skill`、`create_prompt` 等工具后，没有打开编辑器，或打开错误编辑器。

**原因**：`EDITOR` 环境变量未设置或指向无效程序。MCP 服务器创建资产时会调用系统编辑器。

**诊断**：
```bash
# 查看当前编辑器设置
echo $EDITOR  # macOS/Linux
echo $env:EDITOR  # Windows
```

**解决方案**：

**macOS**：
```bash
# 使用 VS Code
export EDITOR="code --wait"
echo 'export EDITOR="code --wait"' >> ~/.zshrc

# 使用 Nano
export EDITOR="nano"
echo 'export EDITOR="nano"' >> ~/.zshrc

# 使用 Vim
export EDITOR="vim"
```

**Linux**：
```bash
export EDITOR="nano"  # 或 vim, code, etc.
echo 'export EDITOR="nano"' >> ~/.bashrc
```

**Windows PowerShell**：
```powershell
# 使用 VS Code
$env:EDITOR = "code --wait"

# 永久设置
[System.Environment]::SetEnvironmentVariable("EDITOR", "code --wait", "User")

# 使用记事本（不推荐，无等待模式）
$env:EDITOR = "notepad"
```

**注意**：编辑器必须支持**阻塞模式**（等待用户保存退出），`--wait` 参数是关键。

**验证**：
```bash
# 测试编辑器
$EDITOR test.md
# 应打开编辑器，保存退出后返回命令行
```

---

### 问题 6：`agentx export` 生成空文件或错误

**现象**：
```bash
$ agentx export <id> -o .
Error: Export failed: Cannot read property 'content' of undefined
```

**原因 1**：智能体配置中的 `role_prompt`、`rules`、`skills` 引用了不存在的资产。

**诊断**：
```bash
# 查看智能体详情
agentx get <id> --content

# 检查引用的资产是否存在
agentx list skill
agentx list rule
agentx list prompt
```

**解决方案**：
1. 确保引用的资产已创建
2. 使用绝对路径或相对路径（相对于 `~/.agentx/`）
3. 更新智能体配置：
   ```bash
   # 直接编辑 agent.yaml 文件
   code ~/.agentx/agents/<id>/agent.yaml
   ```

**原因 2**：`output_dir` 不存在或无写入权限。

**解决方案**：
```bash
# 创建输出目录
mkdir -p /path/to/output

# 检查权限
ls -ld /path/to/output

# Windows
mkdir C:\output
icacls C:\output
```

---

### 问题 7：`agentx import` 导入失败

**现象**：
```bash
$ agentx import --type skill
Error: Source directory not found: /Users/alice/.claude/skills
```

**原因**：Claude Code 的资产目录不存在（未使用过 Claude Code）。

**解决方案**：
```bash
# 方式一：创建目录并手动放入文件
mkdir -p ~/.claude/skills
# 将 .md 文件复制到该目录

# 方式二：指定源目录
agentx import --type skill --source /path/to/my/skills

# 方式三：从现有资产目录导入
agentx import --type rule --source ~/.agentx/rules
```

---

## MCP 集成问题

### 问题 8：Claude Code 未显示 AgentX 工具

**现象**：Claude Code 中无法调用 `list_skills` 等工具。

**原因 1**：配置文件格式错误。

**诊断**：
```bash
# 验证 JSON 格式
cat ~/.claude.json | python3 -m json.tool

# Windows PowerShell
Get-Content $env:USERPROFILE\.claude.json | ConvertFrom-Json
```

**常见错误**：
```json
{
  "mcpServers": {  // ✅ 正确
    "agentx": {
      "command": "agentx-mcp"
    }
  }
}

// ❌ 错误：缺少大括号
{
  "mcpServers": [
    "agentx": { ... }  // 应为对象，而非数组
  ]
}
```

**解决方案**：
1. 修正 JSON 格式
2. 保存文件
3. **完全退出并重启** Claude Code（重要！）

---

**原因 2**：`agentx-mcp` 命令未找到。

**诊断**：
```bash
# 验证命令存在
which agentx-mcp  # macOS/Linux
where.exe agentx-mcp  # Windows

# 如果未找到，重新安装
npm install -g agentx-mcp
```

**解决方案**：
```bash
# 使用绝对路径配置（临时方案）
{
  "mcpServers": {
    "agentx": {
      "command": "node",
      "args": ["/full/path/to/agentx-mcp/dist/index.js"]
    }
  }
}
```

---

**原因 3**：AgentX 启动失败。

**诊断**：
```bash
# 手动运行 MCP 服务器查看错误
agentx-mcp

# 或使用 Node 直接运行
node /path/to/agentx-mcp/dist/index.js

# 预期输出：无输出（等待 stdin/stdout 通信）
# 错误输出：堆栈跟踪
```

**常见错误**：
```
Error: SQLITE_CANTOPEN: unable to open database file
```
→ 见问题 10

```
Error: Cannot find module 'better-sqlite3'
```
→ 重新安装依赖：`npm install -g agentx-mcp`

---

### 问题 9：工具调用返回错误

**现象**：Claude Code 调用工具时返回：
```
Error: Asset not found: xxx
```

**原因 1**：资产 ID 错误或资产已删除。

**解决方案**：
```bash
# 列出所有资产查找正确 ID
agentx list skill
agentx list agent

# 使用完整 ID（不是前 8 位）
# ❌ 错误：a1b2c3d4
# ✅ 正确：a1b2c3d4-xxxx-xxxx-xxxx-xxxxxxxxxx
```

**原因 2**：资产类型不匹配。

```bash
# 尝试用 get_skill 获取 prompt ID → 失败
# 确保使用正确的工具
```

---

### 问题 10：数据库无法打开

**现象**：
```
Error: SQLITE_CANTOPEN: unable to open database file
```

**原因 1**：`~/.agentx/` 目录不存在。

**诊断**：
```bash
ls -la ~/.agentx  # macOS/Linux
Test-Path $env:USERPROFILE\.agentx  # Windows
```

**解决方案**：
```bash
# 创建目录
mkdir -p ~/.agentx

# 设置权限
chmod 700 ~/.agentx
```

---

**原因 2**：目录权限不足。

**解决方案**：
```bash
# 修改所有者（macOS/Linux）
sudo chown -R $USER ~/.agentx

# 修改权限
chmod -R 700 ~/.agentx
```

**Windows**：
```powershell
# 获取所有权
takeown /F "$env:USERPROFILE\.agentx" /R /D Y

# 授予完全控制
icacls "$env:USERPROFILE\.agentx" /grant:r "$env:USERNAME:(F)" /T
```

---

**原因 3**：磁盘空间不足。

**诊断**：
```bash
# 查看磁盘使用
df -h ~  # macOS/Linux
Get-PSDrive C  # Windows

# 查看 AgentX 目录大小
du -sh ~/.agentx
```

**解决方案**：
1. 清理无用资产
2. 删除旧备份
3. 扩展磁盘空间

---

### 问题 11：全文搜索无结果

**现象**：`agentx search "关键词"` 返回空，但资产确实包含该词。

**原因 1**：FTS5 索引未同步。

**诊断**：
```bash
# 查看 FTS 表内容
sqlite3 ~/.agentx/db.sqlite "SELECT * FROM assets_fts LIMIT 5;"
```

**解决方案**：
```bash
# 重建索引（临时方案）
# 1. 备份数据库
cp ~/.agentx/db.sqlite ~/backup.db

# 2. 删除并重启 AgentX（会自动重建）
rm ~/.agentx/db.sqlite
agentx list  # 触发重建
```

**原因 2**：搜索语法错误。

**正确用法**：
```bash
# 简单关键词
agentx search "代码审查"

# 多个词（AND）
agentx search "代码 AND 审查"

# 短语搜索
agentx search '"代码审查"'

# 前缀匹配
agentx search "review*"
```

---

## 资产问题

### 问题 12：资产文件丢失但数据库仍显示

**现象**：`agentx list` 显示资产，但文件不存在。

**原因**：手动删除文件未清理数据库。

**诊断**：
```bash
# 查看资产文件路径
sqlite3 ~/.agentx/db.sqlite "SELECT id, name, file_path FROM assets WHERE id='xxx';"

# 检查文件是否存在
ls -la /path/to/file.md
```

**解决方案**：
```bash
# 方式一：清理无效记录
sqlite3 ~/.agentx/db.sqlite "DELETE FROM assets WHERE id='xxx';"

# 方式二：重建数据库（会丢失所有元数据，但文件保留）
# 1. 导出所有资产为 ZIP
# 2. 删除 db.sqlite
# 3. 重新导入
```

---

### 问题 13：资产名称重复

**现象**：创建资产时名称冲突。

**错误信息**：
```
Error: UNIQUE constraint failed: assets.name
```

**原因**：`name` 字段在相同 `type` 下必须唯一。

**解决方案**：

在 Claude Code 中创建时使用不同名称：
```
用户：请帮我创建一个名为 "code-review-v2" 的技能...
```

或使用 CLI 删除旧资产后重试：
```bash
agentx delete <old-id>
```

---

### 问题 14：YAML 解析错误

**现象**：
```bash
$ agentx get agent <id>
Error: Failed to parse agent config for id: xxx
```

**原因**：`agent.yaml` 格式错误。

**诊断**：
```bash
# 直接查看文件
cat ~/.agentx/agents/<id>/agent.yaml

# 使用 YAML 验证工具
# 在线：https://www.yamllint.com
# 本地：yq eval . agent.yaml
```

**常见错误**：
```yaml
# ❌ 错误：缩进不一致（混合空格和 Tab）
name: test
  skills:  # 应为 2 空格缩进
    - skill1

# ❌ 错误：缺少引号的特殊字符
name: My Agent: v1  # 应加引号："My Agent: v1"

# ✅ 正确
name: "My Agent: v1"
skills:
  - skill1
```

**解决方案**：
1. 使用 YAML 验证器检查
2. 修复缩进（统一 2 空格）
3. 特殊字符加引号
4. 重新导入或更新

---

## 导出问题

### 问题 15：`export_agent` 生成的文件不完整

**现象**：`CLAUDE.md` 缺少内容或 `settings.json` 为空。

**原因 1**：智能体引用的资产不存在。

**诊断**：
```bash
# 查看智能体配置
cat ~/.agentx/agents/<id>/agent.yaml

# 检查引用的文件是否存在
ls ~/.agentx/skills/
ls ~/.agentx/rules/
ls ~/.agentx/prompts/
```

**解决方案**：
1. 补全缺失的资产
2. 或修改 `agent.yaml` 移除无效引用

---

**原因 2**：文件权限不足。

**解决方案**：
```bash
# 检查输出目录权限
ls -ld /output/dir

# 修复权限
chmod 755 /output/dir
```

---

## 性能问题

### 问题 16：`agentx list` 响应缓慢

**现象**：列出资产需要数秒。

**原因 1**：资产数量过多（数千条）。

**诊断**：
```bash
# 统计资产数量
sqlite3 ~/.agentx/db.sqlite "SELECT COUNT(*) FROM assets;"
```

**解决方案**：
```bash
# 1. 归档旧资产
mkdir -p ~/.agentx/archive
mv ~/.agentx/skills/old-* ~/.agentx/archive/

# 2. 清理数据库
sqlite3 ~/.agentx/db.sqlite "DELETE FROM assets WHERE ..."

# 3. 重建索引（未来版本支持 VACUUM）
```

---

**原因 2**：数据库未索引或碎片化。

**解决方案**：
```bash
# 分析查询性能
sqlite3 ~/.agentx/db.sqlite "EXPLAIN QUERY PLAN SELECT * FROM assets WHERE type='skill';"

# 重建数据库（VACUUM）
sqlite3 ~/.agentx/db.sqlite "VACUUM;"
```

---

### 问题 17：Claude Code 响应慢

**现象**：调用工具后等待时间长。

**原因**：MCP 通信延迟或 AgentX 处理慢。

**诊断**：
```bash
# 1. 检查 AgentX 是否在运行
ps aux | grep agentx  # macOS/Linux
Get-Process agentx  # Windows

# 2. 查看 Claude Code 日志
# macOS: ~/Library/Logs/Claude/mcp*.log
# 查看是否有错误
```

**解决方案**：
1. 重启 Claude Code
2. 重启 AgentX 服务器
3. 检查系统资源（CPU、内存）
4. 检查数据库文件大小（过大时 VACUUM）

---

## 日志与调试

### 启用调试日志

**AgentX 调试**：
```bash
# 设置日志级别（未来版本）
export AGENTX_LOG_LEVEL=debug
agentx-mcp

# 当前版本：修改源代码添加 console.log
```

**Claude Code 调试**：
```bash
# 查看 MCP 通信日志
# macOS
tail -f ~/Library/Logs/Claude/mcp*.log

# Linux
tail -f ~/.config/Claude/mcp*.log

# Windows（PowerShell）
Get-Content "$env:APPDATA\Claude\mcp*.log" -Wait
```

---

### 收集诊断信息

提交 Issue 时请提供：

```bash
# 1. 版本信息
agentx --version
node --version
npm --version

# 2. 系统信息
uname -a  # macOS/Linux
systeminfo  # Windows

# 3. 目录结构
ls -la ~/.agentx/

# 4. 数据库统计
sqlite3 ~/.agentx/db.sqlite "SELECT type, COUNT(*) FROM assets GROUP BY type;"

# 5. 错误日志（最近 20 行）
tail -20 ~/.claude.log  # 或 Claude Code 日志路径

# 6. 配置文件（去除敏感信息）
cat ~/.claude.json | jq 'del(.mcpServers.agentx.env)'
```

---

## 🔄 恢复与重置

### 完全重置 AgentX

**警告**：将删除所有资产和配置！

```bash
# 1. 备份（重要！）
cp -r ~/.agentx ~/.agentx.backup.$(date +%Y%m%d)

# 2. 删除数据目录
rm -rf ~/.agentx

# 3. 重新初始化
agentx info
# 自动创建新的 ~/.agentx/ 和 db.sqlite
```

---

### 仅重置数据库

保留资产文件，重建索引：
```bash
# 1. 备份资产文件
cp -r ~/.agentx/skills ~/backup/
cp -r ~/.agentx/prompts ~/backup/
# ...

# 2. 删除数据库
rm ~/.agentx/db.sqlite

# 3. 重启 AgentX（自动重建）
agentx list
```

---

## 🆘 获取帮助

如果以上解决方案无效：

1. **搜索现有 Issue**：https://github.com/agentx/agentx-mcp/issues
2. **提交新 Issue**：包含以下信息
   - 操作系统和版本
   - Node.js 版本
   - AgentX 版本
   - 错误日志（完整堆栈）
   - 复现步骤
   - 诊断信息（见上文）
3. **讨论区**：https://github.com/agentx/agentx-mcp/discussions
4. **文档**：查看 [USER_GUIDE.md](./USER_GUIDE.md)、[API_REFERENCE.md](./API_REFERENCE.md)

---

## 📊 错误代码参考

| 错误码 | 消息 | 说明 | 解决方案 |
|--------|------|------|----------|
| `ASSET_NOT_FOUND` | `Asset not found: {id}` | ID 不存在 | 检查 ID 是否正确 |
| `PARSE_ERROR` | `Failed to parse ...` | YAML/JSON 解析失败 | 检查文件格式 |
| `DB_ERROR` | `SQLITE_*` | 数据库错误 | 检查权限、磁盘空间 |
| `FILE_ERROR` | `ENOENT: no such file` | 文件不存在 | 检查路径 |
| `PERMISSION_ERROR` | `EACCES: permission denied` | 权限不足 | 修改权限 |
| `VALIDATION_ERROR` | `Invalid input` | 参数验证失败 | 检查参数格式 |

---

*文档版本：1.0.0 | 最后更新：2026-04-29*
