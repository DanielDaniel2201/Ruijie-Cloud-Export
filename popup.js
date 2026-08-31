const button = document.querySelector("#export");
const progressList = document.querySelector("#progress");
const status = document.querySelector("#status");
let shownCurrent = -1;
let latestProgress;
let transitionTimer;

function drawProgress(progress) {
  const current = Math.max(0, progress.current);
  progressList.replaceChildren(...progress.items.slice(current, current + 3).map((name, offset) => {
    const index = current + offset;
    const row = document.createElement("div");
    const label = document.createElement("span");
    const done = index < progress.completed;
    row.className = `progress-row${index === progress.current && !done ? " active" : ""}`;
    label.textContent = done ? `Exported: ${name}` : index === progress.current ? `Exporting: ${name}` : `Next: ${name}`;
    row.append(label);
    if (done || index === progress.current) {
      const icon = document.createElement("span");
      icon.className = done ? "check" : "spinner";
      icon.textContent = done ? "✓" : "";
      icon.setAttribute("aria-label", done ? "Complete" : "In progress");
      row.append(icon);
    }
    return row;
  }));
}

function showExportCount(current, total) {
  const label = document.createElement("span");
  const count = document.createElement("span");
  label.textContent = "Exporting";
  count.textContent = `${current}/${total}`;
  button.className = "exporting";
  button.replaceChildren(label, count);
}

function renderProgress(progress) {
  latestProgress = progress;
  if (!progress.items.length) {
    button.textContent = "Preparing export…";
    return;
  }

  const total = progress.items.length;
  showExportCount(Math.min(Math.max(progress.current + 1, progress.completed), total), total);
  progressList.hidden = false;

  if (shownCurrent < 0) shownCurrent = progress.current;
  if (progress.current > shownCurrent) {
    if (!transitionTimer) {
      drawProgress({ ...progress, current: shownCurrent, completed: Math.max(progress.completed, shownCurrent + 1) });
      transitionTimer = setTimeout(() => {
        shownCurrent = latestProgress.current;
        transitionTimer = undefined;
        drawProgress(latestProgress);
      }, 250);
    }
    return;
  }
  if (!transitionTimer) drawProgress(progress);
}

button.addEventListener("click", async () => {
  button.disabled = true;
  status.className = "";
  status.textContent = "";
  progressList.hidden = true;
  shownCurrent = -1;
  clearTimeout(transitionTimer);
  transitionTimer = undefined;
  let polling = true;

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

    const readProgress = async () => {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => window.__ruijieCloudExporter.getProgress(),
        world: "MAIN"
      });
      renderProgress(result);
    };
    const poll = (async () => {
      while (polling) {
        try { await readProgress(); } catch {}
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    })();

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.__ruijieCloudExporter.run(),
      world: "MAIN"
    });
    await readProgress();
    polling = false;
    await poll;

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
    polling = false;
    button.disabled = false;
    button.className = "";
    button.textContent = "Export current project";
  }
});
