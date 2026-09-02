import { cli, Strategy } from '@jackwener/opencli/registry';
import { ArgumentError, AuthRequiredError, CommandExecutionError, EmptyResultError } from '@jackwener/opencli/errors';
import { createRuijieDomain } from './domain.js';
import { parseRuijieProjectUrl } from './url.js';

const urlArg = {
  name: 'url',
  type: 'string',
  help: 'Full Ruijie Cloud project URL copied from Chrome. Required on the first command or when switching projects; later commands on the same adapter tab may omit it.',
};

function sections(value) {
  if (value === undefined) return undefined;
  const result = String(value).split(',').map(item => item.trim());
  if (!result.length || result.some(item => !item)) throw new ArgumentError('sections must contain non-empty comma-separated section names.');
  return result;
}

function asArgumentError(error) {
  const message = error?.message || String(error);
  throw new ArgumentError(message);
}

async function currentPageUrl(page) {
  if (typeof page.getCurrentUrl === 'function') {
    const url = await page.getCurrentUrl().catch(() => '');
    if (url) return url;
  }
  return page.evaluate(() => location.href);
}

async function ensureProjectPage(page, urlArgValue) {
  if (urlArgValue !== undefined && urlArgValue !== null && String(urlArgValue).trim() !== '') {
    let parsed;
    try {
      parsed = parseRuijieProjectUrl(urlArgValue);
    } catch (error) {
      asArgumentError(error);
    }
    await page.goto(parsed.href);
    return parsed;
  }
  const current = await currentPageUrl(page);
  try {
    return parseRuijieProjectUrl(current);
  } catch {
    throw new ArgumentError('Pass --url with the Ruijie Cloud project page copied from Chrome. The adapter tab is not on a Ruijie Cloud project yet.');
  }
}

async function visibleProjectName(page) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const name = await page.evaluate(() => document.querySelector('.groupbar-name')?.textContent?.trim() || '');
    if (name) return name;
    await page.sleep(0.5);
  }
  return '';
}

function createDomain(page, origin) {
  return createRuijieDomain({
    getVisibleProjectName: () => visibleProjectName(page),
    call: (api, { method = 'GET', module = 'default', querys = {}, params } = {}) => {
      const envelope = {
        api,
        method,
        module,
        querys: { ...querys, lang: 'en' },
        authParams: { api, method },
      };
      if (params !== undefined) envelope.params = params;
      return page.fetchJson(`${origin}/webproxy/common/api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: envelope,
        timeoutMs: 20_000,
      }).then(data => {
        if (typeof data?.code === 'number' && data.code !== 0) {
          throw new CommandExecutionError(`${new URL(api, origin).pathname}: code ${data.code}`);
        }
        return data;
      });
    },
  });
}

async function run(page, command, args = {}) {
  const { url, ...commandArgs } = args;
  let projectUrl;
  try {
    projectUrl = await ensureProjectPage(page, url);
    const result = await createDomain(page, projectUrl.origin).invoke(command, commandArgs);
    if (result === undefined) throw new EmptyResultError(`ruijie ${command}`, 'Ruijie returned no data for the selected scope or sections.');
    return result;
  } catch (error) {
    if (error instanceof ArgumentError || error instanceof AuthRequiredError || error instanceof CommandExecutionError || error instanceof EmptyResultError) throw error;
    const message = error?.message || String(error);
    if (/Client not found in the current project/i.test(message)) throw new EmptyResultError('ruijie client-info', message);
    if (/deviceSn is required|does not belong|missing from the current topology|Unsupported section|sections must|state must|limit must|page must|days must|scope must|type must|onlyProblems must|includeClients must|valid 48-bit MAC|url must|url host|url is required/i.test(message)) {
      throw new ArgumentError(message);
    }
    if (/Open a project|HTTP (401|403)|login|authentication/i.test(message)) {
      throw new AuthRequiredError(projectUrl?.hostname || 'ruijienetworks.com', message);
    }
    throw new CommandExecutionError(message);
  }
}

const common = {
  site: 'ruijie',
  access: 'read',
  domain: 'ruijienetworks.com',
  strategy: Strategy.COOKIE,
  browser: true,
  navigateBefore: false,
  siteSession: 'persistent',
  defaultFormat: 'yaml',
};

cli({
  ...common,
  name: 'project-context',
  description: 'Discover the currently open Ruijie Cloud project, device inventory/types, network model, and supported query sections. Pass --url with the project page copied from Chrome on the first command or when switching projects. Use this read-only command first when the target device or available capability is unknown.',
  example: 'opencli ruijie project-context --url https://cloud-as.ruijienetworks.com/macc5/adminIntl/#/monitor_project_workbarn_menu -f yaml',
  args: [urlArg],
  func: (page, args) => run(page, 'projectContext', args),
});

cli({
  ...common,
  name: 'device-info',
  description: 'Read identity, model/version, capability, live performance, 24-hour online history, or topology links for one current-project device. Use device-network instead for WAN, VLAN, port, DHCP, radio, or client questions. Read-only.',
  example: 'opencli ruijie device-info <SN> --sections detail,performance -f yaml',
  args: [
    { name: 'deviceSn', type: 'string', required: true, positional: true, help: 'Serial number returned by ruijie project-context; it must belong to the currently open project.' },
    { name: 'sections', type: 'string', help: 'Comma-separated subset: detail, ability, performance, history, topology. Omit for all sections.' },
    urlArg,
  ],
  func: (page, args) => run(page, 'deviceInfo', { deviceSn: args.deviceSn, sections: sections(args.sections), url: args.url }),
});

cli({
  ...common,
  name: 'device-network',
  description: 'Read network state/configuration for one current-project device: gateway interfaces/WAN/ports/VLANs/DHCP, switch ports/VLAN mode/uplink/neighbors, or AP radio/ports/VLANs/client health. Use device-info for model, version, status, or performance. Read-only.',
  example: 'opencli ruijie device-network <SN> --sections vlans,ports -f yaml',
  args: [
    { name: 'deviceSn', type: 'string', required: true, positional: true, help: 'Serial number returned by ruijie project-context; it must belong to the currently open project.' },
    { name: 'sections', type: 'string', help: 'Comma-separated sections supported by that device type. Run project-context first when unsure; omit for all supported sections.' },
    urlArg,
  ],
  func: (page, args) => run(page, 'deviceNetwork', { deviceSn: args.deviceSn, sections: sections(args.sections), url: args.url }),
});

cli({
  ...common,
  name: 'alarms',
  description: 'Read a bounded page of active or cleared alarms for the currently open Ruijie Cloud project. Use device-info or device-network for device state and configuration details. Optional SN is validated as current-project scope. Read-only.',
  example: 'opencli ruijie alarms --state active --limit 50 -f yaml',
  args: [
    { name: 'state', type: 'string', default: 'active', choices: ['active', 'cleared'], help: 'Alarm lifecycle state: active or cleared.' },
    { name: 'limit', type: 'int', default: 50, help: 'Maximum alarms to request; integer from 1 to 200.' },
    { name: 'device-sn', type: 'string', help: 'Optional serial number from project-context; validated against the open project (the upstream response may remain project-wide).' },
    urlArg,
  ],
  func: (page, args) => run(page, 'alarms', { state: args.state, limit: args.limit, deviceSn: args['device-sn'], url: args.url }),
});

cli({
  ...common,
  name: 'topology',
  description: 'Read the normalized infrastructure topology for the current project as device nodes and links, optionally including connected client nodes. Use this for path, dependency, or attachment questions rather than per-device configuration. Read-only.',
  example: 'opencli ruijie topology --include-clients true -f yaml',
  args: [
    { name: 'include-clients', type: 'bool', default: false, help: 'Include client nodes and attachment links in addition to infrastructure devices.' },
    urlArg,
  ],
  func: (page, args) => run(page, 'topology', { includeClients: args['include-clients'], url: args.url }),
});

cli({
  ...common,
  name: 'clients',
  description: 'Read a bounded page of compact wired or wireless client summaries for the current project, one device, or a topology subtree. Use client-info for the complete record of one MAC address. Read-only.',
  example: 'opencli ruijie clients --device-sn <SN> --scope direct --type wireless --limit 50 -f yaml',
  args: [
    { name: 'device-sn', type: 'string', help: 'Optional SN from project-context. Required when scope is subtree; validated against the current project.' },
    { name: 'scope', type: 'string', default: 'direct', choices: ['direct', 'subtree'], help: 'direct filters clients attached to the SN; subtree includes clients below that device in topology.' },
    { name: 'page', type: 'int', default: 1, help: 'One-based upstream page number, from 1 to 10000.' },
    { name: 'type', type: 'string', default: 'all', choices: ['all', 'wired', 'wireless'], help: 'Client connection type: all, wired, or wireless.' },
    { name: 'only-problems', type: 'bool', default: false, help: 'Return only clients with bad status, packet loss, or RSSI at or below -70 dBm.' },
    { name: 'limit', type: 'int', default: 50, help: 'Maximum clients to scan on this page; integer from 1 to 200.' },
    urlArg,
  ],
  func: (page, args) => run(page, 'clients', {
    deviceSn: args['device-sn'], scope: args.scope, page: args.page, type: args.type,
    onlyProblems: args['only-problems'], limit: args.limit, url: args.url,
  }),
});

cli({
  ...common,
  name: 'client-info',
  description: 'Read the full current Ruijie client record for one exact 48-bit MAC address in the selected project. Obtain the MAC from clients; use clients for lists, filtering, and pagination. Read-only.',
  example: 'opencli ruijie client-info <MAC> -f yaml',
  args: [
    { name: 'mac', type: 'string', required: true, positional: true, help: 'Exact client MAC returned by ruijie clients; separators may be colon, hyphen, dot, or omitted.' },
    urlArg,
  ],
  func: (page, args) => run(page, 'clientInfo', { mac: args.mac, url: args.url }),
});

cli({
  ...common,
  name: 'operation-logs',
  description: 'Read recent project operation logs to correlate outages or alarms with configuration activity. Optional SN is validated as diagnostic scope, although upstream results may remain project-wide. Read-only.',
  example: 'opencli ruijie operation-logs --days 7 --limit 50 -f yaml',
  args: [
    { name: 'device-sn', type: 'string', help: 'Optional current-project device SN used as validated diagnostic scope.' },
    { name: 'days', type: 'int', default: 7, help: 'History window in whole days, from 1 to 30.' },
    { name: 'limit', type: 'int', default: 50, help: 'Maximum log records to request, from 1 to 200.' },
    urlArg,
  ],
  func: (page, args) => run(page, 'operationLogs', { deviceSn: args['device-sn'], days: args.days, limit: args.limit, url: args.url }),
});

cli({
  ...common,
  name: 'wireless-settings',
  description: 'Read project-wide radio policy, Wi-Fi template/SSID configuration, AP load balancing, or AI roaming settings. Use device-network for one AP radio capability, ports, VLANs, or client health. Read-only.',
  example: 'opencli ruijie wireless-settings --sections radio,wifi -f yaml',
  args: [
    { name: 'sections', type: 'string', help: 'Comma-separated subset: radio, wifi, loadBalancing, aiRoaming. Omit for all sections.' },
    urlArg,
  ],
  func: (page, args) => run(page, 'wirelessSettings', { sections: sections(args.sections), url: args.url }),
});

cli({
  ...common,
  name: 'portal-auth',
  description: 'Read project Portal authentication policies, abilities, global settings, and associated SSIDs. Use wireless-settings for Wi-Fi/radio configuration and clients for connected users. Read-only.',
  example: 'opencli ruijie portal-auth --sections policies,ssids --limit 100 -f yaml',
  args: [
    { name: 'sections', type: 'string', help: 'Comma-separated subset: policies, ability, global, ssids. Omit for all sections.' },
    { name: 'limit', type: 'int', default: 100, help: 'Maximum Portal policies to request, from 1 to 200.' },
    urlArg,
  ],
  func: (page, args) => run(page, 'portalAuth', { sections: sections(args.sections), limit: args.limit, url: args.url }),
});
