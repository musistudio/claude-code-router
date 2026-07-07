const root = document.getElementById("ccr-chrome-login-import");
const button = document.getElementById("ccr-confirm-import");
const statusElement = document.getElementById("ccr-import-status");

if (root && button && statusElement) {
  const importUrl = root.getAttribute("data-import-url") || "";
  button.disabled = false;
  button.textContent = "Confirm and Import";
  setStatus("CCR Login Import extension is connected. Review the domains, then confirm.");

  button.addEventListener("click", () => {
    void confirmImport(importUrl);
  });
}

async function confirmImport(importUrl) {
  button.disabled = true;
  setStatus("Importing Chrome cookies and localStorage into CCR...");
  try {
    const response = await chrome.runtime.sendMessage({
      importUrl,
      type: "ccr-login-import-confirm"
    });
    if (!response?.ok) {
      throw new Error(response?.error || "Chrome login import failed.");
    }
    const result = response.result || {};
    setStatus(
      `Imported ${result.cookieImported || 0} cookies and ${result.localStorageImported || 0} localStorage items. Skipped ${result.skipped || 0}.`,
      "ok"
    );
    button.textContent = "Imported";
  } catch (error) {
    button.disabled = false;
    setStatus(formatError(error), "error");
  }
}

function setStatus(message, kind = "") {
  statusElement.textContent = message;
  statusElement.className = `status ${kind}`.trim();
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}
