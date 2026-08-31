(() => {
  const SECRET_KEY = /pass(word)?|pwd|psk|secret|token|cookie|credential|private.?key|community|user.?sig|access.?key/i;
  const ALLOWED = [
    ["GET", /^\/maint\/network\/common\/list$/],
    ["GET", /^\/maint\/statistic\/deviceinfo$/],
    ["GET", /^\/maint\/network\/model\/detail$/],
    ["POST", /^\/maint\/devices\/list$/],
    ["GET", /^\/maint\/device\/[^/]+$/],
    ["GET", /^\/network\/current\/user\/global\/page$/],
    ["GET", /^\/network\/current\/user\/statistical$/],
    ["GET", /^\/topology\/info\/\d+$/],
    ["GET", /^\/topology\/terminal\/info\/\d+$/],
    ["GET", /^\/topology\/generation\/record\/\d+$/],
    ["GET", /^\/topology\/link\/info$/],
    ["GET", /^\/warn\/warnlog$/],
    ["GET", /^\/operationlog\/list$/],
    ["GET", /^\/conf\/group\/\d+\/templates$/],
    ["GET", /^\/conf\/radio\/global\/config$/],
    ["GET", /^\/conf\/wifi_grp\/wifi$/],
    ["GET", /^\/device-ability\/list\/[^/]+$/],
    ["GET", /^\/device-ability$/],
    ["GET", /^\/sys\/current_performance$/],
    ["GET", /^\/device\/history\/onoff\/[^/]+$/],
    ["GET", /^\/gateway\/intf\/info\/[^/]+$/],
    ["GET", /^\/smartdiagnosis\/wan-detect\/device\/status$/],
    ["GET", /^\/egw\/conf\/device\/[^/]+\/port\/1$/],
    ["GET", /^\/egw\/conf\/device\/[^/]+\/vlan$/],
    ["GET", /^\/gateway\/intf\/unuseddhcp$/],
    ["GET", /^\/smartscene\/device\/switch\/ports$/],
    ["GET", /^\/smartscene\/device\/conf\/vlan$/],
    ["GET", /^\/switch\/uplinkport\/[^/]+$/],
    ["GET", /^\/switch\/neighbor\/[^/]+$/],
    ["GET", /^\/conf\/switch\/device\/[^/]+\/ports$/],
    ["GET", /^\/conf\/esw\/vlan_mode$/],
    ["GET", /^\/conf\/radio\/product_ability$/],
    ["GET", /^\/enet\/port\/conf$/],
    ["GET", /^\/enet\/vlan_list$/],
    ["GET", /^\/enet\/port\/list$/],
    ["GET", /^\/sta\/device\/user\/count$/],
    ["GET", /^\/sta\/bad_rssi_user_count$/],
    ["GET", /^\/nbc\/ap_lb\/conf$/],
    ["GET", /^\/enet\/airoam\/group\/\d+\/conf$/]
  ];

  const pathOf = api => new URL(api, location.origin).pathname;
  const isAllowed = (api, method = "GET") => ALLOWED.some(([m, pattern]) => m === method && pattern.test(pathOf(api)));

  async function call(api, { method = "GET", module = "default", querys = {}, params } = {}) {
    if (!isAllowed(api, method)) throw new Error(`Blocked non-whitelisted request: ${method} ${pathOf(api)}`);

    const envelope = {
      api,
      method,
      module,
      querys: { ...querys, lang: "en" },
      authParams: { api, method }
    };
    if (params !== undefined) envelope.params = params;

    const response = await fetch("/webproxy/common/api", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(envelope),
      signal: AbortSignal.timeout(20_000)
    });
    if (!response.ok) throw new Error(`${response.status} ${pathOf(api)}`);

    const data = await response.json();
    if (typeof data?.code === "number" && data.code !== 0) {
      throw new Error(`${pathOf(api)}: ${data.msg || `code ${data.code}`}`);
    }
    return data;
  }

  function redact(value, key = "") {
    if (SECRET_KEY.test(key)) return "[REDACTED]";
    if (Array.isArray(value)) return value.map(item => redact(item));
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, redact(child, childKey)]));
    }
    if (typeof value === "string") {
      return value.replace(/([?&](?:access_token|token|key|sig)=)[^&]+/gi, "$1[REDACTED]");
    }
    return value;
  }

  async function mapLimit(items, limit, fn) {
    const results = new Array(items.length);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await fn(items[index], index);
      }
    }));
    return results;
  }

  async function run() {
    const errors = [];
    const safe = async (name, fn) => {
      try { return await fn(); }
      catch (error) { errors.push({ section: name, error: error?.message || String(error) }); return null; }
    };

    const visibleProjectName = document.querySelector(".groupbar-name")?.textContent?.trim();
    if (!visibleProjectName) throw new Error("Open a project in Ruijie Cloud before exporting.");

    const projectsResponse = await call("/maint/network/common/list?page_index=1&page_size=999&version=1&include_fitap=true");
    const projects = projectsResponse.dataList || [];
    const matches = projects.filter(project => project.name === visibleProjectName);
    const project = matches.length === 1 ? matches[0] : projects.length === 1 ? projects[0] : null;
    if (!project) throw new Error(`Could not uniquely match the open project: ${visibleProjectName}`);

    const groupId = project.buildingId;
    const deviceResponse = await call("/maint/devices/list?page=1&per_page=9999", {
      method: "POST",
      params: { groupId, commonType: "" }
    });
    const devices = deviceResponse.deviceList || [];
    const encodedGroup = encodeURIComponent(groupId);
    const now = Date.now();
    const dayAgo = now - 86_400_000;

    const clients = await safe("clients", async () => {
      const response = await call("/network/current/user/global/page", {
        module: "logbiz",
        querys: { group_id: groupId, page_index: 1, page_size: 9999 }
      });
      return response.list || [];
    });

    const templates = await safe("wireless.templates", () => call(`/conf/group/${encodedGroup}/templates`));
    const wifi = await mapLimit(templates?.tempList || [], 3, template => safe(`wireless.template.${template.id}`, () => call("/conf/wifi_grp/wifi", {
      querys: { group_id: groupId, conf_template_id: template.id }
    })));

    const deviceSnapshots = await mapLimit(devices, 4, async device => {
      const sn = encodeURIComponent(device.serialNumber);
      const type = String(device.commonType || device.productType || "").toUpperCase();
      const common = {
        inventory: device,
        detail: await safe(`${sn}.detail`, () => call(`/maint/device/${sn}`)),
        ability: await safe(`${sn}.ability`, () => call(`/device-ability/list/${sn}?businessId=DETAIL_PAGE&version=2`)),
        performance: await safe(`${sn}.performance`, () => call(`/sys/current_performance?sn=${sn}`, { module: "logbiz" })),
        onlineHistory24h: await safe(`${sn}.history`, () => call(`/device/history/onoff/${sn}?begin=${dayAgo}&end=${now}`)),
        topologyLinks: await safe(`${sn}.links`, () => call("/topology/link/info", { querys: { group_id: groupId, sn: device.serialNumber } }))
      };

      if (type.includes("GATEWAY")) {
        common.gateway = {
          interfaces: await safe(`${sn}.gateway.interfaces`, () => call(`/gateway/intf/info/${sn}`)),
          wanHealth: await safe(`${sn}.gateway.wanHealth`, () => call("/smartdiagnosis/wan-detect/device/status", { querys: { sn: device.serialNumber } })),
          portConfig: await safe(`${sn}.gateway.portConfig`, () => call(`/egw/conf/device/${sn}/port/1`)),
          vlans: await safe(`${sn}.gateway.vlans`, () => call(`/egw/conf/device/${sn}/vlan`)),
          unusedDhcp: await safe(`${sn}.gateway.unusedDhcp`, () => call(`/gateway/intf/unuseddhcp?sn=${sn}`))
        };
      } else if (type.includes("SWITCH")) {
        common.switch = {
          ports: await safe(`${sn}.switch.ports`, () => call(`/smartscene/device/switch/ports?sn=${sn}`)),
          portStatus: await safe(`${sn}.switch.portStatus`, () => call(`/conf/switch/device/${sn}/ports`, { querys: { page_size: 9999, page_index: 1, include_ag: true } })),
          vlans: await safe(`${sn}.switch.vlans`, () => call("/smartscene/device/conf/vlan", { querys: { sn: device.serialNumber } })),
          vlanMode: await safe(`${sn}.switch.vlanMode`, () => call("/conf/esw/vlan_mode", { querys: { sn: device.serialNumber } })),
          uplink: await safe(`${sn}.switch.uplink`, () => call(`/switch/uplinkport/${sn}`)),
          neighbors: await safe(`${sn}.switch.neighbors`, () => call(`/switch/neighbor/${sn}`, { querys: { page: 1, per_page: 9999 } }))
        };
      } else if (type.includes("AP") || type.includes("BRIDGE")) {
        common.wirelessDevice = {
          radioAbility: await safe(`${sn}.radioAbility`, () => call("/conf/radio/product_ability", { querys: { sn: device.serialNumber } })),
          ports: await safe(`${sn}.wireless.ports`, () => call(`/enet/port/conf?sn=${sn}`)),
          portStatus: await safe(`${sn}.wireless.portStatus`, () => call(`/enet/port/list?sn=${sn}`)),
          vlans: await safe(`${sn}.wireless.vlans`, () => call(`/enet/vlan_list?sn=${sn}`)),
          clientCount: await safe(`${sn}.wireless.clientCount`, () => call(`/sta/device/user/count?sn_list=${sn}`, { module: "logbiz" })),
          weakSignalClients: await safe(`${sn}.wireless.weakSignalClients`, () => call(`/sta/bad_rssi_user_count?sn=${sn}`, { module: "logbiz" }))
        };
      }
      return common;
    });

    const snapshot = redact({
      format: "ruijie-cloud-project-snapshot",
      version: 1,
      exportedAt: new Date().toISOString(),
      source: { origin: location.origin, projectName: visibleProjectName },
      project,
      summary: await safe("project.summary", () => call(`/maint/statistic/deviceinfo?group_id=${encodedGroup}`)),
      networkModel: await safe("project.networkModel", () => call(`/maint/network/model/detail?group_id=${encodedGroup}`)),
      topology: {
        generation: await safe("topology.generation", () => call(`/topology/generation/record/${encodedGroup}`)),
        tree: await safe("topology.tree", () => call(`/topology/info/${encodedGroup}?with_wired_terminal=true&with_terminal=false`)),
        terminals: await safe("topology.terminals", () => call(`/topology/terminal/info/${encodedGroup}`))
      },
      clients,
      clientStatistics: await safe("clients.statistics", () => call("/network/current/user/statistical", { module: "logbiz", querys: { group_id: groupId } })),
      wireless: {
        radio: await safe("wireless.radio", () => call("/conf/radio/global/config", { querys: { group_id: groupId } })),
        templates,
        wifi,
        loadBalancing: await safe("wireless.loadBalancing", () => call(`/nbc/ap_lb/conf?group_id=${encodedGroup}`)),
        aiRoaming: await safe("wireless.aiRoaming", () => call(`/enet/airoam/group/${encodedGroup}/conf`))
      },
      alarms: {
        active: await safe("alarms.active", () => call(`/warn/warnlog?group_id=${encodedGroup}&page=1&per_page=9999&is_eliminate=false`)),
        cleared: await safe("alarms.cleared", () => call(`/warn/warnlog?group_id=${encodedGroup}&page=1&per_page=9999&is_eliminate=true`))
      },
      operationLog: await safe("operationLog", () => call(`/operationlog/list?start=${now - 30 * 86_400_000}&end=${now}&page=1&per_page=9999`)),
      devices: deviceSnapshots,
      errors
    });

    const safeName = visibleProjectName.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 80) || "project";
    const date = new Date().toISOString().slice(0, 10);
    return {
      filename: `ruijie-${safeName}-${date}.json`,
      json: JSON.stringify(snapshot, null, 2),
      summary: { devices: devices.length, clients: clients?.length || 0, errors: errors.length }
    };
  }

  window.__ruijieCloudExporter = { run, redact, isAllowed };
})();
