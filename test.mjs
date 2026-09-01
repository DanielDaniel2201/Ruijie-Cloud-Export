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
  if (envelope.api === "/network/current/user/global/page") return { code: 0, list: [{ mac: "00:11", onlineTime: 1_700_000_000_000, activeSec: 60, upRate: "128", userName: "" }] };
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
vm.runInNewContext(fs.readFileSync(new URL("./background.js", import.meta.url), "utf8"), {
  chrome: {
    runtime: { onMessage: { addListener: listener => { backgroundListener = listener; } } },
    action: {
      setBadgeBackgroundColor: options => actionCalls.push(["color", options]),
      setBadgeText: options => actionCalls.push(["badge", options]),
      setTitle: options => actionCalls.push(["title", options])
    }
  }
});
backgroundListener({ type: "ruijie-export-state", running: true }, { tab: { id: 3 } });
assert.deepEqual(JSON.parse(JSON.stringify(actionCalls)), [
  ["color", { tabId: 3, color: "#246bfd" }],
  ["badge", { tabId: 3, text: "◌" }],
  ["title", { tabId: 3, title: "Ruijie export in progress" }]
]);

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

sandbox.fetch = (_url, options) => new Promise((_resolve, reject) => {
  options.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
});
const canceledRun = sandbox.window.__ruijieCloudExporter.run();
assert.equal(sandbox.window.__ruijieCloudExporter.cancel(), true);
await assert.rejects(canceledRun, /aborted/);
assert.equal(getProgress().running, false);
assert.equal(getProgress().canceled, true);

console.log("collector safety checks passed");
