import { app, BrowserWindow, ipcMain, Tray, nativeImage, Menu, screen, Notification } from 'electron';
import * as path from 'path';
import { getClaudeUsageFromApi, ClaudeUsageData } from './claudeApi';
import { hasValidCredentials, getSubscriptionType } from './credentials';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let refreshInterval: NodeJS.Timeout | null = null;

const isDev = !app.isPackaged;

// Settings
interface Settings {
  notificationsEnabled: boolean;
  notificationThreshold: number;
}

let settings: Settings = {
  notificationsEnabled: true,
  notificationThreshold: 90
};

// Notification state (to avoid duplicate notifications)
let lastNotificationState = {
  fiveHourWarning: false,
  sevenDayWarning: false
};

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      showWindow();
    }
  });
}

function addLog(message: string) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

// Get tray icon based on percentage
function getTrayIcon(percentage: number): Electron.NativeImage {
  let iconName: string;
  
  if (percentage >= 90) {
    iconName = 'tray_red.png';
  } else if (percentage >= 70) {
    iconName = 'tray_orange.png';
  } else if (percentage > 0) {
    iconName = 'tray_green.png';
  } else {
    iconName = 'tray_gray.png';
  }
  
  const iconPath = path.join(__dirname, '..', 'assets', iconName);
  return nativeImage.createFromPath(iconPath);
}

// Update tray icon
function updateTrayIcon(usage: ClaudeUsageData | null) {
  if (!tray) return;
  
  let percentage = 0;
  let tooltip = 'CCGauge';
  
  if (usage?.isAuthenticated) {
    const fiveHour = Math.round(usage.fiveHourUsage);
    const sevenDay = Math.round(usage.sevenDayUsage);
    
    // Use the higher of the two percentages for the gauge
    percentage = Math.max(fiveHour, sevenDay);
    tooltip = `5h: ${fiveHour}% | 7d: ${sevenDay}%`;
  }
  
  tray.setImage(getTrayIcon(percentage));
  tray.setToolTip(tooltip);
}

// Show notification
function showNotification(title: string, body: string) {
  if (!settings.notificationsEnabled) return;
  
  if (Notification.isSupported()) {
    const notification = new Notification({
      title,
      body,
      icon: path.join(__dirname, '..', 'assets', 'icon.png')
    });
    notification.show();
  }
}

// Check usage and notify
function checkUsageAndNotify(usage: ClaudeUsageData) {
  if (!settings.notificationsEnabled) return;
  
  const threshold = settings.notificationThreshold;
  const fiveHour = Math.round(usage.fiveHourUsage);
  const sevenDay = Math.round(usage.sevenDayUsage);
  
  // 5-hour limit warning
  if (fiveHour >= threshold && !lastNotificationState.fiveHourWarning) {
    showNotification(
      '⚠️ Claude Usage Warning',
      `5-hour usage has reached ${fiveHour}%!`
    );
    lastNotificationState.fiveHourWarning = true;
  } else if (fiveHour < threshold) {
    lastNotificationState.fiveHourWarning = false;
  }
  
  // 7-day limit warning
  if (sevenDay >= threshold && !lastNotificationState.sevenDayWarning) {
    showNotification(
      '⚠️ Claude Usage Warning',
      `7-day usage has reached ${sevenDay}%!`
    );
    lastNotificationState.sevenDayWarning = true;
  } else if (sevenDay < threshold) {
    lastNotificationState.sevenDayWarning = false;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 320,
    height: 340,
    show: false,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    transparent: false,
    backgroundColor: '#1a1a1a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('blur', () => {
    mainWindow?.hide();
  });
}

function createTray() {
  tray = new Tray(getTrayIcon(0));
  tray.setToolTip('CCGauge');
  updateContextMenu();

  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide();
    } else {
      showWindow();
    }
  });

  tray.on('right-click', () => {
    updateContextMenu();
    tray?.popUpContextMenu();
  });
}

function getStartupLabel(): string {
  switch (process.platform) {
    case 'darwin': return 'Start at Login';
    case 'win32': return 'Start with Windows';
    default: return 'Start at Login';
  }
}

function updateContextMenu() {
  if (!tray) return;
  
  const menuTemplate: Electron.MenuItemConstructorOptions[] = [
    { label: 'Show', click: () => showWindow() },
    { label: 'Refresh', click: () => refreshData() },
    { type: 'separator' },
    {
      label: 'Notifications',
      type: 'checkbox',
      checked: settings.notificationsEnabled,
      click: (menuItem) => {
        settings.notificationsEnabled = menuItem.checked;
        addLog(`Notifications: ${menuItem.checked ? 'enabled' : 'disabled'}`);
      }
    },
    { type: 'separator' },
    {
      label: getStartupLabel(),
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (menuItem) => {
        app.setLoginItemSettings({ openAtLogin: menuItem.checked });
      }
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ];
  
  const contextMenu = Menu.buildFromTemplate(menuTemplate);
  tray.setContextMenu(contextMenu);
}

function showWindow() {
  if (!mainWindow || !tray) return;

  const trayBounds = tray.getBounds();
  const windowBounds = mainWindow.getBounds();
  const display = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y });

  let x = Math.round(trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2);
  let y = Math.round(trayBounds.y - windowBounds.height - 8);

  const workArea = display.workArea;
  
  if (y < workArea.y) {
    y = trayBounds.y + trayBounds.height + 8;
  }
  if (x + windowBounds.width > workArea.x + workArea.width) {
    x = workArea.x + workArea.width - windowBounds.width - 10;
  }
  if (x < workArea.x) {
    x = workArea.x + 10;
  }

  mainWindow.setPosition(x, y, false);
  mainWindow.show();
  mainWindow.focus();
}

async function refreshData() {
  if (!mainWindow) return;
  addLog('Refreshing data...');

  try {
    if (!hasValidCredentials()) {
      addLog('Claude Code credentials not found!');
      updateTrayIcon(null);
      
      mainWindow.webContents.send('app:data-updated', {
        usage: null,
        error: 'Claude Code credentials not found. Please run "claude" command first.',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const usage = await getClaudeUsageFromApi();
    
    if (usage.isAuthenticated) {
      addLog(`5h: ${Math.round(usage.fiveHourUsage)}% | 7d: ${Math.round(usage.sevenDayUsage)}%`);
      updateTrayIcon(usage);
      checkUsageAndNotify(usage);
    } else {
      addLog(`Error: ${usage.error || 'Unknown error'}`);
      updateTrayIcon(null);
    }

    mainWindow.webContents.send('app:data-updated', {
      usage,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`Error: ${message}`);
    updateTrayIcon(null);
    
    mainWindow.webContents.send('app:data-updated', {
      usage: null,
      error: message,
      timestamp: new Date().toISOString(),
    });
  }
}

// IPC Handlers
ipcMain.handle('app:get-usage', async () => {
  if (!hasValidCredentials()) {
    return { error: 'No credentials' };
  }
  return await getClaudeUsageFromApi();
});

ipcMain.handle('app:refresh', async () => {
  await refreshData();
});

ipcMain.handle('app:get-settings', () => {
  return settings;
});

ipcMain.handle('app:set-notifications', (_event, enabled: boolean) => {
  settings.notificationsEnabled = enabled;
  updateContextMenu();
  return settings;
});

// App lifecycle
app.whenReady().then(async () => {
  // Hide dock icon on macOS (menu bar app)
  if (process.platform === 'darwin') {
    app.dock?.hide();
  }
  
  createWindow();
  createTray();
  
  if (hasValidCredentials()) {
    const subType = getSubscriptionType();
    addLog(`Claude Code: ${subType || 'active'}`);
  } else {
    addLog('Claude Code credentials not found');
  }
  
  // Initial refresh and auto-refresh every 2 minutes
  await refreshData();
  refreshInterval = setInterval(refreshData, 120000);
});

app.on('window-all-closed', () => {
  // Keep running in tray
});

app.on('before-quit', () => {
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
});
