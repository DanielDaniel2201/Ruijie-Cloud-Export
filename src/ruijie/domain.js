const SECRET_KEY = /pass(word)?|pwd|psk|secret|token|cookie|credential|authorization|session.?id|private.?key|api.?key|community|user.?sig|access.?key/i;
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
  const AI_KEYS = {
    activeSec: "activeSeconds", cpuRate: "cpuUtilizationPercent", createTime: "createdAt",
    diskRate: "diskUtilizationPercent", downRate: "downloadRateBps", downlinkRate: "downlinkRateBps",
    eliminateTime: "eliminatedAt", flashRate: "flashUtilizationPercent", floorNoise: "noiseFloorDbm",
    flowDown: "downloadedBytes", flowUp: "uploadedBytes", flowUpDown: "totalBytes",
    inputRateBits: "inputRateBps", lastOnline: "lastOnlineAt", memoryRate: "memoryUtilizationPercent",
    mloRssi: "mloRssiDbm", onlineTime: "onlineAt", outputRateBits: "outputRateBps",
    pktLoseRate: "packetLossPercent", rssi: "rssiDbm", timeDelay: "latencyMs", upRate: "uploadRateBps",
    updateTime: "updatedAt", uplinkRate: "uplinkRateBps", utilization: "utilizationPercent"
  };
  const TIMESTAMPS = new Set(["createTime", "eliminateTime", "lastOnline", "onlineTime", "updateTime"]);
  const UNIT_VALUES = new Set(Object.keys(AI_KEYS).filter(key => !TIMESTAMPS.has(key)));
  const INFO_SECTIONS = ["detail", "ability", "performance", "history", "topology"];
  const NETWORK_SECTIONS = {
    gateway: ["interfaces", "wan", "ports", "vlans", "dhcp"],
    switch: ["ports", "vlans", "vlanMode", "uplink", "neighbors"],
    wireless: ["radio", "ports", "vlans", "clients"],
    unknown: []
  };
  const WIRELESS_SECTIONS = ["radio", "wifi", "loadBalancing", "aiRoaming"];
  const PORTAL_SECTIONS = ["policies", "ability", "global", "ssids"];

  function pathOf(api) {
    if (typeof api !== "string" || !api.startsWith("/") || api.startsWith("//")) return "";
    try { return new URL(api, "https://ruijie.invalid").pathname; }
    catch { return ""; }
  }

  function isAllowed(api, method = "GET") {
    const path = pathOf(api);
    return Boolean(path) && ALLOWED.some(([allowedMethod, pattern]) => allowedMethod === method && pattern.test(path));
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

  function normalize(value, key = "") {
    if (value === undefined || value === null || value === "") return;
    if (value === "true" || value === "false") return value === "true";
    if (TIMESTAMPS.has(key) && /^\d{10,13}$/.test(String(value))) {
      const timestamp = Number(value);
      return new Date(timestamp < 1e12 ? timestamp * 1000 : timestamp).toISOString();
    }
    if (UNIT_VALUES.has(key) && typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
    if (Array.isArray(value)) {
      const items = value.map(item => normalize(item)).filter(item => item !== undefined);
      return items.length ? items : undefined;
    }
    if (value && typeof value === "object") {
      const response = value.code === 0;
      const entries = Object.entries(value)
        .filter(([childKey]) => !response || (childKey !== "code" && childKey !== "msg"))
        .map(([childKey, child]) => [AI_KEYS[childKey] || childKey, normalize(child, childKey)])
        .filter(([, child]) => child !== undefined);
      if (!entries.length) return;
      if (response && entries.length === 1 && (entries[0][0] === "data" || entries[0][0] === "list")) return entries[0][1];
      return Object.fromEntries(entries);
    }
    return value;
  }

  function kindOf(device) {
    const type = String(device.commonType || device.productType || "").toUpperCase();
    if (type.includes("GATEWAY")) return "gateway";
    if (type.includes("SWITCH")) return "switch";
    if (type.includes("AP") || type.includes("BRIDGE")) return "wireless";
    return "unknown";
  }

  function summarizeDevice(device) {
    const type = kindOf(device);
    return {
      sn: device.serialNumber,
      name: device.name || device.aliasName,
      model: device.productClass || device.productType,
      type,
      onlineStatus: device.onlineStatus,
      ip: device.localIp || device.cpeIp,
      mac: device.mac,
      availableInfoSections: INFO_SECTIONS,
      availableNetworkSections: NETWORK_SECTIONS[type]
    };
  }

  function requestedSections(value, available) {
    if (value === undefined) return available;
    if (!Array.isArray(value) || !value.length || value.some(section => typeof section !== "string")) {
      throw new Error("sections must be a non-empty array of strings.");
    }
    const sections = [...new Set(value)];
    const invalid = sections.filter(section => !available.includes(section));
    if (invalid.length) throw new Error(`Unsupported section(s): ${invalid.join(", ")}. Available: ${available.join(", ") || "none"}.`);
    return sections;
  }

  function boundedInteger(value, fallback, name, maximum) {
    const result = value ?? fallback;
    if (!Number.isInteger(result) || result < 1 || result > maximum) throw new Error(`${name} must be an integer from 1 to ${maximum}.`);
    return result;
  }

  function buildTopologyGraph(devices, topology) {
    const nodes = new Map();
    const links = new Map();
    const value = (...values) => values.find(item => item !== undefined && item !== null && item !== "");
    const addNode = node => {
      if (!node?.id) return;
      nodes.set(node.id, { ...nodes.get(node.id), ...Object.fromEntries(Object.entries(node).filter(([, item]) => item !== undefined)) });
    };
    const addDevice = raw => {
      const device = raw?.inventory || raw;
      const id = value(device?.serialNumber, device?.sn, device?.deviceSn);
      if (!id) return;
      addNode({
        id,
        kind: "device",
        name: value(device.name, device.aliasName),
        type: String(value(device.commonType, device.productType, "unknown")).toLowerCase(),
        model: value(device.productClass, device.productType),
        status: device.onlineStatus,
        ip: value(device.localIp, device.cpeIp),
        mac: device.mac
      });
      return id;
    };
    const addLink = link => {
      if (!link?.source || !link?.target || link.source === link.target) return;
      links.set(`${link.type}:${link.source}:${link.target}:${link.sourcePort || ""}:${link.targetPort || ""}`, link);
    };

    devices.forEach(addDevice);
    const walkTree = (item, parent) => {
      if (Array.isArray(item)) return item.forEach(child => walkTree(child, parent));
      if (!item || typeof item !== "object") return;
      const id = addDevice(item);
      if (parent && id) addLink({ source: parent, target: id, type: "infrastructure" });
      const children = value(item.children, item.childList, item.nodes);
      if (children) walkTree(children, id || parent);
    };
    walkTree(value(topology?.tree?.data, topology?.tree?.list), undefined);

    let unlinkedClients = 0;
    for (const group of topology?.terminals?.list || []) {
      for (const terminal of group.details || []) {
        const parent = value(terminal.linkedDevice, group.sn);
        const mac = terminal.mac?.toLowerCase();
        if (!mac || !parent || parent === "unknown") {
          unlinkedClients++;
          continue;
        }
        const id = `client:${mac}`;
        addNode({ id, kind: "client", name: value(terminal.userName, terminal.ip, mac), ip: terminal.ip, mac });
        addLink({ source: parent, target: id, type: "client", sourcePort: terminal.linkedPort });
      }
    }

    const generation = topology?.generation?.data;
    const available = generation?.currentHasTopo === true || generation?.currentHasTopo === "true";
    const reason = value(generation?.topoUnsupportedModel, generation?.noTopoReason, generation?.topoIncompleteReason);
    return {
      available,
      ...(reason ? { reason } : {}),
      nodes: [...nodes.values()],
      links: [...links.values()],
      unlinkedClientCount: unlinkedClients
    };
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

  function createRuijieDomain({ call: transport, getVisibleProjectName }) {
    if (typeof transport !== "function" || typeof getVisibleProjectName !== "function") throw new Error("Ruijie domain requires call and getVisibleProjectName functions.");

    async function call(api, options = {}) {
      const method = options.method || "GET";
      if (!isAllowed(api, method)) throw new Error(`Blocked non-whitelisted request: ${method} ${pathOf(api) || String(api)}`);
      return transport(api, options);
    }

    async function collectFields(fields) {
      return Object.fromEntries(await Promise.all(Object.entries(fields).map(async ([key, fn]) => [key, await fn()])));
    }

    async function collectSections(definitions, sections) {
      const errors = [];
      const values = await Promise.all(sections.map(async section => {
        try { return [section, await definitions[section]()]; }
        catch (error) {
          errors.push({ section, error: error?.message || String(error) });
          return [section, undefined];
        }
      }));
      return { ...Object.fromEntries(values), ...(errors.length ? { errors } : {}) };
    }

    async function resolveProject() {
      const visibleValue = getVisibleProjectName();
      const visibleProjectName = String((visibleValue && typeof visibleValue.then === "function" ? await visibleValue : visibleValue) || "").trim();
      if (!visibleProjectName) throw new Error("Open a project in Ruijie Cloud first.");
      const projectsResponse = await call("/maint/network/common/list?page_index=1&page_size=999&version=1&include_fitap=true");
      const projects = projectsResponse?.dataList || [];
      const matches = projects.filter(project => project.name === visibleProjectName);
      const project = matches.length === 1 ? matches[0] : projects.length === 1 ? projects[0] : null;
      if (!project) throw new Error(`Could not uniquely match the open project: ${visibleProjectName}`);
      const groupId = project.buildingId;
      const deviceResponse = await call("/maint/devices/list?page=1&per_page=9999", { method: "POST", params: { groupId, commonType: "" } });
      return { visibleProjectName, project, groupId, devices: deviceResponse?.deviceList || [] };
    }

    function findDevice(context, deviceSn) {
      if (typeof deviceSn !== "string" || !deviceSn || deviceSn.length > 128) throw new Error("deviceSn is required.");
      const device = context.devices.find(item => item.serialNumber === deviceSn);
      if (!device) throw new Error(`Device does not belong to the current project: ${deviceSn}`);
      return device;
    }

    async function getProjectContext(context) {
      const group = encodeURIComponent(context.groupId);
      return {
        project: context.project,
        devices: context.devices.map(summarizeDevice),
        ...await collectSections({
          summary: () => call(`/maint/statistic/deviceinfo?group_id=${group}`),
          networkModel: () => call(`/maint/network/model/detail?group_id=${group}`)
        }, ["summary", "networkModel"])
      };
    }

    async function getDeviceInfo(context, args) {
      const device = findDevice(context, args.deviceSn);
      const sn = encodeURIComponent(device.serialNumber);
      const now = Date.now();
      const sections = requestedSections(args.sections, INFO_SECTIONS);
      return {
        device: summarizeDevice(device),
        ...await collectSections({
          detail: () => call(`/maint/device/${sn}`),
          ability: () => call(`/device-ability/list/${sn}?businessId=DETAIL_PAGE&version=2`),
          performance: () => call(`/sys/current_performance?sn=${sn}`, { module: "logbiz" }),
          history: () => call(`/device/history/onoff/${sn}?begin=${now - 86_400_000}&end=${now}`),
          topology: () => call("/topology/link/info", { querys: { group_id: context.groupId, sn: device.serialNumber } })
        }, sections)
      };
    }

    async function getDeviceNetwork(context, args) {
      const device = findDevice(context, args.deviceSn);
      const type = kindOf(device);
      const available = NETWORK_SECTIONS[type];
      if (!available.length) throw new Error(`Network details are not supported for device type: ${type}`);
      const sections = requestedSections(args.sections, available);
      const sn = encodeURIComponent(device.serialNumber);
      const rawSn = device.serialNumber;
      const definitions = type === "gateway" ? {
        interfaces: () => call(`/gateway/intf/info/${sn}`),
        wan: () => call("/smartdiagnosis/wan-detect/device/status", { querys: { sn: rawSn } }),
        ports: () => call(`/egw/conf/device/${sn}/port/1`),
        vlans: () => call(`/egw/conf/device/${sn}/vlan`),
        dhcp: () => call(`/gateway/intf/unuseddhcp?sn=${sn}`)
      } : type === "switch" ? {
        ports: () => collectFields({
          configuration: () => call(`/smartscene/device/switch/ports?sn=${sn}`),
          status: () => call(`/conf/switch/device/${sn}/ports`, { querys: { page_size: 9999, page_index: 1, include_ag: true } })
        }),
        vlans: () => call("/smartscene/device/conf/vlan", { querys: { sn: rawSn } }),
        vlanMode: () => call("/conf/esw/vlan_mode", { querys: { sn: rawSn } }),
        uplink: () => call(`/switch/uplinkport/${sn}`),
        neighbors: () => call(`/switch/neighbor/${sn}`, { querys: { page: 1, per_page: 9999 } })
      } : {
        radio: () => call("/conf/radio/product_ability", { querys: { sn: rawSn } }),
        ports: () => collectFields({
          configuration: () => call(`/enet/port/conf?sn=${sn}`),
          status: () => call(`/enet/port/list?sn=${sn}`)
        }),
        vlans: () => call(`/enet/vlan_list?sn=${sn}`),
        clients: () => collectFields({
          count: () => call(`/sta/device/user/count?sn_list=${sn}`, { module: "logbiz" }),
          weakSignalCount: () => call(`/sta/bad_rssi_user_count?sn=${sn}`, { module: "logbiz" })
        })
      };
      return { device: summarizeDevice(device), ...await collectSections(definitions, sections) };
    }

    async function getAlarms(context, args) {
      const state = args.state ?? "active";
      if (state !== "active" && state !== "cleared") throw new Error("state must be active or cleared.");
      const limit = boundedInteger(args.limit, 50, "limit", 200);
      if (args.deviceSn !== undefined) findDevice(context, args.deviceSn);
      const group = encodeURIComponent(context.groupId);
      const response = await call(`/warn/warnlog?group_id=${group}&page=1&per_page=${limit}&is_eliminate=${state === "cleared"}`);
      return { state, ...(args.deviceSn ? { requestedDeviceSn: args.deviceSn } : {}), alarms: response };
    }

    async function getTopology(context, args) {
      if (args.includeClients !== undefined && typeof args.includeClients !== "boolean") throw new Error("includeClients must be a boolean.");
      const group = encodeURIComponent(context.groupId);
      const sections = ["generation", "tree", ...(args.includeClients ? ["terminals"] : [])];
      const raw = await collectSections({
        generation: () => call(`/topology/generation/record/${group}`),
        tree: () => call(`/topology/info/${group}?with_wired_terminal=true&with_terminal=false`),
        terminals: () => call(`/topology/terminal/info/${group}`)
      }, sections);
      const { errors, ...topology } = raw;
      return { ...buildTopologyGraph(context.devices, topology), ...(errors ? { errors } : {}) };
    }

    const clientDeviceSn = client => client.deviceSn || client.devSn || client.apSn || client.connectDeviceSn || client.linkedDevice || client.connectedDeviceId;
    const clientConnectionType = client => {
      if (client.isWireless === true || client.wireless === true) return "wireless";
      if (client.isWireless === false || client.wireless === false) return "wired";
      const value = String(client.connectionType || client.connectType || client.userType || client.clientType || client.accessType || "").toLowerCase();
      if (/wireless|wifi|wlan|(^|[^a-z])ap([^a-z]|$)/.test(value)) return "wireless";
      if (/wired|ethernet|lan/.test(value)) return "wired";
      return "unknown";
    };
    const isProblemClient = client => {
      const rssi = Number(client.rssi ?? client.rssiDbm);
      const loss = Number(client.pktLoseRate ?? client.packetLossPercent);
      const status = String(client.healthStatus || client.status || client.onlineStatus || "").toLowerCase();
      // ponytail: fixed RSSI threshold; make it configurable if field deployments need calibration.
      return client.badRssi === true || (Number.isFinite(rssi) && rssi <= -70) || (Number.isFinite(loss) && loss > 0) || /bad|poor|offline|abnormal|error/.test(status);
    };
    const summarizeClient = client => ({
      mac: client.mac,
      ip: client.ip,
      name: client.userName || client.alias || client.staModel,
      connectionType: clientConnectionType(client),
      connectedDeviceSn: clientDeviceSn(client),
      connectedDeviceName: client.deviceName,
      ssid: client.ssid,
      band: client.band,
      channel: client.channel,
      rssi: client.rssi ?? client.rssiDbm,
      pktLoseRate: client.pktLoseRate ?? client.packetLossPercent,
      activeSec: client.activeSec ?? client.activeSeconds,
      onlineTime: client.onlineTime ?? client.onlineAt
    });
    const normalizedMac = mac => String(mac || "").replace(/[^a-f\d]/gi, "").toLowerCase();

    async function getClients(context, args) {
      const type = args.type ?? "all";
      const scope = args.scope ?? "direct";
      if (!["all", "wired", "wireless"].includes(type)) throw new Error("type must be all, wired, or wireless.");
      if (!["direct", "subtree"].includes(scope)) throw new Error("scope must be direct or subtree.");
      if (args.onlyProblems !== undefined && typeof args.onlyProblems !== "boolean") throw new Error("onlyProblems must be a boolean.");
      if (scope === "subtree" && args.deviceSn === undefined) throw new Error("deviceSn is required for subtree scope.");
      if (args.deviceSn !== undefined) findDevice(context, args.deviceSn);
      const page = boundedInteger(args.page, 1, "page", 10_000);
      const limit = boundedInteger(args.limit, 50, "limit", 200);
      const querys = { group_id: context.groupId, page_index: page, page_size: limit };
      let descendants;

      if (args.deviceSn && scope === "direct") querys.linked_device = args.deviceSn;
      if (scope === "subtree") {
        descendants = new Set([args.deviceSn]);
        let found = false;
        const tree = await call(`/topology/info/${encodeURIComponent(context.groupId)}?with_wired_terminal=true&with_terminal=false`);
        const walk = (item, inside = false) => {
          if (Array.isArray(item)) return item.forEach(child => walk(child, inside));
          if (!item || typeof item !== "object") return;
          const sn = item.serialNumber || item.sn || item.deviceSn;
          const inSubtree = inside || sn === args.deviceSn;
          if (sn === args.deviceSn) found = true;
          if (inSubtree && sn) descendants.add(sn);
          walk(item.children || item.childList || item.nodes, inSubtree);
        };
        walk(tree.data || tree.list);
        if (!found) throw new Error(`Device is missing from the current topology: ${args.deviceSn}`);
      }

      const response = await call("/network/current/user/global/page", { module: "logbiz", querys });
      let clients = response.list || response.dataList || response.data?.list || [];
      const scanned = clients.length;
      if (descendants) clients = clients.filter(client => descendants.has(clientDeviceSn(client)));
      if (type !== "all") clients = clients.filter(client => clientConnectionType(client) === type);
      if (args.onlyProblems) clients = clients.filter(isProblemClient);
      const sourceTotal = Number(response.currentCount ?? response.totalCount);
      const hasMore = Number.isFinite(sourceTotal) ? page * limit < sourceTotal : scanned === limit;
      return {
        filters: { scope, type, onlyProblems: Boolean(args.onlyProblems), ...(args.deviceSn ? { deviceSn: args.deviceSn } : {}) },
        page,
        scanned,
        returned: clients.length,
        hasMore,
        ...(hasMore ? { nextPage: page + 1 } : {}),
        clients: clients.map(summarizeClient)
      };
    }

    async function getClientInfo(context, args) {
      const mac = normalizedMac(args.mac);
      if (mac.length !== 12) throw new Error("mac must be a valid 48-bit MAC address.");
      const response = await call("/network/current/user/global/page", {
        module: "logbiz",
        querys: { group_id: context.groupId, page_index: 1, page_size: 10, keyword: args.mac }
      });
      const matches = (response.list || response.dataList || response.data?.list || []).filter(client => normalizedMac(client.mac) === mac);
      if (matches.length !== 1) throw new Error(matches.length ? `MAC is not unique in the current project: ${args.mac}` : `Client not found in the current project: ${args.mac}`);
      return { client: matches[0] };
    }

    async function getOperationLogs(context, args) {
      const days = boundedInteger(args.days, 7, "days", 30);
      const limit = boundedInteger(args.limit, 50, "limit", 200);
      if (args.deviceSn !== undefined) findDevice(context, args.deviceSn);
      const now = Date.now();
      const response = await call(`/operationlog/list?start=${now - days * 86_400_000}&end=${now}&page=1&per_page=${limit}`);
      return { days, ...(args.deviceSn ? { requestedDeviceSn: args.deviceSn } : {}), logs: response };
    }

    async function getWirelessSettings(context, args) {
      const sections = requestedSections(args.sections, WIRELESS_SECTIONS);
      const group = encodeURIComponent(context.groupId);
      return collectSections({
        radio: () => call("/conf/radio/global/config", { querys: { group_id: context.groupId } }),
        wifi: async () => {
          const templates = await call(`/conf/group/${group}/templates`);
          const configurations = await mapLimit(templates.tempList || [], 3, template => call("/conf/wifi_grp/wifi", {
            querys: { group_id: context.groupId, conf_template_id: template.id }
          }));
          return { templates, configurations };
        },
        loadBalancing: () => call(`/nbc/ap_lb/conf?group_id=${group}`),
        aiRoaming: () => call(`/enet/airoam/group/${group}/conf`)
      }, sections);
    }

    async function getPortalAuth(context, args) {
      const sections = requestedSections(args.sections, PORTAL_SECTIONS);
      const limit = boundedInteger(args.limit, 100, "limit", 200);
      const group = encodeURIComponent(context.groupId);
      return collectSections({
        policies: () => call(`/intl/auth/v2/policy/${group}?page_index=1&page_size=${limit}`, { querys: { show_temp_nbr: 1 } }),
        ability: () => call(`/intl/auth/v2/ability/${group}`, { querys: { show_temp_nbr: 1 } }),
        global: () => call(`/intl/auth/v2/global/${group}`),
        ssids: () => call(`/intl/auth/v2/group/${group}/ssids`)
      }, sections);
    }

    async function invoke(command, args = {}) {
      if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("Command arguments must be an object.");
      const handlers = {
        projectContext: getProjectContext,
        deviceInfo: getDeviceInfo,
        deviceNetwork: getDeviceNetwork,
        alarms: getAlarms,
        topology: getTopology,
        clients: getClients,
        clientInfo: getClientInfo,
        operationLogs: getOperationLogs,
        wirelessSettings: getWirelessSettings,
        portalAuth: getPortalAuth
      };
      const handler = handlers[command];
      if (!handler) throw new Error(`Unknown command: ${command}`);
      return redact(normalize(await handler(await resolveProject(), args)));
    }

    return {
      call, resolveProject, getProjectContext, getDeviceInfo, getDeviceNetwork, getAlarms,
      getTopology, getClients, getClientInfo, getOperationLogs, getWirelessSettings, getPortalAuth, invoke
    };
  }

export { ALLOWED, INFO_SECTIONS, NETWORK_SECTIONS, PORTAL_SECTIONS, WIRELESS_SECTIONS, buildTopologyGraph, createRuijieDomain, isAllowed, kindOf, normalize, redact, requestedSections, summarizeDevice };
