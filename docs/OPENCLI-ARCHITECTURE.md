# OpenCLI architecture

## Runtime

```text
Agent
  -> opencli ruijie <semantic-command>
  -> opencli-plugin-ruijie/ruijie.js
  -> opencli-plugin-ruijie/domain.js
  -> OpenCLI page.fetchJson()
  -> POST /webproxy/common/api
  -> logged-in Ruijie browser session
```

There is no MCP or custom browser transport. `ruijie.js` only translates CLI arguments/errors, validates `--url`, navigates the adapter tab, and creates the OpenCLI browser transport from that URL's origin. `domain.js` in the same plugin directory owns endpoint authorization, project/device validation, query composition, normalization, and redaction. The region host is not hardcoded; `cloud-as`, `cloud-eu`, and `cloud-me` are accepted when the pasted URL uses those hosts.

## Browser strategy

```text
Strategy declaration: Strategy.COOKIE
Data acquisition: browser-context page.fetchJson
Contract: internal-unstable
Observed request: POST /webproxy/common/api with a semantic read envelope
Auth source: existing browser session; credentials included by OpenCLI
Adapter tab: opened by OpenCLI; first command passes --url copied from Chrome
Replay: HTTP 200, application/json, code=0
```

Testing against project `SMB_GeneralDemo2` returned one matching project and 17 devices. `INTERCEPT` is unnecessary because the known calls require neither dynamic signatures nor UI-triggered requests. UI scraping cannot provide the same structured device/network payloads. The adapter never reads or copies browser cookies.

## Domain behavior

The transport sends this envelope to same-origin `/webproxy/common/api`:

```json
{
  "api": "/allowlisted/path?...",
  "method": "GET",
  "module": "default",
  "querys": { "lang": "en" },
  "authParams": {
    "api": "/allowlisted/path?...",
    "method": "GET"
  }
}
```

`params` is added only for endpoints that require a body. The outer HTTP method is POST; the inner semantic method determines whether the allowlist accepts the operation. `/maint/devices/list` is the sole allowlisted inner POST and is an inventory read.

Before output:

- Successful `{code: 0}` wrappers are removed and sole `data`/`list` wrappers are unwrapped.
- Empty values are omitted.
- String booleans, known timestamps, rates, utilization, RSSI, latency, packet loss, and byte counters are normalized.
- Password/PSK/token/cookie/credential/authorization/session/private-key/API-key/community/signature/access-key fields are replaced with `[REDACTED]`.
- Token/key/signature values in query strings are redacted.

## Validation

- The visible `.groupbar-name` must resolve uniquely against the account's project list.
- Device commands accept only an SN in that project's inventory.
- Device-info sections: `detail`, `ability`, `performance`, `history`, `topology`.
- Network sections are restricted by gateway/switch/wireless device type.
- Alarm state is `active|cleared`; limit is an integer from 1 to 200.
- Client scope/type/page/limit/problem filter and MAC format are validated.
- Operation-log days and limits, wireless sections, and Portal sections/limits are validated.
- Unknown commands, unknown paths, absolute URLs, and method mismatches fail explicitly.

## Complete semantic API allowlist

The outer request is always `POST /webproxy/common/api`; only these inner operations are accepted:

```text
GET  /maint/network/common/list
GET  /maint/statistic/deviceinfo
GET  /maint/network/model/detail
POST /maint/devices/list
GET  /maint/device/{sn}
GET  /network/current/user/global/page
GET  /network/current/user/statistical
GET  /topology/info/{groupId}
GET  /topology/terminal/info/{groupId}
GET  /topology/generation/record/{groupId}
GET  /topology/link/info
GET  /warn/warnlog
GET  /operationlog/list
GET  /conf/group/{groupId}/templates
GET  /conf/radio/global/config
GET  /conf/wifi_grp/wifi
GET  /intl/auth/v2/policy/{groupId}
GET  /intl/auth/v2/ability/{groupId}
GET  /intl/auth/v2/global/{groupId}
GET  /intl/auth/v2/group/{groupId}/ssids
GET  /device-ability/list/{sn}
GET  /device-ability
GET  /sys/current_performance
GET  /device/history/onoff/{sn}
GET  /gateway/intf/info/{sn}
GET  /smartdiagnosis/wan-detect/device/status
GET  /egw/conf/device/{sn}/port/1
GET  /egw/conf/device/{sn}/vlan
GET  /gateway/intf/unuseddhcp
GET  /smartscene/device/switch/ports
GET  /smartscene/device/conf/vlan
GET  /switch/uplinkport/{sn}
GET  /switch/neighbor/{sn}
GET  /conf/switch/device/{sn}/ports
GET  /conf/esw/vlan_mode
GET  /conf/radio/product_ability
GET  /enet/port/conf
GET  /enet/vlan_list
GET  /enet/port/list
GET  /sta/device/user/count
GET  /sta/bad_rssi_user_count
GET  /nbc/ap_lb/conf
GET  /enet/airoam/group/{groupId}/conf
```

## Verified vertical slice

On 2026-09-02 with OpenCLI 1.8.7 and Browser Bridge 1.0.24:

- `project-context` returned the selected project, 17 devices, summary, and network model.
- `device-info NAEK069CH0001 --sections detail,performance` succeeded.
- `device-network NAEK069CH0001 --sections interfaces,wan` succeeded.
- `alarms --state active --limit 5` succeeded.
- `topology`, paginated `clients`, and `client-info <MAC>` succeeded.
- `operation-logs`, `wireless-settings --sections radio`, and `portal-auth --sections policies` succeeded.
- Invalid SN, unsupported sections, bad MAC/filter, and out-of-range values returned argument errors.
- `opencli validate ruijie` passed all ten commands.
