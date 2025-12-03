import { getAccessToken, getOAuthCredentials } from './credentials';

const ANTHROPIC_API_BASE = 'https://api.anthropic.com';

interface UsagePeriod {
  utilization: number;
  resets_at: string | null;
}

interface ApiUsageResponse {
  five_hour: UsagePeriod;
  seven_day: UsagePeriod;
}

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

/**
 * Anthropic OAuth Usage API
 * Endpoint: https://api.anthropic.com/api/oauth/usage
 */
export async function getClaudeUsageFromApi(): Promise<ClaudeUsageData> {
  const token = getAccessToken();
  
  if (!token) {
    return {
      isAuthenticated: false,
      subscriptionType: null,
      rateLimitTier: null,
      fiveHourUsage: 0,
      sevenDayUsage: 0,
      fiveHourResetsAt: null,
      sevenDayResetsAt: null,
      error: 'Claude Code credentials not found',
    };
  }

  try {
    const response = await fetch(`${ANTHROPIC_API_BASE}/api/oauth/usage`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'anthropic-beta': 'oauth-2025-04-20',
        'User-Agent': 'CCGauge/1.0',
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        return {
          isAuthenticated: false,
          subscriptionType: null,
          rateLimitTier: null,
          fiveHourUsage: 0,
          sevenDayUsage: 0,
          fiveHourResetsAt: null,
          sevenDayResetsAt: null,
          error: 'Token invalid or expired',
        };
      }
      throw new Error(`API error: ${response.status}`);
    }

    const data: ApiUsageResponse = await response.json();
    const creds = getOAuthCredentials();

    return {
      isAuthenticated: true,
      subscriptionType: creds?.subscriptionType || null,
      rateLimitTier: creds?.rateLimitTier || null,
      fiveHourUsage: data.five_hour.utilization,
      sevenDayUsage: data.seven_day.utilization,
      fiveHourResetsAt: data.five_hour.resets_at,
      sevenDayResetsAt: data.seven_day.resets_at,
    };
  } catch (error) {
    return {
      isAuthenticated: false,
      subscriptionType: null,
      rateLimitTier: null,
      fiveHourUsage: 0,
      sevenDayUsage: 0,
      fiveHourResetsAt: null,
      sevenDayResetsAt: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export function formatResetTime(resetTimeStr: string | null): string {
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
