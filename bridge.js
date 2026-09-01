window.addEventListener("message", event => {
  if (event.source !== window || event.data?.type !== "ruijie-export-state") return;
  void chrome.runtime.sendMessage(event.data).catch(() => {});
});

let mcpEnabled = false;
const pollMcp = () => {
  if (mcpEnabled) void chrome.runtime.sendMessage({ type: "ruijie-mcp-poll" }).catch(() => {});
};
void chrome.storage.local.get("mcpEnabled").then(config => {
  mcpEnabled = Boolean(config.mcpEnabled);
  pollMcp();
});
chrome.storage.onChanged.addListener(changes => {
  if (changes.mcpEnabled) mcpEnabled = Boolean(changes.mcpEnabled.newValue);
});
setInterval(pollMcp, 1_000);
