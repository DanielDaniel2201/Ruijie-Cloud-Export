import assert from "node:assert/strict";
import net from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const port = await new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const { port } = server.address();
    server.close(() => resolve(port));
  });
});
const token = "mcp-test-token-123456789";
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["mcp-server.mjs"],
  env: { ...process.env, RUIJIE_MCP_TOKEN: token, RUIJIE_MCP_PORT: String(port) }
});
const client = new Client({ name: "ruijie-mcp-test", version: "1" });
await client.connect(transport);

const listed = await client.listTools();
assert.deepEqual(listed.tools.map(tool => tool.name), [
  "get_project_context", "get_device_info", "get_device_network", "get_alarms", "get_topology",
  "get_clients", "get_client_info", "get_operation_logs", "get_wireless_settings", "get_portal_auth"
]);
assert.equal((await fetch(`http://127.0.0.1:${port}/next`)).status, 401);

const called = client.callTool({ name: "get_project_context", arguments: {} });
let response;
for (let attempt = 0; attempt < 20; attempt++) {
  response = await fetch(`http://127.0.0.1:${port}/next`, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 200) break;
  await new Promise(resolve => setTimeout(resolve, 25));
}
assert.equal(response.status, 200);
const task = await response.json();
assert.equal(task.name, "get_project_context");
await fetch(`http://127.0.0.1:${port}/result/${task.id}`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ result: { project: { name: "Demo" } } })
});
const result = await called;
assert.deepEqual(JSON.parse(result.content[0].text), { project: { name: "Demo" } });

await client.close();
console.log("MCP bridge checks passed");
