import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { URL } from 'node:url';

const AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const USERINFO_URL = 'https://api.linkedin.com/v2/userinfo';

/**
 * `w_member_social` is what allows posting; `openid`+`profile` are needed to
 * resolve the person URN via the userinfo endpoint.
 */
export const SCOPES = ['openid', 'profile', 'w_member_social'] as const;

export interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope?: string;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string | null;
  personUrn: string;
  name?: string;
  /** ISO timestamp when the access token stops working. */
  expiresAt: string;
}

/**
 * Run the 3-legged OAuth flow against a temporary localhost listener.
 *
 * Interactive and local-only: LinkedIn will not redirect to a machine it can't
 * reach, so this cannot run in CI. The resulting token goes into GitHub Secrets
 * by hand.
 */
export async function runAuthFlow(opts: {
  clientId: string;
  clientSecret: string;
  port: number;
  openUrl: (url: string) => void;
}): Promise<AuthResult> {
  const redirectUri = `http://localhost:${opts.port}/callback`;
  const state = randomBytes(16).toString('hex');

  const authUrl = new URL(AUTH_URL);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', opts.clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('scope', SCOPES.join(' '));

  const code = await new Promise<string>((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://localhost:${opts.port}`);
      if (url.pathname !== '/callback') {
        res.writeHead(404).end('Not found');
        return;
      }

      const returnedState = url.searchParams.get('state');
      const returnedCode = url.searchParams.get('code');
      const error = url.searchParams.get('error_description') ?? url.searchParams.get('error');

      const finish = (message: string) => {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<html><body style="font-family:system-ui;padding:3rem">
          <h2>${message}</h2><p>You can close this tab and return to the terminal.</p>
        </body></html>`);
        server.close();
      };

      if (error) {
        finish('Authorization failed.');
        reject(new Error(`LinkedIn returned an error: ${error}`));
      } else if (returnedState !== state) {
        // Guards against a CSRF-style callback from another initiator.
        finish('Authorization failed.');
        reject(new Error('OAuth state mismatch — aborting.'));
      } else if (!returnedCode) {
        finish('Authorization failed.');
        reject(new Error('LinkedIn did not return an authorization code.'));
      } else {
        finish('Authorized.');
        resolve(returnedCode);
      }
    });

    server.on('error', reject);
    server.listen(opts.port, () => opts.openUrl(authUrl.toString()));

    setTimeout(
      () => {
        server.close();
        reject(new Error('Timed out waiting for the LinkedIn callback (5 minutes).'));
      },
      5 * 60 * 1000,
    ).unref();
  });

  const token = await exchangeCode({ ...opts, code, redirectUri });
  const profile = await fetchUserinfo(token.access_token);

  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? null,
    personUrn: `urn:li:person:${profile.sub}`,
    name: profile.name,
    expiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(),
  };
}

async function exchangeCode(opts: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}): Promise<TokenResponse> {
  return postForm({
    grant_type: 'authorization_code',
    code: opts.code,
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    redirect_uri: opts.redirectUri,
  });
}

/**
 * Exchange a refresh token for a fresh access token.
 *
 * Not every LinkedIn app is granted refresh tokens — when yours isn't, this
 * throws and the fix is re-running `linkedin:auth` by hand. That's why the
 * token-health workflow warns ahead of expiry.
 */
export async function refreshAccessToken(opts: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): Promise<TokenResponse> {
  return postForm({
    grant_type: 'refresh_token',
    refresh_token: opts.refreshToken,
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
  });
}

async function postForm(fields: Record<string, string>): Promise<TokenResponse> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields).toString(),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`LinkedIn token request failed (${response.status}): ${text.slice(0, 300)}`);
  }
  return JSON.parse(text) as TokenResponse;
}

async function fetchUserinfo(accessToken: string): Promise<{ sub: string; name?: string }> {
  const response = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(
      `Could not read your LinkedIn profile (${response.status}). ` +
        'Confirm the app has the "Sign In with LinkedIn using OpenID Connect" product enabled.',
    );
  }
  return (await response.json()) as { sub: string; name?: string };
}
