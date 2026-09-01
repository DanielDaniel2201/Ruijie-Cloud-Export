(() => {
  if (window.__ruijieCloudExporter?.getProgress?.().running) return;

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
    ["GET", /^\/intl\/auth\/v2\/(?:policy|ability|global)\/\d+$/],
    ["GET", /^\/intl\/auth\/v2\/group\/\d+\/ssids$/],
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

  const progress = { items: [], current: -1, completed: 0, running: false, canceled: false, error: null, result: null };
  let controller;
  const getProgress = () => ({ ...progress, items: [...progress.items] });

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
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20_000)])
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

  async function run(selected) {
    if (progress.running) throw new Error("An export is already running.");
    const wants = key => !selected || selected.includes(key);
    controller = new AbortController();
    Object.assign(progress, { items: [], current: -1, completed: 0, running: true, canceled: false, error: null, result: null });
    const errors = [];
    const safe = async (name, fn) => {
      try { return await fn(); }
      catch (error) {
        if (progress.canceled) throw error;
        errors.push({ section: name, error: error?.message || String(error) });
        return null;
      }
    };

    try {

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

    progress.items = [
      ...(wants("clients.data") ? ["Client data"] : []),
      ...(wants("wireless.templates") ? ["Wireless templates"] : []),
      ...(wants("devices") ? devices.map((device, index) => `Device ${index + 1}: ${device.name || device.serialNumber || "Unknown"}`) : []),
      ...(wants("project.overview") ? ["Project overview"] : []),
      ...(wants("topology") ? ["Topology"] : []),
      ...(wants("clients.statistics") ? ["Client statistics"] : []),
      ...(wants("wireless.settings") ? ["Wireless settings"] : []),
      ...(wants("portalAuth") ? ["Portal authentication"] : []),
      ...(wants("alarms.active") ? ["Active alarms"] : []),
      ...(wants("alarms.cleared") ? ["Cleared alarms"] : []),
      ...(wants("operationLog") ? ["Operation log"] : [])
    ];
    const exportItem = async fn => {
      const index = ++progress.current;
      try { return await fn(); }
      finally { progress.completed = index + 1; }
    };

    const clients = wants("clients.data") ? await exportItem(() => safe("clients", async () => {
      const response = await call("/network/current/user/global/page", {
        module: "logbiz",
        querys: { group_id: groupId, page_index: 1, page_size: 9999 }
      });
      return response.list || [];
    })) : undefined;

    const wirelessTemplates = wants("wireless.templates") ? await exportItem(async () => {
      const templates = await safe("wireless.templates", () => call(`/conf/group/${encodedGroup}/templates`));
      const wifi = await mapLimit(templates?.tempList || [], 3, template => safe(`wireless.template.${template.id}`, () => call("/conf/wifi_grp/wifi", {
        querys: { group_id: groupId, conf_template_id: template.id }
      })));
      return { templates, wifi };
    }) : undefined;

    const deviceSnapshots = [];
    if (wants("devices")) for (const device of devices) deviceSnapshots.push(await exportItem(async () => {
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
    }));

    const projectOverview = wants("project.overview") ? await exportItem(async () => ({
      summary: await safe("project.summary", () => call(`/maint/statistic/deviceinfo?group_id=${encodedGroup}`)),
      networkModel: await safe("project.networkModel", () => call(`/maint/network/model/detail?group_id=${encodedGroup}`))
    })) : undefined;
    const topology = wants("topology") ? await exportItem(async () => ({
      generation: await safe("topology.generation", () => call(`/topology/generation/record/${encodedGroup}`)),
      tree: await safe("topology.tree", () => call(`/topology/info/${encodedGroup}?with_wired_terminal=true&with_terminal=false`)),
      terminals: await safe("topology.terminals", () => call(`/topology/terminal/info/${encodedGroup}`))
    })) : undefined;
    const clientStatistics = wants("clients.statistics") ? await exportItem(() => safe("clients.statistics", () => call("/network/current/user/statistical", { module: "logbiz", querys: { group_id: groupId } }))) : undefined;
    const wirelessSettings = wants("wireless.settings") ? await exportItem(async () => ({
      radio: await safe("wireless.radio", () => call("/conf/radio/global/config", { querys: { group_id: groupId } })),
      loadBalancing: await safe("wireless.loadBalancing", () => call(`/nbc/ap_lb/conf?group_id=${encodedGroup}`)),
      aiRoaming: await safe("wireless.aiRoaming", () => call(`/enet/airoam/group/${encodedGroup}/conf`))
    })) : undefined;
    const portalAuth = wants("portalAuth") ? await exportItem(async () => ({
      policies: await safe("portalAuth.policies", () => call(`/intl/auth/v2/policy/${encodedGroup}?page_index=1&page_size=9999`, { querys: { show_temp_nbr: 1 } })),
      ability: await safe("portalAuth.ability", () => call(`/intl/auth/v2/ability/${encodedGroup}`, { querys: { show_temp_nbr: 1 } })),
      global: await safe("portalAuth.global", () => call(`/intl/auth/v2/global/${encodedGroup}`)),
      ssids: await safe("portalAuth.ssids", () => call(`/intl/auth/v2/group/${encodedGroup}/ssids`))
    })) : undefined;
    const activeAlarms = wants("alarms.active") ? await exportItem(() => safe("alarms.active", () => call(`/warn/warnlog?group_id=${encodedGroup}&page=1&per_page=9999&is_eliminate=false`))) : undefined;
    const clearedAlarms = wants("alarms.cleared") ? await exportItem(() => safe("alarms.cleared", () => call(`/warn/warnlog?group_id=${encodedGroup}&page=1&per_page=9999&is_eliminate=true`))) : undefined;
    const operationLog = wants("operationLog") ? await exportItem(() => safe("operationLog", () => call(`/operationlog/list?start=${now - 30 * 86_400_000}&end=${now}&page=1&per_page=9999`))) : undefined;

    const snapshot = redact({
      format: "ruijie-cloud-project-snapshot",
      version: 1,
      exportedAt: new Date().toISOString(),
      source: { origin: location.origin, projectName: visibleProjectName },
      project,
      summary: projectOverview?.summary,
      networkModel: projectOverview?.networkModel,
      topology,
      clients,
      clientStatistics,
      wireless: wirelessSettings || wirelessTemplates ? { ...wirelessSettings, ...wirelessTemplates } : undefined,
      portalAuth,
      alarms: wants("alarms.active") || wants("alarms.cleared") ? { active: activeAlarms, cleared: clearedAlarms } : undefined,
      operationLog,
      devices: wants("devices") ? deviceSnapshots : undefined,
      errors
    });

    const safeName = visibleProjectName.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 80) || "project";
    const date = new Date().toISOString().slice(0, 10);
    return {
      filename: `ruijie-${safeName}-${date}.json`,
      json: JSON.stringify(snapshot, null, 2),
      summary: { devices: wants("devices") ? devices.length : 0, clients: clients?.length || 0, errors: errors.length }
    };
    } finally {
      progress.running = false;
      controller = undefined;
    }
  }

  async function start(selected) {
    try {
      const result = await run(selected);
      const url = URL.createObjectURL(new Blob([result.json], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      progress.result = result.summary;
    } catch (error) {
      if (!progress.canceled) progress.error = error?.message || String(error);
    }
  }

  function cancel() {
    if (!progress.running) return false;
    progress.canceled = true;
    controller.abort();
    return true;
  }

  window.__ruijieCloudExporter = { run, start, cancel, redact, isAllowed, getProgress };
})();
