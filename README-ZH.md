# Ruijie Cloud Project Export

[English](README.md)

这是一个只读 Chrome 扩展，用于把当前打开的锐捷云项目导出为一个本地 JSON 快照。它不会上传数据，也不会调用 AI 服务。

## 加载扩展

1. 打开 `chrome://extensions`。
2. 开启**开发者模式**。
3. 点击**加载已解压的扩展程序**，选择本仓库目录。
4. 打开 `https://cloud-as.ruijienetworks.com/macc5/` 中的一个项目。
5. 打开扩展，点击 **Export current project**。

扩展会复用当前锐捷云登录状态，但不会读取 Cookie 或 localStorage 的值。它只能调用显式白名单中的只读操作。密码、PSK、token、Cookie、secret、credential、私钥、SNMP community、access key 和 user signature 字段都会替换为 `[REDACTED]`。

## 导出范围

- 项目元数据、设备数量和网络模式
- 设备清单、详情、能力、运行状态和上下线历史
- 拓扑树、终端和设备链路
- 当前客户端及客户端统计
- 网关接口、WAN 健康状态、VLAN 和端口配置
- 交换机端口/状态、VLAN、上联口和邻居
- AP/无线桥的 Radio 能力、端口、VLAN 和客户端健康统计
- Radio 配置、Wi-Fi 模板/SSID、负载均衡和 AI Roaming 配置
- Portal 认证策略、能力、全局设置和关联 SSID
- 当前/已清除告警，以及最近 30 天操作日志

不支持或失败的部分会记录在顶层 `errors` 数组中，不会中止整个导出。

## 检查

```powershell
npm test
```
