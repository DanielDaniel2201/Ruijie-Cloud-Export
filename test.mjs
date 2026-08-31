import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const requests = [];
const replies = envelope => {
  if (envelope.api.startsWith("/maint/network/common/list")) {
    return { code: 0, dataList: [{ buildingId: 7, name: "Demo" }] };
  }
  if (envelope.api.startsWith("/maint/devices/list")) {
    return { code: 0, deviceList: [
      { serialNumber: "GW1", commonType: "GATEWAY" },
      { serialNumber: "SW1", commonType: "SWITCH" },
      { serialNumber: "AP1", commonType: "AP" }
    ] };
  }
  if (envelope.api === "/network/current/user/global/page") return { code: 0, list: [{ mac: "00:11" }] };
  if (envelope.api === "/conf/group/7/templates") return { code: 0, tempList: [{ id: 9 }] };
  if (envelope.api === "/conf/wifi_grp/wifi") return { code: 0, data: { ssidList: [{ ssidName: "Demo", password: "secret" }] } };
  return { code: 0 };
};
const sandbox = {
  AbortSignal,
  Date,
  URL,
  document: { querySelector: () => ({ textContent: "Demo" }) },
  fetch: async (_url, options) => {
    const envelope = JSON.parse(options.body);
    requests.push(envelope);
    return { ok: true, json: async () => replies(envelope) };
  },
  location: { origin: "https://cloud-as.ruijienetworks.com" },
  setTimeout,
  clearTimeout,
  window: {}
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

const result = await sandbox.window.__ruijieCloudExporter.run();
const snapshot = JSON.parse(result.json);
assert.equal(result.summary.devices, 3);
assert.equal(result.summary.clients, 1);
assert.deepEqual(JSON.parse(JSON.stringify(getProgress())), {
  items: [
    "Client data", "Wireless templates", "Device 1: GW1", "Device 2: SW1", "Device 3: AP1",
    "Project overview", "Topology", "Client statistics", "Wireless settings", "Active alarms", "Cleared alarms", "Operation log"
  ],
  current: 11,
  completed: 12,
  running: false
});
assert.equal(snapshot.wireless.wifi[0].data.ssidList[0].password, "[REDACTED]");
assert.ok(requests.every(request => isAllowed(request.api, request.method)));

console.log("collector safety checks passed");
