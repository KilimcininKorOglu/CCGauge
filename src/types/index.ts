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

declare global {
  interface Window {
    electronAPI: {
      getUsage: () => Promise<ClaudeUsageData>;
      refresh: () => Promise<void>;
      getSettings: () => Promise<Settings>;
      setNotifications: (enabled: boolean) => Promise<Settings>;
      onDataRefresh: (callback: (data: RefreshData) => void) => () => void;
    };
  }
}

export {};
