import http from "node:http";
import { randomUUID } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const token = process.env.RUIJIE_MCP_TOKEN || "";
const port = Number(process.env.RUIJIE_MCP_PORT || 32145);
if (token.length < 16) throw new Error("RUIJIE_MCP_TOKEN must contain at least 16 characters.");
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("RUIJIE_MCP_PORT must be between 1 and 65535.");

const infoSections = ["detail", "ability", "performance", "history", "topology"];
const networkSections = ["interfaces", "wan", "ports", "vlans", "dhcp", "vlanMode", "uplink", "neighbors", "radio", "clients"];
const wirelessSections = ["radio", "wifi", "loadBalancing", "aiRoaming"];
const portalSections = ["policies", "ability", "global", "ssids"];
const tools = [
  {
    name: "get_project_context",
    description: "Discover the currently open Ruijie Cloud project, its summary, network model, devices, and the sections available for each device. Call this first before using a device tool.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "get_device_info",
    description: "Read selected identity, capability, live performance, 24-hour online history, or topology-link information for one device in the current project.",
    inputSchema: {
      type: "object",
      properties: {
        deviceSn: { type: "string", minLength: 1, maxLength: 128, description: "Serial number returned by get_project_context." },
        sections: { type: "array", minItems: 1, uniqueItems: true, items: { type: "string", enum: infoSections } }
      },
      required: ["deviceSn"],
      additionalProperties: false
    }
  },
  {
    name: "get_device_network",
    description: "Read selected network information for one current-project device. Supported sections depend on whether it is a gateway, switch, or wireless device; use get_project_context to discover them.",
    inputSchema: {
      type: "object",
      properties: {
        deviceSn: { type: "string", minLength: 1, maxLength: 128, description: "Serial number returned by get_project_context." },
        sections: { type: "array", minItems: 1, uniqueItems: true, items: { type: "string", enum: networkSections } }
      },
      required: ["deviceSn"],
      additionalProperties: false
    }
  },
  {
    name: "get_alarms",
    description: "Read a bounded page of active or cleared alarms for the current project. deviceSn is validated against the project and included as diagnostic scope; API responses may still contain project-wide alarms.",
    inputSchema: {
      type: "object",
      properties: {
        state: { type: "string", enum: ["active", "cleared"], default: "active" },
        deviceSn: { type: "string", minLength: 1, maxLength: 128, description: "Optional current-project device scope." },
        limit: { type: "integer", minimum: 1, maximum: 200, default: 50 }
      },
      additionalProperties: false
    }
  },
  {
    name: "get_topology",
    description: "Read the normalized current-project device topology. Optionally include client nodes and links.",
    inputSchema: {
      type: "object",
      properties: { includeClients: { type: "boolean", default: false } },
      additionalProperties: false
    }
  },
  {
    name: "get_clients",
    description: "Read a bounded list of current clients, optionally scoped to a current-project device, wired/wireless type, or likely problem indicators.",
    inputSchema: {
      type: "object",
      properties: {
        deviceSn: { type: "string", minLength: 1, maxLength: 128, description: "Optional serial number returned by get_project_context." },
        type: { type: "string", enum: ["all", "wired", "wireless"], default: "all" },
        onlyProblems: { type: "boolean", default: false },
        limit: { type: "integer", minimum: 1, maximum: 200, default: 50 }
      },
      additionalProperties: false
    }
  },
  {
    name: "get_operation_logs",
    description: "Read a bounded page of recent current-project operation logs to correlate faults with configuration changes. deviceSn is validated as diagnostic scope; API responses may remain project-wide.",
    inputSchema: {
      type: "object",
      properties: {
        deviceSn: { type: "string", minLength: 1, maxLength: 128, description: "Optional current-project device scope." },
        days: { type: "integer", minimum: 1, maximum: 30, default: 7 },
        limit: { type: "integer", minimum: 1, maximum: 200, default: 50 }
      },
      additionalProperties: false
    }
  },
  {
    name: "get_wireless_settings",
    description: "Read selected project-wide radio, Wi-Fi template/SSID, load-balancing, and AI roaming settings.",
    inputSchema: {
      type: "object",
      properties: {
        sections: { type: "array", minItems: 1, uniqueItems: true, items: { type: "string", enum: wirelessSections } }
      },
      additionalProperties: false
    }
  },
  {
    name: "get_portal_auth",
    description: "Read selected current-project Portal authentication policies, abilities, global settings, and associated SSIDs.",
    inputSchema: {
      type: "object",
      properties: {
        sections: { type: "array", minItems: 1, uniqueItems: true, items: { type: "string", enum: portalSections } },
        limit: { type: "integer", minimum: 1, maximum: 200, default: 100 }
      },
      additionalProperties: false
    }
  }
];

let queue = [];
const pending = new Map();

function invokeBrowser(name, args) {
  return new Promise((resolve, reject) => {
    const id = randomUUID();
    const timer = setTimeout(() => {
      pending.delete(id);
      queue = queue.filter(task => task.id !== id);
      reject(new Error("No active paired Ruijie browser tab answered within 45 seconds."));
    }, 45_000);
    pending.set(id, { resolve, reject, timer });
    queue.push({ id, name, arguments: args });
  });
}

function authorized(request) {
  return request.headers.authorization === `Bearer ${token}`;
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 10_000_000) throw new Error("Bridge result exceeds 10 MB.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const bridge = http.createServer(async (request, response) => {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  if (request.method === "OPTIONS") {
    response.writeHead(204).end();
    return;
  }
  if (!authorized(request)) {
    response.writeHead(401).end();
    return;
  }

  if (request.method === "GET" && request.url === "/next") {
    const task = queue.shift();
    if (!task) {
      response.writeHead(204).end();
      return;
    }
    response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(task));
    return;
  }

  const match = request.method === "POST" && request.url?.match(/^\/result\/([0-9a-f-]+)$/i);
  if (!match) {
    response.writeHead(404).end();
    return;
  }

  const call = pending.get(match[1]);
  if (!call) {
    response.writeHead(404).end();
    return;
  }
  try {
    const body = await readJson(request);
    clearTimeout(call.timer);
    pending.delete(match[1]);
    if (body.error) call.reject(new Error(String(body.error)));
    else call.resolve(body.result);
    response.writeHead(204).end();
  } catch (error) {
    clearTimeout(call.timer);
    pending.delete(match[1]);
    call.reject(error);
    response.writeHead(400).end(error?.message || String(error));
  }
});

const mcp = new Server({ name: "ruijie-cloud-readonly", version: "0.1.0" }, { capabilities: { tools: {} } });
mcp.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
mcp.setRequestHandler(CallToolRequestSchema, async request => {
  const tool = tools.find(item => item.name === request.params.name);
  if (!tool) return { isError: true, content: [{ type: "text", text: `Unknown tool: ${request.params.name}` }] };
  try {
    const result = await invokeBrowser(tool.name, request.params.arguments || {});
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  } catch (error) {
    return { isError: true, content: [{ type: "text", text: error?.message || String(error) }] };
  }
});

await new Promise((resolve, reject) => {
  bridge.once("error", reject);
  bridge.listen(port, "127.0.0.1", resolve);
});
console.error(`Ruijie MCP bridge listening on 127.0.0.1:${port}`);
await mcp.connect(new StdioServerTransport());
