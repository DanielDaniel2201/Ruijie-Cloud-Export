import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const requests = [];
const exportStates = [];
let activeApRequests = 0;
let maxActiveApRequests = 0;
let activeRequests = 0;
let maxActiveRequests = 0;
const replies = envelope => {
  if (envelope.api.startsWith("/maint/network/common/list")) {
    return { code: 0, dataList: [{ buildingId: 7, name: "Demo" }] };
  }
  if (envelope.api.startsWith("/maint/devices/list")) {
    return { code: 0, deviceList: [
      { serialNumber: "GW1", commonType: "GATEWAY" },
      { serialNumber: "SW1", commonType: "SWITCH" },
      { serialNumber: "AP1", commonType: "AP" },
      { serialNumber: "AP2", commonType: "AP" },
      { serialNumber: "AP3", commonType: "AP" },
      { serialNumber: "AP4", commonType: "AP" }
    ] };
  }
  if (envelope.api === "/network/current/user/global/page") return { code: 0, list: [{ mac: "00:11", onlineTime: 1_700_000_000_000, activeSec: 60, upRate: "128", userName: "", apSn: "AP1", connectionType: "wireless", rssi: "-75", token: "client-token" }] };
  if (envelope.api === "/maint/device/GW1") return { code: 0, data: { serialNumber: "GW1", password: "gateway-secret" } };
  if (envelope.api === "/gateway/intf/info/GW1") return { code: 0, data: { name: "WAN1", token: "gateway-token" } };
  if (envelope.api.startsWith("/warn/warnlog")) return { code: 0, list: [{ sn: "GW1", message: "WAN down", accessKey: "alarm-key" }] };
  if (envelope.api.startsWith("/operationlog/list")) return { code: 0, list: [{ sn: "GW1", description: "WAN changed", credential: "log-secret" }] };
  if (envelope.api === "/topology/generation/record/7") return { code: 0, data: { currentHasTopo: "true" } };
  if (envelope.api.startsWith("/topology/info/7")) return { code: 0, data: { sn: "GW1", children: [{ sn: "SW1" }] } };
  if (envelope.api === "/topology/terminal/info/7") return { code: 0, list: [{ sn: "AP1", details: [{ mac: "00:11", ip: "192.0.2.1", linkedPort: "Gi1" }] }] };
  if (envelope.api === "/conf/group/7/templates") return { code: 0, tempList: [{ id: 9 }] };
  if (envelope.api === "/conf/wifi_grp/wifi") return { code: 0, data: { ssidList: [{ ssidName: "Demo", password: "secret" }] } };
  if (envelope.api.startsWith("/intl/auth/v2/policy/")) return { code: 0, data: [{ policyName: "Guest portal", policyEnable: true }] };
  return { code: 0 };
};
const sandbox = {
  AbortController,
  AbortSignal,
  Date,
  URL,
  document: { querySelector: () => ({ textContent: "Demo" }) },
  fetch: async (_url, options) => {
    maxActiveRequests = Math.max(maxActiveRequests, ++activeRequests);
    try {
      const envelope = JSON.parse(options.body);
      requests.push(envelope);
      if (/^\/maint\/device\/AP/.test(envelope.api)) {
        maxActiveApRequests = Math.max(maxActiveApRequests, ++activeApRequests);
        await new Promise(resolve => setTimeout(resolve, 5));
        activeApRequests--;
      } else {
        await new Promise(resolve => setTimeout(resolve, 1));
      }
      return { ok: true, json: async () => replies(envelope) };
    } finally {
      activeRequests--;
    }
  },
  location: { origin: "https://cloud-as.ruijienetworks.com" },
  setTimeout,
  clearTimeout,
  window: { postMessage: message => exportStates.push(message) }
};
vm.runInNewContext(fs.readFileSync(new URL("./collector.js", import.meta.url), "utf8"), sandbox);

const { redact, isAllowed, getProgress } = sandbox.window.__ruijieCloudExporter;
assert.equal(redact({ password: "wifi-secret" }).password, "[REDACTED]");
assert.equal(redact({ access_token: "abc" }).access_token, "[REDACTED]");
assert.equal(redact({ authorization: "Bearer abc" }).authorization, "[REDACTED]");
assert.equal(redact({ serialNumber: "SN1" }).serialNumber, "SN1");
assert.equal(isAllowed("/maint/device/SN1", "GET"), true);
assert.equal(isAllowed("/maint/device/SN1", "POST"), false);
assert.equal(isAllowed("/llm-im/deleteGPTHistory", "GET"), false);
assert.equal(isAllowed("/enet/conf/group/1/password_status", "GET"), false);
assert.equal(isAllowed("/intl/auth/v2/policy/7?page_index=1", "GET"), true);
assert.equal(isAllowed("/intl/auth/v2/policy/7", "POST"), false);

const result = await sandbox.window.__ruijieCloudExporter.run();
const snapshot = JSON.parse(result.json);
assert.deepEqual(JSON.parse(JSON.stringify(exportStates)), [
  { type: "ruijie-export-state", running: true },
  { type: "ruijie-export-state", running: false }
]);
assert.equal(result.summary.devices, 6);
assert.equal(result.summary.clients, 1);
assert.ok(maxActiveApRequests > 1 && maxActiveApRequests <= 4);
assert.ok(maxActiveRequests > 4 && maxActiveRequests <= 8);
const finishedProgress = JSON.parse(JSON.stringify(getProgress()));
assert.equal(typeof finishedProgress.startedAt, "number");
assert.equal(typeof finishedProgress.completedDurationMs, "number");
delete finishedProgress.startedAt;
delete finishedProgress.completedDurationMs;
assert.deepEqual(finishedProgress, {
  items: [
    "Client data", "Wireless templates", "Devices 6/6", "Project overview", "Topology", "Client statistics",
    "Wireless settings", "Portal authentication", "Active alarms", "Cleared alarms", "Operation log"
  ],
  current: 10,
  completed: 11,
  itemStartedAt: null,
  running: false,
  canceled: false,
  error: null,
  result: null
});
assert.equal(snapshot.version, 2);
assert.equal(snapshot.wireless.wifi[0].ssidList[0].password, "[REDACTED]");
assert.equal(snapshot.portalAuth.policies[0].policyName, "Guest portal");
assert.equal(snapshot.clients.length, 1);
assert.equal(snapshot.clients[0].connectedDeviceId, "AP1");
assert.equal(snapshot.clients[0].onlineAt, "2023-11-14T22:13:20.000Z");
assert.equal(snapshot.clients[0].activeSeconds, 60);
assert.equal(snapshot.clients[0].uploadRateBps, 128);
assert.equal("userName" in snapshot.clients[0], false);
assert.equal(snapshot.topology.available, true);
assert.equal(snapshot.topology.nodes.length, 7);
assert.deepEqual(snapshot.topology.links, [
  { source: "GW1", target: "SW1", type: "infrastructure" },
  { source: "AP1", target: "client:00:11", type: "client", sourcePort: "Gi1" }
]);
assert.equal(snapshot.topology.unlinkedClientCount, 0);
assert.equal(result.json.includes("\n"), false);
assert.equal(JSON.stringify(snapshot).includes('"code":0'), false);
assert.ok(requests.every(request => isAllowed(request.api, request.method)));

let backgroundListener;
const actionCalls = [];
const bridgePosts = [];
const scriptCalls = [];
vm.runInNewContext(fs.readFileSync(new URL("./background.js", import.meta.url), "utf8"), {
  AbortSignal,
  chrome: {
    runtime: { onMessage: { addListener: listener => { backgroundListener = listener; } } },
    storage: { local: { get: async () => ({ mcpEnabled: true, mcpPort: 32145, mcpToken: "test-token-123456789" }) } },
    scripting: { executeScript: async options => {
      scriptCalls.push(options);
      return [{ result: options.args ? { project: { name: "Demo" } } : true }];
    } },
    action: {
      setBadgeBackgroundColor: options => actionCalls.push(["color", options]),
      setBadgeText: options => actionCalls.push(["badge", options]),
      setTitle: options => actionCalls.push(["title", options])
    }
  },
  fetch: async (url, options = {}) => {
    if (url.endsWith("/next")) return { status: 200, ok: true, json: async () => ({ id: "abc-123", name: "get_project_context", arguments: {} }) };
    bridgePosts.push([url, JSON.parse(options.body)]);
    return { ok: true };
  }
});
backgroundListener({ type: "ruijie-export-state", running: true }, { tab: { id: 3 } });
assert.deepEqual(JSON.parse(JSON.stringify(actionCalls)), [
  ["color", { tabId: 3, color: "#246bfd" }],
  ["badge", { tabId: 3, text: "◌" }],
  ["title", { tabId: 3, title: "Ruijie export in progress" }]
]);
backgroundListener({ type: "ruijie-mcp-poll" }, { tab: { id: 3, active: true } });
await new Promise(resolve => setTimeout(resolve, 10));
assert.equal(scriptCalls.length, 2);
assert.deepEqual(JSON.parse(JSON.stringify(bridgePosts)), [[
  "http://127.0.0.1:32145/result/abc-123",
  { result: { project: { name: "Demo" } } }
]]);

requests.length = 0;
const selectedResult = await sandbox.window.__ruijieCloudExporter.run(["project.overview"]);
const selectedSnapshot = JSON.parse(selectedResult.json);
assert.deepEqual(JSON.parse(JSON.stringify(getProgress().items)), ["Project overview"]);
assert.equal("clients" in selectedSnapshot, false);
assert.equal("devices" in selectedSnapshot, false);
assert.equal(selectedResult.summary.devices, 0);
assert.deepEqual(requests.map(request => request.api), [
  "/maint/network/common/list?page_index=1&page_size=999&version=1&include_fitap=true",
  "/maint/devices/list?page=1&per_page=9999",
  "/maint/statistic/deviceinfo?group_id=7",
  "/maint/network/model/detail?group_id=7"
]);

const { invokeTool } = sandbox.window.__ruijieCloudExporter;
const projectContext = await invokeTool("get_project_context");
assert.equal(projectContext.project.name, "Demo");
assert.equal(projectContext.devices.find(device => device.sn === "GW1").type, "gateway");
assert.deepEqual(JSON.parse(JSON.stringify(projectContext.devices.find(device => device.sn === "GW1").availableNetworkSections)), ["interfaces", "wan", "ports", "vlans", "dhcp"]);
const deviceInfo = await invokeTool("get_device_info", { deviceSn: "GW1", sections: ["detail"] });
assert.equal(deviceInfo.detail.password, "[REDACTED]");
const deviceNetwork = await invokeTool("get_device_network", { deviceSn: "GW1", sections: ["interfaces"] });
assert.equal(deviceNetwork.interfaces.token, "[REDACTED]");
const alarms = await invokeTool("get_alarms", { deviceSn: "GW1", limit: 10 });
assert.equal(alarms.alarms[0].accessKey, "[REDACTED]");
const topology = await invokeTool("get_topology", { includeClients: true });
assert.equal(topology.nodes.length, 7);
assert.equal(topology.links.some(link => link.type === "client"), true);
const clients = await invokeTool("get_clients", { deviceSn: "AP1", type: "wireless", onlyProblems: true, limit: 10 });
assert.equal(clients.returned, 1);
assert.equal(clients.clients[0].rssiDbm, -75);
assert.equal(clients.clients[0].token, "[REDACTED]");
const operationLogs = await invokeTool("get_operation_logs", { deviceSn: "GW1", days: 7, limit: 10 });
assert.equal(operationLogs.logs[0].credential, "[REDACTED]");
const wirelessSettings = await invokeTool("get_wireless_settings", { sections: ["wifi"] });
assert.equal(wirelessSettings.wifi.configurations[0].ssidList[0].password, "[REDACTED]");
const portalAuth = await invokeTool("get_portal_auth", { sections: ["policies"], limit: 10 });
assert.equal(portalAuth.policies[0].policyName, "Guest portal");
await assert.rejects(invokeTool("get_device_info", { deviceSn: "OTHER", sections: ["detail"] }), /does not belong/);
await assert.rejects(invokeTool("get_device_network", { deviceSn: "GW1", sections: ["radio"] }), /Unsupported section/);
await assert.rejects(invokeTool("get_clients", { type: "bluetooth" }), /type must be/);
await assert.rejects(invokeTool("get_operation_logs", { days: 31 }), /days must be/);
await assert.rejects(invokeTool("call_api", { api: "/maint/device/GW1" }), /Unknown tool/);

sandbox.fetch = (_url, options) => new Promise((_resolve, reject) => {
  options.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
});
const canceledRun = sandbox.window.__ruijieCloudExporter.run();
assert.equal(sandbox.window.__ruijieCloudExporter.cancel(), true);
await assert.rejects(canceledRun, /aborted/);
assert.equal(getProgress().running, false);
assert.equal(getProgress().canceled, true);

console.log("collector safety checks passed");
