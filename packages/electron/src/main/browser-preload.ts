import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import { IPC_CHANNELS } from "@ccr/core/contracts/ipc-channels";
import type { BuiltInBrowserState } from "@ccr/core/contracts/app";

contextBridge.exposeInMainWorld("ccrBrowser", {
  back: (tabId?: string) => ipcRenderer.invoke(IPC_CHANNELS.browserBack, tabId) as Promise<BuiltInBrowserState>,
  closeTab: (tabId: string) => ipcRenderer.invoke(IPC_CHANNELS.browserCloseTab, tabId) as Promise<BuiltInBrowserState>,
  forward: (tabId?: string) => ipcRenderer.invoke(IPC_CHANNELS.browserForward, tabId) as Promise<BuiltInBrowserState>,
  getState: () => ipcRenderer.invoke(IPC_CHANNELS.browserGetState) as Promise<BuiltInBrowserState>,
  navigate: (url: string, tabId?: string) => ipcRenderer.invoke(IPC_CHANNELS.browserNavigate, url, tabId) as Promise<BuiltInBrowserState>,
  newTab: (url?: string) => ipcRenderer.invoke(IPC_CHANNELS.browserNewTab, url) as Promise<BuiltInBrowserState>,
  reload: (tabId?: string) => ipcRenderer.invoke(IPC_CHANNELS.browserReload, tabId) as Promise<BuiltInBrowserState>,
  selectTab: (tabId: string) => ipcRenderer.invoke(IPC_CHANNELS.browserSelectTab, tabId) as Promise<BuiltInBrowserState>,
  onStateChanged: (callback: (state: BuiltInBrowserState) => void) => {
    const handler = (_event: IpcRendererEvent, state: BuiltInBrowserState) => callback(state);
    ipcRenderer.on(IPC_CHANNELS.browserStateChanged, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.browserStateChanged, handler);
  }
});
