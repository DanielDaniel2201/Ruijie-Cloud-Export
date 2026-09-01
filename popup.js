const button = document.querySelector("#export");
const cancelButton = document.querySelector("#cancel");
const progressList = document.querySelector("#progress");
const status = document.querySelector("#status");
const eta = document.querySelector("#eta");
const preview = document.querySelector("#preview");
const selectAll = document.querySelector("#select-all");
const allCount = document.querySelector("#all-count");
const choices = [...preview.querySelectorAll("input[value]")];
preview.querySelectorAll("summary").forEach(summary => {
  const count = document.createElement("span");
  count.className = "count";
  summary.append(count);
});
let tabId;
let polling = false;
let exporting = false;
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

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function renderProgress(progress) {
  latestProgress = progress;
  if (!progress.running) {
    eta.textContent = "";
  } else if (!progress.completed || !Number.isFinite(progress.completedDurationMs)) {
    eta.textContent = "Estimated remaining: calculating…";
  } else {
    const average = progress.completedDurationMs / progress.completed;
    const currentRemaining = progress.itemStartedAt ? Math.max(0, average - (Date.now() - progress.itemStartedAt)) : 0;
    const queued = Math.max(0, progress.items.length - progress.completed - (progress.itemStartedAt ? 1 : 0));
    eta.textContent = `Estimated remaining: ${formatDuration(Math.ceil((currentRemaining + average * queued) / 1000))}`;
  }
  if (!progress.items.length) {
    button.textContent = "Preparing export…";
    return;
  }

  const total = progress.items.length;
  button.textContent = `Exporting ${Math.min(Math.max(progress.current + 1, progress.completed), total)}/${total}`;
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

async function getTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.startsWith("https://cloud-as.ruijienetworks.com/macc5/")) {
    throw new Error("Open a Ruijie Cloud project page first.");
  }
  tabId = tab.id;
  return tab;
}

async function readProgress() {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => window.__ruijieCloudExporter?.getProgress?.() || null,
    world: "MAIN"
  });
  return result;
}

function updateSelection() {
  const checked = choices.filter(choice => choice.checked).length;
  selectAll.checked = checked === choices.length;
  selectAll.indeterminate = checked > 0 && checked < choices.length;
  allCount.textContent = `${checked}/${choices.length} items`;
  preview.querySelectorAll("details").forEach(details => {
    const group = [...details.querySelectorAll("input[value]")];
    details.querySelector(".count").textContent = `${group.filter(choice => choice.checked).length}/${group.length}`;
  });
  button.disabled = exporting || checked === 0;
}

function setRunning(running) {
  exporting = running;
  preview.querySelectorAll("input").forEach(input => { input.disabled = running; });
  cancelButton.hidden = !running;
  updateSelection();
}

selectAll.addEventListener("change", () => {
  choices.forEach(choice => { choice.checked = selectAll.checked; });
  updateSelection();
});
choices.forEach(choice => choice.addEventListener("change", updateSelection));
updateSelection();

async function poll() {
  if (polling) return;
  polling = true;
  while (polling) {
    try {
      const progress = await readProgress();
      if (!progress) break;
      renderProgress(progress);
      if (!progress.running) {
        if (progress.canceled) {
          status.className = "";
          status.textContent = "Export cancelled.";
        } else if (progress.error) {
          status.className = "error";
          status.textContent = progress.error;
        } else if (progress.result) {
          status.className = "ok";
          status.textContent = `${progress.result.devices} devices, ${progress.result.clients} clients\n${progress.result.errors} section error(s)`;
        }
        break;
      }
    } catch (error) {
      status.className = "error";
      status.textContent = error?.message || String(error);
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  polling = false;
  setRunning(false);
  button.textContent = "Export selected sections";
}

button.addEventListener("click", async () => {
  const selected = choices.filter(choice => choice.checked).map(choice => choice.value);
  if (!selected.length) return;
  setRunning(true);
  status.className = "";
  status.textContent = "";
  progressList.hidden = true;
  eta.textContent = "Estimated remaining: calculating…";
  shownCurrent = -1;
  clearTimeout(transitionTimer);
  transitionTimer = undefined;

  try {
    await getTab();
    await chrome.scripting.executeScript({ target: { tabId }, files: ["collector.js"], world: "MAIN" });
    const existing = await readProgress();
    if (!existing.running) {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: selected => { void window.__ruijieCloudExporter.start(selected); },
        args: [selected],
        world: "MAIN"
      });
    }
    setRunning(true);
    await poll();
  } catch (error) {
    setRunning(false);
    status.className = "error";
    status.textContent = error?.message || String(error);
  }
});

cancelButton.addEventListener("click", async () => {
  cancelButton.disabled = true;
  status.className = "";
  status.textContent = "Cancelling…";
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.__ruijieCloudExporter.cancel(),
      world: "MAIN"
    });
  } finally {
    cancelButton.disabled = false;
  }
});

(async () => {
  try {
    await getTab();
    const progress = await readProgress();
    if (progress?.running) {
      setRunning(true);
      await poll();
    }
  } catch {}
})();
