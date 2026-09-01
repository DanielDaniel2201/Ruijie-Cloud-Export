# Ruijie Cloud Project Export

[中文说明](README-ZH.md)

Read-only Chrome extension that exports the currently open Ruijie Cloud project to a local JSON file or lets an agent inspect it on demand through a local MCP server. Normal exports do not upload data or call an AI service; when MCP is enabled, redacted tool results are passed to the MCP client configured by the user. The action icon remains marked while an export continues after the popup closes.

## Load it

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select this folder.
4. Open a project at `https://cloud-as.ruijienetworks.com/macc5/`.
5. Open the extension and choose **Export current project**.

The extension uses the current Ruijie Cloud session without reading Cookie or local-storage values. Only explicitly allowlisted read operations can run. Password, PSK, token, secret, cookie, credential, private-key, SNMP community, access-key and user-signature fields are replaced with `[REDACTED]` before data leaves the browser. IP addresses, MAC addresses, serial numbers, SSIDs and usernames remain available as diagnostic data.

## Agent / MCP

1. Install local dependencies with `npm install`.
2. Generate a random pairing token containing at least 16 characters.
3. Reload the extension, open a Ruijie project, and enter the port (default `32145`) and token under **MCP agent connection** in the popup. Enable the connection.
4. Add the server to the MCP client:

```json
{
  "mcpServers": {
    "ruijie-cloud": {
      "command": "node",
      "args": ["D:/projects/ruijie-cloud-export/mcp-server.mjs"],
      "env": {
        "RUIJIE_MCP_TOKEN": "replace-with-the-same-random-token",
        "RUIJIE_MCP_PORT": "32145"
      }
    }
  }
}
```

The server binds only to `127.0.0.1`. Keep one Ruijie project tab active. The agent receives nine read-only tools covering project/device state, alarms, topology, clients, operation logs, wireless settings, and Portal authentication; device serial numbers must belong to the current project, and arbitrary API or write calls are unavailable.

## Export coverage

- Project metadata, device counts and network model
- Device inventory, details, capabilities, runtime utilization and online history
- AI-friendly normalized `nodes`/`links` topology with an explicit availability reason
- Deduplicated current clients and client statistics
- Gateway interfaces, WAN health, VLAN and port configuration
- Switch ports/status, VLANs, uplink and neighbors
- AP/bridge radio abilities, ports, VLANs and client health counts
- Radio settings, Wi-Fi templates/SSIDs, load balancing and AI roaming settings
- Portal authentication policies, capabilities, global settings and associated SSIDs
- Active/cleared alarms and the last 30 days of operation logs

Unsupported or failed sections are recorded in the top-level `errors` array instead of aborting the export. Output uses compact JSON, omits empty values and successful API wrappers, and normalizes booleans, timestamps and common network metric units.

## Check

```powershell
npm test
```
