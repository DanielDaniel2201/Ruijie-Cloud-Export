# Ruijie Cloud MCP Test Field

这是当前扩展仓库里的项目级 Pi Coding Agent 测试环境。未引用的 `test-field/` 文件不会被 Chrome 执行，因此从仓库根目录 **Load unpacked** 不受影响。

MCP 配置、扩展和会话只作用于这个目录；Token 位于被忽略的 `.private/`。项目设置还关闭了 Pi 内置文件/命令工具，Agent 默认只能使用 MCP 工具。

## 首次使用

1. 在仓库根目录执行 `npm install`。
2. 从 `chrome://extensions` 重新加载仓库根目录，然后刷新已登录的锐捷项目页面。
3. 不在终端显示 Token，直接复制到剪贴板：

```powershell
Set-Location D:\projects\ruijie-cloud-export\test-field
Get-Content .\.private\ruijie-mcp-token.txt | Set-Clipboard
```

4. 打开扩展的 **MCP agent connection**，端口填 `32145`，粘贴 Token，勾选启用并保存。
5. 保持一个已登录的锐捷项目标签页处于活动状态。
6. 直接启动 Pi：

```powershell
Set-Location D:\projects\ruijie-cloud-export\test-field
pi
```

首次进入时信任该项目。Pi 会继续使用你现有的模型登录，但本项目会把会话写入 `.private/sessions/`。

如需连 Pi 登录凭证和 MCP 元数据缓存也完全隔离，改用：

```powershell
.\start.ps1
```

这种模式首次启动需要单独执行 `/login`，凭证只保存在 `.private/pi-agent/`。

## 验证

在 Pi 中运行 `/mcp status`，然后输入：

```text
请先读取当前锐捷项目和设备列表，只告诉我有几台网关、交换机和 AP，不要读取全部设备详情。
```

随后可以测试：

```text
客户反馈互联网间歇性断线。请按需检查网关 WAN、接口状态和当前告警，给出证据、可能原因和仍需确认的信息。
```

MCP 首次连接后提供四个只读工具：`get_project_context`、`get_device_info`、`get_device_network`、`get_alarms`。

## 隔离范围

- 项目级 Pi 扩展：`.pi/settings.json`、`.pi/npm/`
- 项目级 MCP 配置：`.mcp.json`
- MCP Token：`.private/ruijie-mcp-token.txt`
- 项目会话：`.private/sessions/`
- 完全隔离模式的 Pi 凭证和缓存：`.private/pi-agent/`

删除 `test-field/` 即可清理测试环境。发布 Chrome 扩展 ZIP 时仍建议排除 `test-field/`、`node_modules/` 和其他开发文件以减小体积。
