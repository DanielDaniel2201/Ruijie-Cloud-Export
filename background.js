chrome.runtime.onMessage.addListener((message, sender) => {
  if (message?.type !== "ruijie-export-state" || sender.tab?.id === undefined) return;
  const tabId = sender.tab.id;
  void chrome.action.setBadgeBackgroundColor({ tabId, color: "#246bfd" });
  void chrome.action.setBadgeText({ tabId, text: message.running ? "◌" : "" });
  void chrome.action.setTitle({ tabId, title: message.running ? "Ruijie export in progress" : "Export Ruijie project" });
});
