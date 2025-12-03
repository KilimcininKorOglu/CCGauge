import { contextBridge, ipcRenderer } from 'electron';

export interface ClaudeUsageData {
  isAuthenticated: boolean;
  subscriptionType: string | null;
  rateLimitTier: string | null;
  fiveHourUsage: number;
  sevenDayUsage: number;
  fiveHourResetsAt: string | null;
  sevenDayResetsAt: string | null;
  error?: string;
}

export interface Settings {
  notificationsEnabled: boolean;
  notificationThreshold: number;
}

export interface RefreshData {
  usage: ClaudeUsageData | null;
  error?: string;
  timestamp: string;
}

export interface ElectronAPI {
  getUsage: () => Promise<ClaudeUsageData>;
  refresh: () => Promise<void>;
  getSettings: () => Promise<Settings>;
  setNotifications: (enabled: boolean) => Promise<Settings>;
  onDataRefresh: (callback: (data: RefreshData) => void) => () => void;
}

const electronAPI: ElectronAPI = {
  getUsage: () => ipcRenderer.invoke('app:get-usage'),
  refresh: () => ipcRenderer.invoke('app:refresh'),
  getSettings: () => ipcRenderer.invoke('app:get-settings'),
  setNotifications: (enabled: boolean) => ipcRenderer.invoke('app:set-notifications', enabled),
  onDataRefresh: (callback: (data: RefreshData) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: RefreshData) => callback(data);
    ipcRenderer.on('app:data-updated', listener);
    return () => {
      ipcRenderer.removeListener('app:data-updated', listener);
    };
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
