import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface OAuthCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scopes?: string[];
  subscriptionType?: string;
  rateLimitTier?: string;
}

interface CredentialsFile {
  claudeAiOauth?: OAuthCredentials;
}

/**
 * Claude Code credentials file path
 * Windows: %USERPROFILE%\.claude\.credentials.json
 * macOS/Linux: ~/.claude/.credentials.json
 */
export function getCredentialsPath(): string {
  const home = os.homedir();
  return path.join(home, '.claude', '.credentials.json');
}

export function getOAuthCredentials(): OAuthCredentials | null {
  try {
    const credentialsPath = getCredentialsPath();
    
    if (!fs.existsSync(credentialsPath)) {
      return null;
    }

    const content = fs.readFileSync(credentialsPath, 'utf-8');
    const credsFile: CredentialsFile = JSON.parse(content);

    if (!credsFile.claudeAiOauth) {
      return null;
    }

    return credsFile.claudeAiOauth;
  } catch (error) {
    console.error('Error reading credentials:', error);
    return null;
  }
}

export function getAccessToken(): string | null {
  const creds = getOAuthCredentials();
  return creds?.accessToken || null;
}

export function isTokenExpired(): boolean {
  const creds = getOAuthCredentials();
  if (!creds?.expiresAt) return false;
  
  // Check with 5 minute buffer
  return Date.now() > (creds.expiresAt - 5 * 60 * 1000);
}

export function getSubscriptionType(): string | null {
  const creds = getOAuthCredentials();
  return creds?.subscriptionType || null;
}

export function hasValidCredentials(): boolean {
  const token = getAccessToken();
  if (!token) return false;
  // Removed token expiry check - let API handle errors
  return true;
}
