# Ruijie command guide

A Ruijie URL identifies an account/region, not its selected project. Pass the exact project name through `--project` on every command. Pass the Chrome URL through `--url` on the first command or when switching accounts/regions; the adapter switches and verifies the top-left project picker. Later commands on the same adapter tab may omit `--url`.

- **Project**: the Ruijie Cloud management scope named by `--project`.
- **Device / SN**: managed gateway, switch, AP, or bridge and its serial number. Use only SNs returned by `project-context`.
- **Gateway**: routes the network; query WAN, interfaces, DHCP, ports, and VLANs with `device-network`.
- **Switch**: connects wired devices; query ports, VLANs, uplink, and neighbors with `device-network`.
- **AP / wireless device**: provides Wi-Fi; query radio, ports, VLANs, and client health with `device-network`.
- **WAN**: the gateway's upstream Internet connection.
- **VLAN**: a logical Layer-2 network attached to ports or wireless service.
- **Port / uplink / neighbor**: physical interface, upstream path, and directly discovered network peer.
- **Radio / client**: AP radio capability and connected-client health/count data.
- **Alarm**: an active or cleared project event.
- **Topology**: infrastructure device links and optional client attachment links.
- **Portal authentication**: guest-access policies and the SSIDs/networks to which they apply.

## Pick a command

- Project or device unknown → `ruijie project-context`
- Model, version, status, capability, performance, history → `ruijie device-info <SN>`
- WAN, VLAN, port, DHCP, uplink, neighbor, or one AP's radio/client health → `ruijie device-network <SN>`
- Device paths or attachment relationships → `ruijie topology`
- Client list, filtering, or pagination → `ruijie clients`
- Complete record for one known MAC → `ruijie client-info <MAC>`
- Active or cleared alarms → `ruijie alarms`
- Recent administrative activity → `ruijie operation-logs`
- Project radio, Wi-Fi/SSID, load balancing, or roaming configuration → `ruijie wireless-settings`
- Guest Portal policies, abilities, globals, or SSIDs → `ruijie portal-auth`

All commands are read-only. There is no generic API, fetch, JavaScript, or configuration command.
