# Ruijie Cloud Project Export

[中文说明](README-ZH.md)

Read-only Chrome extension that exports the currently open Ruijie Cloud project to one local JSON file. It does not upload data or call an AI service.

## Load it

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this folder.
4. Open a project at `https://cloud-as.ruijienetworks.com/macc5/`.
5. Open the extension and choose **Export current project**.

The extension uses the current Ruijie Cloud session without reading Cookie or local-storage values. Only explicitly allowlisted read operations can run. Password, PSK, token, secret, cookie, credential, private-key, SNMP community, access-key and user-signature fields are replaced with `[REDACTED]`.

## Export coverage

- Project metadata, device counts and network model
- Device inventory, details, capabilities, runtime utilization and online history
- Topology tree, terminals and per-device links
- Current clients and client statistics
- Gateway interfaces, WAN health, VLAN and port configuration
- Switch ports/status, VLANs, uplink and neighbors
- AP/bridge radio abilities, ports, VLANs and client health counts
- Radio settings, Wi-Fi templates/SSIDs, load balancing and AI roaming settings
- Portal authentication policies, capabilities, global settings and associated SSIDs
- Active/cleared alarms and the last 30 days of operation logs

Unsupported or failed sections are recorded in the top-level `errors` array instead of aborting the export.

## Check

```powershell
npm test
```
