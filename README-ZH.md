# Ruijie Cloud Project Export

[English](README.md)

这是一个只读 Chrome 扩展，用于把当前打开的锐捷云项目导出为本地 JSON 快照，也可以通过本地 MCP Server 让 Agent 按需读取项目信息。普通导出不会上传数据或调用 AI；启用 MCP 后，脱敏后的工具结果会交给用户配置的 MCP Client。导出期间即使关闭弹窗，扩展图标右下角仍会显示运行标记。

## 加载扩展

1. 打开 `chrome://extensions`。
2. 开启**开发者模式**。
3. 点击**加载已解压的扩展程序**，选择本仓库目录。
4. 打开 `https://cloud-as.ruijienetworks.com/macc5/` 中的一个项目。
5. 打开扩展，点击 **Export current project**。

扩展会复用当前锐捷云登录状态，但不会读取 Cookie 或 localStorage 的值。它只能调用显式白名单中的只读操作。密码、PSK、token、Cookie、secret、credential、私钥、SNMP community、access key 和 user signature 字段都会在离开浏览器前替换为 `[REDACTED]`。IP、MAC、SN、SSID 和用户名作为诊断数据保留。

## Agent / MCP

1. 安装本地依赖：`npm install`。
2. 生成一个至少 16 字符的随机配对 Token。
3. 重新加载扩展，打开锐捷项目，在扩展的 **MCP agent connection** 中填写端口（默认 `32145`）和 Token，然后启用连接。
4. 在 MCP Client 中添加：

```json
{
  "mcpServers": {
    "ruijie-cloud": {
      "command": "node",
      "args": ["D:/projects/ruijie-cloud-export/mcp-server.mjs"],
      "env": {
        "RUIJIE_MCP_TOKEN": "替换为同一个随机 Token",
        "RUIJIE_MCP_PORT": "32145"
      }
    }
  }
}
```

MCP Server 只监听 `127.0.0.1`。保持一个锐捷项目标签页处于活动状态。Agent 可使用 `get_project_context`、`get_device_info`、`get_device_network` 和 `get_alarms`；设备 SN 必须来自当前项目，不能调用任意 API 或写操作。

## 导出范围

- 项目元数据、设备数量和网络模式
- 设备清单、详情、能力、运行状态和上下线历史
- 供 AI 使用的 `nodes`/`links` 规范化拓扑图及拓扑可用性原因
- 去重合并后的当前客户端及客户端统计
- 网关接口、WAN 健康状态、VLAN 和端口配置
- 交换机端口/状态、VLAN、上联口和邻居
- AP/无线桥的 Radio 能力、端口、VLAN 和客户端健康统计
- Radio 配置、Wi-Fi 模板/SSID、负载均衡和 AI Roaming 配置
- Portal 认证策略、能力、全局设置和关联 SSID
- 当前/已清除告警，以及最近 30 天操作日志

不支持或失败的部分会记录在顶层 `errors` 数组中，不会中止整个导出。导出采用紧凑 JSON，省略空值和成功 API 包装，并统一布尔值、时间及常见网络指标单位。

## 检查

```powershell
npm test
```
