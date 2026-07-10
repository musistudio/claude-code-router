export const openFileEventName = "agent-console:file-editor:open-file";
export const selectRightPanelEventName = "agent-console:right-panel:select";

const pendingOpenPaths: string[] = [];

export function openFileInEditor(filePath: string) {
  if (!filePath) return;
  if (!pendingOpenPaths.includes(filePath)) {
    pendingOpenPaths.push(filePath);
  }
  window.dispatchEvent(new CustomEvent(selectRightPanelEventName, { detail: "editor" }));
  window.dispatchEvent(new CustomEvent(openFileEventName, { detail: { path: filePath } }));
}

export function consumePendingOpenFilePaths(): string[] {
  return pendingOpenPaths.splice(0);
}

export function removePendingOpenFilePath(filePath: string) {
  const pendingIndex = pendingOpenPaths.indexOf(filePath);
  if (pendingIndex >= 0) {
    pendingOpenPaths.splice(pendingIndex, 1);
  }
}
