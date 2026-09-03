# Ruijie Cloud OpenCLI Adapter

本分支只支持 OpenCLI。它不包含或调用 MCP Server、自定义配对 Token Bridge 或项目专用 Chrome 扩展。

```text
Agent
  -> OpenCLI 命令 / Skill
  -> Ruijie OpenCLI Adapter
  -> OpenCLI Browser Bridge
  -> 已登录的 Ruijie Cloud Chrome Session
  -> /webproxy/common/api
```

## 安装

1. 从 [opencli.info](https://opencli.info) 安装 OpenCLI 1.8.7+ 和 Browser Bridge。
2. 在 Chrome 登录 Ruijie Cloud，记下目标项目的准确名称，并复制该 Tab 的 URL。
3. 拷贝或克隆本仓库，然后安装自包含的 `opencli-plugin-ruijie` 目录：

```powershell
cd opencli-plugin-ruijie
opencli plugin install $PWD
opencli doctor
opencli validate ruijie
```

只要这个插件目录即可，不再依赖仓库里的其它文件。OpenCLI 要绝对路径（`$PWD`）。只写文件夹名会被当成远程插件名。

## 使用

这个 URL 只标识账号和区域，不包含当前所选项目。每条命令都要通过 `--project` 传入准确项目名称；第一条命令还要传 `--url`。Adapter 会新开 OpenCLI Adapter Tab Group，自动在左上角切换并校验指定项目；同一 Adapter Tab 上的后续命令可以省略 `--url`。

```powershell
$project = "Yang Test"
opencli ruijie project-context --project "$project" --url "https://cloud-as.ruijienetworks.com/macc5/adminIntl/#/monitor_project_workbarn_menu" -f yaml
opencli ruijie device-info NAEK069CH0001 --project "$project" --sections detail,performance -f yaml
opencli ruijie device-network NAEK069CH0001 --project "$project" --sections interfaces,wan -f yaml
opencli ruijie alarms --project "$project" --state active --limit 50 -f yaml
opencli ruijie topology --project "$project" --include-clients true -f yaml
opencli ruijie clients --project "$project" --device-sn NAEK069CH0009 --type wireless --limit 50 -f yaml
opencli ruijie client-info ff61.f210.53b3 --project "$project" -f yaml
opencli ruijie operation-logs --project "$project" --days 7 --limit 50 -f yaml
opencli ruijie wireless-settings --project "$project" --sections radio,wifi -f yaml
opencli ruijie portal-auth --project "$project" --sections policies,ssids --limit 100 -f yaml
```

设备未知时，先对指定项目运行 `project-context`。设备 SN 必须来自该项目。命令说明可通过以下方式查看：

```powershell
opencli ruijie --help -f yaml
```

## 安全边界

- 十个命令全部声明 `access: read`。
- 只允许 `opencli-plugin-ruijie/domain.js` 中登记的路径和语义方法。
- 拒绝绝对 URL、未知路径及方法不匹配。
- 不提供通用 API、fetch、eval 或配置修改命令。
- 在代码中校验设备归属、sections、告警状态和数量。
- 输出给 Agent 前继续执行标准化和敏感字段脱敏。
- 登录 Cookie 留在浏览器中，请求由 OpenCLI `page.fetchJson()` 在浏览器上下文发出。

## 测试

```powershell
npm test
opencli validate ruijie
```
