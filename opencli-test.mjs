import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as core from './src/ruijie/domain.js';
const requests = [];
const transport = async (api, options = {}) => {
  requests.push({ api, method: options.method || 'GET', options });
  if (api.startsWith('/maint/network/common/list')) return { code: 0, dataList: [{ buildingId: 7, name: 'Demo' }] };
  if (api.startsWith('/maint/devices/list')) return { code: 0, deviceList: [
    { serialNumber: 'GW1', commonType: 'GATEWAY' },
    { serialNumber: 'SW1', commonType: 'SWITCH' },
    { serialNumber: 'AP1', commonType: 'AP' },
  ] };
  if (api === '/network/current/user/global/page') return { code: 0, totalCount: 1, list: [
    { mac: '00:11:22:33:44:55', apSn: 'AP1', connectionType: 'wireless', rssi: '-75', token: 'secret' },
  ] };
  if (api === '/topology/generation/record/7') return { code: 0, data: { currentHasTopo: 'true' } };
  if (api.startsWith('/topology/info/7')) return { code: 0, data: { sn: 'GW1', children: [{ sn: 'SW1', children: [{ sn: 'AP1' }] }] } };
  if (api === '/topology/terminal/info/7') return { code: 0, list: [{ sn: 'AP1', details: [{ mac: '00:11:22:33:44:55' }] }] };
  if (api.startsWith('/warn/warnlog')) return { code: 0, list: [{ token: 'secret' }] };
  if (api.startsWith('/operationlog/list')) return { code: 0, list: [{ description: 'WAN changed', credential: 'secret' }] };
  if (api === '/conf/group/7/templates') return { code: 0, tempList: [{ id: 9 }] };
  if (api === '/conf/wifi_grp/wifi') return { code: 0, data: { ssidList: [{ ssidName: 'Demo', password: 'secret' }] } };
  if (api.startsWith('/intl/auth/v2/policy/7')) return { code: 0, data: [{ policyName: 'Guest portal' }] };
  return { code: 0, data: { apiKey: 'secret', link: 'https://example.test/?token=secret' } };
};
const domain = core.createRuijieDomain({ call: transport, getVisibleProjectName: () => 'Demo' });

const project = await domain.invoke('projectContext');
assert.equal(project.project.name, 'Demo');
assert.equal(project.devices[0].type, 'gateway');
assert.ok(requests.every(({ api, method }) => core.isAllowed(api, method)));

await assert.rejects(domain.invoke('deviceInfo', { deviceSn: '' }), /deviceSn is required/);
await assert.rejects(domain.invoke('deviceInfo', { deviceSn: 'OTHER' }), /does not belong/);
await assert.rejects(domain.invoke('deviceInfo', { deviceSn: 'GW1', sections: ['bogus'] }), /Unsupported section/);
await assert.rejects(domain.invoke('deviceNetwork', { deviceSn: 'GW1', sections: ['radio'] }), /Unsupported section/);
await assert.rejects(domain.invoke('alarms', { state: 'unknown' }), /state must/);
await assert.rejects(domain.invoke('alarms', { limit: 0 }), /limit must/);
await assert.rejects(domain.invoke('alarms', { limit: 201 }), /limit must/);
await assert.rejects(domain.invoke('unknown'), /Unknown command/);
await assert.rejects(domain.call('/maint/device/GW1', { method: 'POST' }), /Blocked non-whitelisted/);
await assert.rejects(domain.call('/unknown'), /Blocked non-whitelisted/);
assert.equal(core.isAllowed('https://evil.test/maint/device/GW1'), false);
assert.equal(core.redact({ password: 'secret' }).password, '[REDACTED]');
assert.equal(core.redact('https://example.test/?token=secret&ok=1'), 'https://example.test/?token=[REDACTED]&ok=1');
const alarms = await domain.invoke('alarms', { state: 'active', limit: 1, deviceSn: 'GW1' });
assert.equal(alarms.alarms[0].token, '[REDACTED]');
const topology = await domain.invoke('topology', { includeClients: true });
assert.equal(topology.available, true);
assert.equal(topology.nodes.length, 4);
assert.equal(topology.links.some(link => link.type === 'client'), true);
const clients = await domain.invoke('clients', { deviceSn: 'AP1', type: 'wireless', onlyProblems: true, limit: 10 });
assert.equal(clients.returned, 1);
assert.equal(clients.clients[0].rssiDbm, -75);
assert.equal('token' in clients.clients[0], false);
assert.equal(requests.at(-1).options.querys.linked_device, 'AP1');
const client = await domain.invoke('clientInfo', { mac: '00:11:22:33:44:55' });
assert.equal(client.client.token, '[REDACTED]');
const logs = await domain.invoke('operationLogs', { days: 7, limit: 10 });
assert.equal(logs.logs[0].credential, '[REDACTED]');
const wireless = await domain.invoke('wirelessSettings', { sections: ['wifi'] });
assert.equal(wireless.wifi.configurations[0].ssidList[0].password, '[REDACTED]');
const portal = await domain.invoke('portalAuth', { sections: ['policies'], limit: 10 });
assert.equal(portal.policies[0].policyName, 'Guest portal');
await assert.rejects(domain.invoke('clients', { type: 'bluetooth' }), /type must/);
await assert.rejects(domain.invoke('clients', { scope: 'subtree' }), /deviceSn is required/);
await assert.rejects(domain.invoke('clientInfo', { mac: 'bad' }), /valid 48-bit/);
await assert.rejects(domain.invoke('operationLogs', { days: 31 }), /days must/);
await assert.rejects(domain.invoke('wirelessSettings', { sections: ['bogus'] }), /Unsupported section/);

const adapter = fs.readFileSync(new URL('./opencli-plugin-ruijie/ruijie.js', import.meta.url), 'utf8');
assert.match(adapter, /access:\s*'read'/);
const commandNames = [...adapter.matchAll(/cli\(\{\s+\.\.\.common,\s+name:\s*'([^']+)'/g)].map(match => match[1]);
assert.deepEqual(commandNames, ['project-context', 'device-info', 'device-network', 'alarms', 'topology', 'clients', 'client-info', 'operation-logs', 'wireless-settings', 'portal-auth']);
assert.equal([...adapter.matchAll(/description:\s*'[^']{80,}'/g)].length, 10);
assert.ok([...adapter.matchAll(/help:\s*'[^']+'/g)].length >= 20);
assert.doesNotMatch(adapter, /name:\s*'(?:api|fetch|eval)'/);

console.log('OpenCLI domain and adapter checks passed');
