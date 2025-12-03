import { useState, useEffect, useCallback } from 'react';
import type { ClaudeUsageData, RefreshData } from './types';
import './index.css';

const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined;

function formatRateLimitTier(tier: string | null): string {
  if (!tier) return '';

  const mappings: Record<string, string> = {
    'default_claude_max_20x': 'Max 20x',
    'default_claude_max_5x': 'Max 5x',
    'default_claude_pro': 'Pro',
    'default_claude_free': 'Free',
  };

  if (mappings[tier]) {
    return mappings[tier];
  }

  return tier
    .replace('default_claude_', '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function formatResetTime(resetTimeStr: string | null): string {
  if (!resetTimeStr) return '?';

  try {
    const resetDate = new Date(resetTimeStr);
    const now = new Date();
    const diffMs = resetDate.getTime() - now.getTime();

    if (diffMs < 0) return 'Reset';

    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (diffHours > 24) {
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays}d ${diffHours % 24}h`;
    }

    if (diffHours > 0) {
      return `${diffHours}h ${diffMinutes}m`;
    }

    return `${diffMinutes}m`;
  } catch {
    return '?';
  }
}

function CircleProgress({ label, percentage, resetTime, size = 100 }: {
  label: string;
  percentage: number;
  resetTime: string | null;
  size?: number;
}) {
  const pct = Math.min(Math.round(percentage), 100);
  const color = pct > 80 ? '#ef4444' : pct > 50 ? '#f59e0b' : '#22c55e';

  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      flex: 1
    }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#333"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.5s ease' }}
          />
        </svg>
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: 22, fontWeight: 700, color }}>{pct}%</div>
        </div>
      </div>
      <div style={{
        fontSize: 11,
        color: '#e5e5e5',
        marginTop: 8,
        textAlign: 'center',
        fontWeight: 500
      }}>
        {label}
      </div>
      {resetTime && (
        <div style={{ fontSize: 10, color: '#666', marginTop: 2 }}>
          {formatResetTime(resetTime)}
        </div>
      )}
    </div>
  );
}

function App() {
  const [usage, setUsage] = useState<ClaudeUsageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const refreshData = useCallback(async () => {
    if (!isElectron) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      await window.electronAPI.refresh();
    } catch (err) {
      console.error('Refresh error:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isElectron) {
      setLoading(false);
      setError('This app must be run inside Electron.');
      return;
    }

    const unsubscribe = window.electronAPI.onDataRefresh((data: RefreshData) => {
      if (data.usage) {
        setUsage(data.usage);
        setError(data.usage.error || null);
      } else {
        setUsage(null);
        setError(data.error || 'Unknown error');
      }
      setLastUpdated(new Date(data.timestamp));
      setLoading(false);
    });

    refreshData();

    return () => {
      unsubscribe();
    };
  }, [refreshData]);

  if (!isElectron) {
    return (
      <div style={{ padding: 20, textAlign: 'center', color: '#888' }}>
        <p>Run with: npm run electron:dev</p>
      </div>
    );
  }

  return (
    <div style={{
      width: 320,
      background: '#1a1a1a',
      color: '#fff',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      borderRadius: 8,
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 16px',
        background: '#252525',
        borderBottom: '1px solid #333'
      }}>
        <span style={{ fontWeight: 600, fontSize: 14 }}>
          CCGauge
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {lastUpdated && (
            <span style={{ fontSize: 10, color: '#666' }}>
              {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={refreshData}
            disabled={loading}
            style={{
              background: '#333',
              border: 'none',
              color: '#fff',
              padding: '4px 8px',
              borderRadius: 4,
              cursor: loading ? 'wait' : 'pointer',
              fontSize: 11
            }}
          >
            {loading ? '...' : '↻'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: 16 }}>
        {error && !usage?.isAuthenticated ? (
          <div style={{
            textAlign: 'center',
            padding: '20px 0',
            color: '#888'
          }}>
            <p style={{ marginBottom: 12, fontSize: 13 }}>{error}</p>
            <p style={{ fontSize: 11, color: '#666' }}>
              Run <code style={{ background: '#333', padding: '2px 6px', borderRadius: 3 }}>claude</code> in terminal to login
            </p>
          </div>
        ) : usage?.isAuthenticated ? (
          <>
            <div style={{
              display: 'flex',
              justifyContent: 'space-around',
              gap: 16,
              marginBottom: 16
            }}>
              <CircleProgress
                label="5 Hour"
                percentage={usage.fiveHourUsage}
                resetTime={usage.fiveHourResetsAt}
                size={110}
              />
              <CircleProgress
                label="7 Day"
                percentage={usage.sevenDayUsage}
                resetTime={usage.sevenDayResetsAt}
                size={110}
              />
            </div>

            {usage.rateLimitTier && (
              <div style={{
                fontSize: 11,
                color: '#888',
                textAlign: 'center',
                padding: '6px 8px',
                background: '#252525',
                borderRadius: 4
              }}>
                Plan: {formatRateLimitTier(usage.rateLimitTier)}
              </div>
            )}
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: 20 }}>
            <div className="loading">Loading...</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
