window.addEventListener("message", event => {
  if (event.source !== window || event.data?.type !== "ruijie-export-state") return;
  void chrome.runtime.sendMessage(event.data).catch(() => {});
});
