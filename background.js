const mcpPollingTabs = new Set();

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type === "ruijie-export-state" && sender.tab?.id !== undefined) {
    const tabId = sender.tab.id;
    void chrome.action.setBadgeBackgroundColor({ tabId, color: "#246bfd" });
    void chrome.action.setBadgeText({ tabId, text: message.running ? "◌" : "" });
    void chrome.action.setTitle({ tabId, title: message.running ? "Ruijie export in progress" : "Export Ruijie project" });
    return;
  }

  if (message?.type === "ruijie-mcp-poll" && sender.tab?.id !== undefined && sender.tab.active) {
    void pollMcp(sender.tab.id);
  }
});

async function pollMcp(tabId) {
  if (mcpPollingTabs.has(tabId)) return;
  mcpPollingTabs.add(tabId);
  let endpoint;
  let token;
  let task;
  try {
    const config = await chrome.storage.local.get(["mcpEnabled", "mcpPort", "mcpToken"]);
    const port = Number(config.mcpPort || 32145);
    token = config.mcpToken;
    if (!config.mcpEnabled || !token || !Number.isInteger(port) || port < 1 || port > 65535) return;
    endpoint = `http://127.0.0.1:${port}`;

    const response = await fetch(`${endpoint}/next`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(3_000)
    });
    if (response.status === 204) return;
    if (!response.ok) throw new Error(`MCP bridge returned ${response.status}`);
    task = await response.json();

    const [{ result: ready }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => typeof window.__ruijieCloudExporter?.invokeTool === "function",
      world: "MAIN"
    });
    if (!ready) await chrome.scripting.executeScript({ target: { tabId }, files: ["collector.js"], world: "MAIN" });
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (name, args) => window.__ruijieCloudExporter.invokeTool(name, args),
      args: [task.name, task.arguments || {}],
      world: "MAIN"
    });
    await sendMcpResult(endpoint, token, task.id, { result });
  } catch (error) {
    if (task?.id && endpoint && token) {
      await sendMcpResult(endpoint, token, task.id, { error: error?.message || String(error) }).catch(() => {});
    }
  } finally {
    mcpPollingTabs.delete(tabId);
  }
}

async function sendMcpResult(endpoint, token, id, body) {
  const response = await fetch(`${endpoint}/result/${encodeURIComponent(id)}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`MCP bridge rejected result: ${response.status}`);
}
