const button = document.querySelector("#export");
const status = document.querySelector("#status");

button.addEventListener("click", async () => {
  button.disabled = true;
  status.className = "";
  status.textContent = "Collecting project data…";

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url?.startsWith("https://cloud-as.ruijienetworks.com/macc5/")) {
      throw new Error("Open a Ruijie Cloud project page first.");
    }

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["collector.js"],
      world: "MAIN"
    });

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.__ruijieCloudExporter.run(),
      world: "MAIN"
    });

    // ponytail: one JSON crosses the scripting boundary; add streaming/ZIP only if real projects hit Chrome's limit.
    const url = URL.createObjectURL(new Blob([result.json], { type: "application/json" }));
    await chrome.downloads.download({ url, filename: result.filename, saveAs: true });
    setTimeout(() => URL.revokeObjectURL(url), 30_000);

    status.className = "ok";
    status.textContent = `${result.summary.devices} devices, ${result.summary.clients} clients\n${result.summary.errors} section error(s)`;
  } catch (error) {
    status.className = "error";
    status.textContent = error?.message || String(error);
  } finally {
    button.disabled = false;
  }
});
