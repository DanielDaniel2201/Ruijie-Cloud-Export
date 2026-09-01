# Observed Ruijie Cloud API catalog

Observed against the `cloud-as.ruijienetworks.com/macc5/adminIntl` demo project on 2026-08-31.

The browser sends all business calls to outer `POST /webproxy/common/api`. The JSON envelope contains `api`, semantic `method`, `module`, `querys`, optional `params`, and matching `authParams`. An outer POST therefore does not imply a write.

## Included in the exporter

| Area | Representative semantic API | Data observed |
|---|---|---|
| Projects | `GET /maint/network/common/list` | project ID/name, timezone, type, device counts |
| Inventory | `POST /maint/devices/list` | SN, model/type, status, firmware, IP, MAC, config sync |
| Clients | `GET /network/current/user/global/page` | wired/wireless, AP/device, RSSI, channel, rates, traffic |
| Topology | `GET /topology/info/{groupId}` | recursive device tree and link attributes |
| Device detail | `GET /maint/device/{sn}` | identity, status, version, management address |
| Gateway | `GET /gateway/intf/info/{sn}` | WAN/LAN state, IP/mask, speed, DHCP and VLAN IDs |
| Switch | `GET /smartscene/device/switch/ports` | port mode, VLANs, speed, duplex and aggregation |
| Switch VLAN | `GET /smartscene/device/conf/vlan` | VLAN IDs, descriptions, management/SVI flags |
| AP | `GET /enet/port/conf`, `/enet/vlan_list` | AP port and VLAN configuration |
| Radio | `GET /conf/radio/global/config` | country, bands, widths, limits, RSSI and DFS |
| Wi-Fi | `GET /conf/wifi_grp/wifi` | SSID, bands, VLAN, security mode, roaming and isolation |
| Portal auth | `GET /intl/auth/v2/policy/{groupId}` | Portal policies, enabled state, mode, auth device and network bindings |
| Alarms | `GET /warn/warnlog` | active/cleared alarms and totals |
| Operations | `GET /operationlog/list` | time, action description, result and actor metadata |

## Explicitly excluded

- `/enet/conf/group/{groupId}/password_status`: response includes a password field.
- `/llm-im/deleteGPTHistory`: destructive name despite semantic method `GET`.
- Every `trigger`, save, edit, add, upgrade, hand-over, share, upload and delete action.
- Survey, marketing, chat/LLM and third-party feedback APIs.

The allowlist lives in `collector.js`; unknown endpoints fail closed.
