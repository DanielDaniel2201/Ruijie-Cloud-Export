(() => {
  if (window.__ruijieCloudExporter?.getProgress?.().running) return;

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

  const progress = { items: [], current: -1, completed: 0, completedDurationMs: 0, itemStartedAt: null, running: false, startedAt: null, canceled: false, error: null, result: null };
  const REQUEST_CONCURRENCY = 8;
  const DEVICE_CONCURRENCY = 6;
  const requestQueue = [];
  let activeRequests = 0;
  let controller;
  const getProgress = () => ({ ...progress, items: [...progress.items] });
  const notifyExportState = running => window.postMessage?.({ type: "ruijie-export-state", running }, location.origin);

  const pathOf = api => new URL(api, location.origin).pathname;
  const isAllowed = (api, method = "GET") => ALLOWED.some(([m, pattern]) => m === method && pattern.test(pathOf(api)));

  async function call(api, { method = "GET", module = "default", querys = {}, params } = {}) {
    if (!isAllowed(api, method)) throw new Error(`Blocked non-whitelisted request: ${method} ${pathOf(api)}`);
    const runSignal = controller?.signal;
    if (activeRequests >= REQUEST_CONCURRENCY) await new Promise(resolve => requestQueue.push(resolve));
    else activeRequests++;
    try {
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
        signal: runSignal ? AbortSignal.any([runSignal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000)
      });
      if (!response.ok) throw new Error(`${response.status} ${pathOf(api)}`);

      const data = await response.json();
      if (typeof data?.code === "number" && data.code !== 0) throw new Error(`${pathOf(api)}: code ${data.code}`);
      return data;
    } finally {
      const next = requestQueue.shift();
      if (next) next();
      else activeRequests--;
    }
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

  const AI_KEYS = {
    activeSec: "activeSeconds",
    cpuRate: "cpuUtilizationPercent",
    createTime: "createdAt",
    diskRate: "diskUtilizationPercent",
    downRate: "downloadRateBps",
    downlinkRate: "downlinkRateBps",
    eliminateTime: "eliminatedAt",
    flashRate: "flashUtilizationPercent",
    floorNoise: "noiseFloorDbm",
    flowDown: "downloadedBytes",
    flowUp: "uploadedBytes",
    flowUpDown: "totalBytes",
    inputRateBits: "inputRateBps",
    lastOnline: "lastOnlineAt",
    memoryRate: "memoryUtilizationPercent",
    mloRssi: "mloRssiDbm",
    onlineTime: "onlineAt",
    outputRateBits: "outputRateBps",
    pktLoseRate: "packetLossPercent",
    rssi: "rssiDbm",
    timeDelay: "latencyMs",
    upRate: "uploadRateBps",
    updateTime: "updatedAt",
    uplinkRate: "uplinkRateBps",
    utilization: "utilizationPercent"
  };
  const TIMESTAMPS = new Set(["createTime", "eliminateTime", "lastOnline", "onlineTime", "updateTime"]);
  const UNIT_VALUES = new Set(Object.keys(AI_KEYS).filter(key => !TIMESTAMPS.has(key)));

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

  function mergeClients(clients, terminals) {
    const byMac = new Map((clients || []).map((client, index) => [client.mac?.replace(/[^a-f\d]/gi, "").toLowerCase() || `missing:${index}`, client]));
    for (const group of terminals?.list || []) {
      for (const terminal of group.details || []) {
        const key = terminal.mac?.replace(/[^a-f\d]/gi, "").toLowerCase();
        if (!key) continue;
        const connectedDeviceId = terminal.linkedDevice || (group.sn !== "unknown" ? group.sn : undefined);
        byMac.set(key, { ...byMac.get(key), ...terminal, ...(connectedDeviceId ? { connectedDeviceId } : {}) });
      }
    }
    return [...byMac.values()];
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
      const key = `${link.type}:${link.source}:${link.target}:${link.sourcePort || ""}:${link.targetPort || ""}`;
      links.set(key, link);
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

    devices.forEach(raw => {
      const fallbackSource = addDevice(raw);
      for (const link of raw?.topologyLinks?.list || []) {
        const source = value(link.sourceSn, link.srcSn, link.localSn, link.fromSn, fallbackSource);
        const target = value(link.targetSn, link.dstSn, link.remoteSn, link.peerSn, link.linkedSn);
        if (!source || !target) continue;
        addNode({ id: source, kind: "device" });
        addNode({ id: target, kind: "device" });
        addLink({
          source,
          target,
          type: "infrastructure",
          sourcePort: value(link.sourcePort, link.srcPort, link.localPort),
          targetPort: value(link.targetPort, link.dstPort, link.remotePort, link.peerPort),
          status: link.status,
          speed: link.speed
        });
      }
    });

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

  const collectFields = async fields => Object.fromEntries(await Promise.all(
    Object.entries(fields).map(async ([key, fn]) => [key, await fn()])
  ));

  async function resolveProject() {
    const visibleProjectName = document.querySelector(".groupbar-name")?.textContent?.trim();
    if (!visibleProjectName) throw new Error("Open a project in Ruijie Cloud first.");

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
    return { visibleProjectName, project, groupId, devices: deviceResponse.deviceList || [] };
  }

  const kindOf = device => {
    const type = String(device.commonType || device.productType || "").toUpperCase();
    if (type.includes("GATEWAY")) return "gateway";
    if (type.includes("SWITCH")) return "switch";
    if (type.includes("AP") || type.includes("BRIDGE")) return "wireless";
    return "unknown";
  };
  const NETWORK_SECTIONS = {
    gateway: ["interfaces", "wan", "ports", "vlans", "dhcp"],
    switch: ["ports", "vlans", "vlanMode", "uplink", "neighbors"],
    wireless: ["radio", "ports", "vlans", "clients"],
    unknown: []
  };
  const INFO_SECTIONS = ["detail", "ability", "performance", "history", "topology"];
  const WIRELESS_SECTIONS = ["radio", "wifi", "loadBalancing", "aiRoaming"];
  const PORTAL_SECTIONS = ["policies", "ability", "global", "ssids"];

  function summarizeDevice(device) {
    const kind = kindOf(device);
    return {
      sn: device.serialNumber,
      name: device.name || device.aliasName,
      model: device.productClass || device.productType,
      type: kind,
      onlineStatus: device.onlineStatus,
      ip: device.localIp || device.cpeIp,
      mac: device.mac,
      availableInfoSections: INFO_SECTIONS,
      availableNetworkSections: NETWORK_SECTIONS[kind]
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

  async function collectToolSections(definitions, sections) {
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

  function findDevice(context, deviceSn) {
    if (typeof deviceSn !== "string" || !deviceSn || deviceSn.length > 128) throw new Error("deviceSn is required.");
    const device = context.devices.find(item => item.serialNumber === deviceSn);
    if (!device) throw new Error(`Device does not belong to the current project: ${deviceSn}`);
    return device;
  }

  async function getProjectContext(context) {
    const encodedGroup = encodeURIComponent(context.groupId);
    return {
      project: context.project,
      devices: context.devices.map(summarizeDevice),
      ...await collectToolSections({
        summary: () => call(`/maint/statistic/deviceinfo?group_id=${encodedGroup}`),
        networkModel: () => call(`/maint/network/model/detail?group_id=${encodedGroup}`)
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
      ...await collectToolSections({
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
    const kind = kindOf(device);
    const available = NETWORK_SECTIONS[kind];
    if (!available.length) throw new Error(`Network details are not supported for device type: ${kind}`);
    const sections = requestedSections(args.sections, available);
    const sn = encodeURIComponent(device.serialNumber);
    const rawSn = device.serialNumber;
    const definitions = kind === "gateway" ? {
      interfaces: () => call(`/gateway/intf/info/${sn}`),
      wan: () => call("/smartdiagnosis/wan-detect/device/status", { querys: { sn: rawSn } }),
      ports: () => call(`/egw/conf/device/${sn}/port/1`),
      vlans: () => call(`/egw/conf/device/${sn}/vlan`),
      dhcp: () => call(`/gateway/intf/unuseddhcp?sn=${sn}`)
    } : kind === "switch" ? {
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
    return { device: summarizeDevice(device), ...await collectToolSections(definitions, sections) };
  }

  async function getAlarms(context, args) {
    const state = args.state ?? "active";
    if (state !== "active" && state !== "cleared") throw new Error("state must be active or cleared.");
    const limit = boundedInteger(args.limit, 50, "limit", 200);
    if (args.deviceSn !== undefined) findDevice(context, args.deviceSn);
    const encodedGroup = encodeURIComponent(context.groupId);
    const response = await call(`/warn/warnlog?group_id=${encodedGroup}&page=1&per_page=${limit}&is_eliminate=${state === "cleared"}`);
    return { state, ...(args.deviceSn ? { requestedDeviceSn: args.deviceSn } : {}), alarms: response };
  }

  async function getTopology(context, args) {
    if (args.includeClients !== undefined && typeof args.includeClients !== "boolean") throw new Error("includeClients must be a boolean.");
    const encodedGroup = encodeURIComponent(context.groupId);
    const sections = ["generation", "tree", ...(args.includeClients ? ["terminals"] : [])];
    const raw = await collectToolSections({
      generation: () => call(`/topology/generation/record/${encodedGroup}`),
      tree: () => call(`/topology/info/${encodedGroup}?with_wired_terminal=true&with_terminal=false`),
      terminals: () => call(`/topology/terminal/info/${encodedGroup}`)
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
    // ponytail: fixed RSSI threshold, make it configurable if field deployments need calibration.
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
    const encodedGroup = encodeURIComponent(context.groupId);
    return collectToolSections({
      radio: () => call("/conf/radio/global/config", { querys: { group_id: context.groupId } }),
      wifi: async () => {
        const templates = await call(`/conf/group/${encodedGroup}/templates`);
        const configurations = await mapLimit(templates.tempList || [], 3, template => call("/conf/wifi_grp/wifi", {
          querys: { group_id: context.groupId, conf_template_id: template.id }
        }));
        return { templates, configurations };
      },
      loadBalancing: () => call(`/nbc/ap_lb/conf?group_id=${encodedGroup}`),
      aiRoaming: () => call(`/enet/airoam/group/${encodedGroup}/conf`)
    }, sections);
  }

  async function getPortalAuth(context, args) {
    const sections = requestedSections(args.sections, PORTAL_SECTIONS);
    const limit = boundedInteger(args.limit, 100, "limit", 200);
    const encodedGroup = encodeURIComponent(context.groupId);
    return collectToolSections({
      policies: () => call(`/intl/auth/v2/policy/${encodedGroup}?page_index=1&page_size=${limit}`, { querys: { show_temp_nbr: 1 } }),
      ability: () => call(`/intl/auth/v2/ability/${encodedGroup}`, { querys: { show_temp_nbr: 1 } }),
      global: () => call(`/intl/auth/v2/global/${encodedGroup}`),
      ssids: () => call(`/intl/auth/v2/group/${encodedGroup}/ssids`)
    }, sections);
  }

  async function invokeTool(toolName, args = {}) {
    if (progress.running) throw new Error("Wait for the current export to finish.");
    if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("Tool arguments must be an object.");
    const handlers = {
      get_project_context: getProjectContext,
      get_device_info: getDeviceInfo,
      get_device_network: getDeviceNetwork,
      get_alarms: getAlarms,
      get_topology: getTopology,
      get_clients: getClients,
      get_client_info: getClientInfo,
      get_operation_logs: getOperationLogs,
      get_wireless_settings: getWirelessSettings,
      get_portal_auth: getPortalAuth
    };
    const handler = handlers[toolName];
    if (!handler) throw new Error(`Unknown tool: ${toolName}`);
    const context = await resolveProject();
    return redact(normalize(await handler(context, args)));
  }

  async function run(selected) {
    if (progress.running) throw new Error("An export is already running.");
    const wants = key => !selected || selected.includes(key);
    controller = new AbortController();
    Object.assign(progress, { items: [], current: -1, completed: 0, completedDurationMs: 0, itemStartedAt: null, running: true, startedAt: null, canceled: false, error: null, result: null });
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
    notifyExportState(true);

    const { visibleProjectName, project, groupId, devices } = await resolveProject();
    const encodedGroup = encodeURIComponent(groupId);
    const now = Date.now();
    const dayAgo = now - 86_400_000;

    progress.items = [
      ...(wants("clients.data") ? ["Client data"] : []),
      ...(wants("wireless.templates") ? ["Wireless templates"] : []),
      ...(wants("devices") ? ["Devices"] : []),
      ...(wants("project.overview") ? ["Project overview"] : []),
      ...(wants("topology") ? ["Topology"] : []),
      ...(wants("clients.statistics") ? ["Client statistics"] : []),
      ...(wants("wireless.settings") ? ["Wireless settings"] : []),
      ...(wants("portalAuth") ? ["Portal authentication"] : []),
      ...(wants("alarms.active") ? ["Active alarms"] : []),
      ...(wants("alarms.cleared") ? ["Cleared alarms"] : []),
      ...(wants("operationLog") ? ["Operation log"] : [])
    ];
    progress.startedAt = Date.now();
    const exportItem = async fn => {
      const index = ++progress.current;
      progress.itemStartedAt = Date.now();
      try { return await fn(); }
      finally {
        progress.completedDurationMs += Date.now() - progress.itemStartedAt;
        progress.itemStartedAt = null;
        progress.completed = index + 1;
      }
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
    const collectDevice = async device => {
      const sn = encodeURIComponent(device.serialNumber);
      const type = String(device.commonType || device.productType || "").toUpperCase();
      const common = {
        inventory: device,
        ...await collectFields({
          detail: () => safe(`${sn}.detail`, () => call(`/maint/device/${sn}`)),
          ability: () => safe(`${sn}.ability`, () => call(`/device-ability/list/${sn}?businessId=DETAIL_PAGE&version=2`)),
          performance: () => safe(`${sn}.performance`, () => call(`/sys/current_performance?sn=${sn}`, { module: "logbiz" })),
          onlineHistory24h: () => safe(`${sn}.history`, () => call(`/device/history/onoff/${sn}?begin=${dayAgo}&end=${now}`)),
          topologyLinks: () => safe(`${sn}.links`, () => call("/topology/link/info", { querys: { group_id: groupId, sn: device.serialNumber } }))
        })
      };

      if (type.includes("GATEWAY")) {
        common.gateway = await collectFields({
          interfaces: () => safe(`${sn}.gateway.interfaces`, () => call(`/gateway/intf/info/${sn}`)),
          wanHealth: () => safe(`${sn}.gateway.wanHealth`, () => call("/smartdiagnosis/wan-detect/device/status", { querys: { sn: device.serialNumber } })),
          portConfig: () => safe(`${sn}.gateway.portConfig`, () => call(`/egw/conf/device/${sn}/port/1`)),
          vlans: () => safe(`${sn}.gateway.vlans`, () => call(`/egw/conf/device/${sn}/vlan`)),
          unusedDhcp: () => safe(`${sn}.gateway.unusedDhcp`, () => call(`/gateway/intf/unuseddhcp?sn=${sn}`))
        });
      } else if (type.includes("SWITCH")) {
        common.switch = await collectFields({
          ports: () => safe(`${sn}.switch.ports`, () => call(`/smartscene/device/switch/ports?sn=${sn}`)),
          portStatus: () => safe(`${sn}.switch.portStatus`, () => call(`/conf/switch/device/${sn}/ports`, { querys: { page_size: 9999, page_index: 1, include_ag: true } })),
          vlans: () => safe(`${sn}.switch.vlans`, () => call("/smartscene/device/conf/vlan", { querys: { sn: device.serialNumber } })),
          vlanMode: () => safe(`${sn}.switch.vlanMode`, () => call("/conf/esw/vlan_mode", { querys: { sn: device.serialNumber } })),
          uplink: () => safe(`${sn}.switch.uplink`, () => call(`/switch/uplinkport/${sn}`)),
          neighbors: () => safe(`${sn}.switch.neighbors`, () => call(`/switch/neighbor/${sn}`, { querys: { page: 1, per_page: 9999 } }))
        });
      } else if (type.includes("AP") || type.includes("BRIDGE")) {
        common.wirelessDevice = await collectFields({
          radioAbility: () => safe(`${sn}.radioAbility`, () => call("/conf/radio/product_ability", { querys: { sn: device.serialNumber } })),
          ports: () => safe(`${sn}.wireless.ports`, () => call(`/enet/port/conf?sn=${sn}`)),
          portStatus: () => safe(`${sn}.wireless.portStatus`, () => call(`/enet/port/list?sn=${sn}`)),
          vlans: () => safe(`${sn}.wireless.vlans`, () => call(`/enet/vlan_list?sn=${sn}`)),
          clientCount: () => safe(`${sn}.wireless.clientCount`, () => call(`/sta/device/user/count?sn_list=${sn}`, { module: "logbiz" })),
          weakSignalClients: () => safe(`${sn}.wireless.weakSignalClients`, () => call(`/sta/bad_rssi_user_count?sn=${sn}`, { module: "logbiz" }))
        });
      }
      return common;
    };
    if (wants("devices")) deviceSnapshots.push(...await exportItem(async () => {
      const item = progress.current;
      let completed = 0;
      return mapLimit(devices, DEVICE_CONCURRENCY, async device => {
        try { return await collectDevice(device); }
        finally { progress.items[item] = `Devices ${++completed}/${devices.length}`; }
      });
    }));

    const projectOverview = wants("project.overview") ? await exportItem(async () => ({
      summary: await safe("project.summary", () => call(`/maint/statistic/deviceinfo?group_id=${encodedGroup}`)),
      networkModel: await safe("project.networkModel", () => call(`/maint/network/model/detail?group_id=${encodedGroup}`))
    })) : undefined;
    const topologyRaw = wants("topology") ? await exportItem(async () => {
      const raw = {
        generation: await safe("topology.generation", () => call(`/topology/generation/record/${encodedGroup}`)),
        tree: await safe("topology.tree", () => call(`/topology/info/${encodedGroup}?with_wired_terminal=true&with_terminal=false`)),
        terminals: await safe("topology.terminals", () => call(`/topology/terminal/info/${encodedGroup}`))
      };
      return raw;
    }) : undefined;
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

    const snapshot = redact(normalize({
      format: "ruijie-cloud-project-snapshot",
      version: 2,
      exportedAt: new Date().toISOString(),
      source: { origin: location.origin, projectName: visibleProjectName },
      project,
      summary: projectOverview?.summary,
      networkModel: projectOverview?.networkModel,
      topology: topologyRaw ? buildTopologyGraph(deviceSnapshots.length ? deviceSnapshots : devices, topologyRaw) : undefined,
      clients: clients ? mergeClients(clients, topologyRaw?.terminals) : undefined,
      clientStatistics,
      wireless: wirelessSettings || wirelessTemplates ? { ...wirelessSettings, ...wirelessTemplates } : undefined,
      portalAuth,
      alarms: wants("alarms.active") || wants("alarms.cleared") ? { active: activeAlarms, cleared: clearedAlarms } : undefined,
      operationLog,
      devices: wants("devices") ? deviceSnapshots : undefined,
      errors
    }));

    const safeName = visibleProjectName.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 80) || "project";
    const date = new Date().toISOString().slice(0, 10);
    return {
      filename: `ruijie-${safeName}-${date}.json`,
      json: JSON.stringify(snapshot),
      summary: { devices: wants("devices") ? devices.length : 0, clients: clients?.length || 0, errors: errors.length }
    };
    } finally {
      progress.running = false;
      controller = undefined;
      notifyExportState(false);
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

  window.__ruijieCloudExporter = { run, start, cancel, invokeTool, redact, isAllowed, getProgress, buildTopologyGraph, mergeClients, normalize };
})();
