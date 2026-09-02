# Ruijie Cloud OpenCLI Adapter

[中文说明](README-ZH.md)

Read-only OpenCLI adapters for inspecting the currently selected Ruijie Cloud project through an existing logged-in Chrome session.

```text
Agent
  -> OpenCLI command / skill
  -> Ruijie OpenCLI adapter
  -> shared Ruijie domain/query layer
  -> OpenCLI Browser Bridge
  -> logged-in Ruijie Cloud browser session
  -> /webproxy/common/api
```

This branch is OpenCLI-only. It does not contain or invoke an MCP server, custom pairing-token bridge, or project-specific Chrome extension.

## Install

1. Install OpenCLI 1.8.7+ and its Browser Bridge from [opencli.info](https://opencli.info).
2. Log into Ruijie Cloud in Chrome, open the target project, and copy that tab's URL.
3. Install this repository's plugin locally:

```powershell
cd opencli-plugin-ruijie
opencli plugin install $PWD
opencli doctor
opencli validate ruijie
```

OpenCLI needs an absolute local path (`$PWD` or `file:///...`). A bare folder name is treated as a remote plugin, not `.\opencli-plugin-ruijie`. From the repo root you can also run `opencli plugin install "$PWD\opencli-plugin-ruijie"`.

If several Browser Bridge profiles are connected, place `--profile <name>` immediately after `opencli`.

## Commands

Paste the project tab URL from Chrome into `--url` on the first command. The adapter opens an OpenCLI Adapter tab group at that address, then reads the project from the page. Later commands on the same adapter tab can omit `--url`.

```powershell
opencli ruijie project-context --url "https://cloud-as.ruijienetworks.com/macc5/adminIntl/#/monitor_project_workbarn_menu" -f yaml
```

Then query one device or the project's alarms:

```powershell
opencli ruijie device-info NAEK069CH0001 --sections detail,performance -f yaml
opencli ruijie device-network NAEK069CH0001 --sections interfaces,wan -f yaml
opencli ruijie alarms --state active --limit 50 -f yaml
opencli ruijie topology --include-clients true -f yaml
opencli ruijie clients --device-sn NAEK069CH0009 --type wireless --limit 50 -f yaml
opencli ruijie client-info ff61.f210.53b3 -f yaml
opencli ruijie operation-logs --days 7 --limit 50 -f yaml
opencli ruijie wireless-settings --sections radio,wifi -f yaml
opencli ruijie portal-auth --sections policies,ssids --limit 100 -f yaml
```

Agent-facing command metadata is available as structured YAML:

```powershell
opencli ruijie --help -f yaml
opencli ruijie device-network --help -f yaml
```

See [`opencli-plugin-ruijie/RUIJIE-DOMAIN.md`](opencli-plugin-ruijie/RUIJIE-DOMAIN.md) for command-selection guidance.

## Security

- Every command declares `access: read`.
- Only paths and semantic methods in `src/ruijie/domain.js` are accepted.
- Inner API calls reject absolute URLs, unknown paths, and method mismatches. `--url` is only used to open the project page.
- There is no generic API, fetch, eval, or configuration command.
- Device SNs must belong to the currently selected project.
- Sections, pagination, client filters/MAC, history windows, alarm state, and limits are validated in code.
- Password, token, cookie, credential, key, community, and signature fields are redacted before output reaches the agent.
- Authentication cookies remain in the browser; requests use OpenCLI's browser-context `page.fetchJson()`.

## Browser strategy

All ten adapters declare `Strategy.COOKIE` and `navigateBefore: false`. `--url` must be an `https://cloud-*.ruijienetworks.com/...` project page copied from Chrome. The adapter derives the API origin from that URL and does not hardcode a region host. Known read calls are sent through the authenticated browser context to `POST /webproxy/common/api`.

See [`docs/OPENCLI-ARCHITECTURE.md`](docs/OPENCLI-ARCHITECTURE.md) and [`API-CATALOG.md`](API-CATALOG.md).

## Test

```powershell
npm test
opencli validate ruijie
```

Troubleshooting:

```powershell
opencli doctor
opencli profile list
opencli plugin list
```
