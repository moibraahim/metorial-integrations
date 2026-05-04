import { createHash, randomBytes } from 'node:crypto';
import { SlateAuth, createAxios } from 'slates';
import { z } from 'zod';
import { salesforceOAuthError, salesforceServiceError } from './lib/errors';

let generateCodeVerifier = () => randomBytes(32).toString('base64url');

let generateCodeChallenge = (codeVerifier: string) =>
  createHash('sha256').update(codeVerifier).digest('base64url');

let normalizeSalesforceRedirectUri = (redirectUri: string) => {
  let url = new URL(redirectUri);
  if (url.protocol === 'http:' && url.hostname === '127.0.0.1') {
    url.hostname = 'localhost';
  }

  return url.toString();
};

export let auth = SlateAuth.create()
  .output(
    z.object({
      token: z.string(),
      refreshToken: z.string().optional(),
      instanceUrl: z.string(),
      expiresAt: z.string().optional()
    })
  )
  .addOauth({
    type: 'auth.oauth',
    name: 'OAuth 2.0',
    key: 'oauth',

    scopes: [
      {
        title: 'API Access',
        description: 'Access to REST API, Bulk API, and other data APIs',
        scope: 'api'
      },
      {
        title: 'Refresh Token',
        description: 'Allows obtaining a refresh token for persistent access',
        scope: 'refresh_token'
      },
      {
        title: 'Full Access',
        description: 'Full access to all data accessible by the logged-in user',
        scope: 'full',
        defaultChecked: false
      },
      {
        title: 'Chatter API',
        description: 'Access to Connect REST API (Chatter) resources',
        scope: 'chatter_api',
        defaultChecked: false
      },
      {
        title: 'OpenID',
        description: 'OpenID Connect identifier for user profile information',
        scope: 'openid'
      },
      {
        title: 'Profile',
        description: 'Access to user profile information',
        scope: 'profile'
      },
      {
        title: 'Analytics API',
        description: 'Access to Analytics REST API resources',
        scope: 'wave_api',
        defaultChecked: false
      },
      {
        title: 'CDP API',
        description: 'Access to all Data Cloud API resources',
        scope: 'cdp_api',
        defaultChecked: false
      },
      {
        title: 'Pardot API',
        description: 'Access to Marketing Cloud Account Engagement (Pardot)',
        scope: 'pardot_api',
        defaultChecked: false
      },
      {
        title: 'Custom Permissions',
        description: 'Access to custom permissions in the org',
        scope: 'custom_permissions',
        defaultChecked: false
      }
    ],

    inputSchema: z.object({
      environment: z
        .enum(['production', 'sandbox', 'custom'])
        .default('production')
        .describe('Salesforce environment type'),
      customDomain: z
        .string()
        .optional()
        .describe('Custom domain (e.g., yourorg.my) when using a custom environment')
    }),

    getAuthorizationUrl: async ctx => {
      let baseUrl = getLoginUrl(ctx.input.environment, ctx.input.customDomain);
      let redirectUri = normalizeSalesforceRedirectUri(ctx.redirectUri);
      let codeVerifier = generateCodeVerifier();
      let params = new URLSearchParams({
        response_type: 'code',
        client_id: ctx.clientId,
        redirect_uri: redirectUri,
        state: ctx.state,
        scope: ctx.scopes.join(' '),
        code_challenge: generateCodeChallenge(codeVerifier),
        code_challenge_method: 'S256'
      });

      return {
        url: `${baseUrl}/services/oauth2/authorize?${params.toString()}`,
        input: ctx.input,
        callbackState: { codeVerifier }
      };
    },

    handleCallback: async ctx => {
      let baseUrl = getLoginUrl(ctx.input.environment, ctx.input.customDomain);
      let http = createAxios({ baseURL: baseUrl });
      let redirectUri = normalizeSalesforceRedirectUri(ctx.redirectUri);
      let codeVerifier = ctx.callbackState.codeVerifier as string | undefined;

      if (!codeVerifier) {
        throw salesforceServiceError(
          'Missing Salesforce PKCE code verifier for OAuth callback'
        );
      }

      let response;
      try {
        response = await http.post(
          '/services/oauth2/token',
          new URLSearchParams({
            grant_type: 'authorization_code',
            code: ctx.code,
            client_id: ctx.clientId,
            client_secret: ctx.clientSecret,
            redirect_uri: redirectUri,
            code_verifier: codeVerifier
          }).toString(),
          {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
          }
        );
      } catch (error) {
        throw salesforceOAuthError('authorization code exchange', error);
      }

      let data = response.data;

      return {
        output: {
          token: data.access_token,
          refreshToken: data.refresh_token,
          instanceUrl: data.instance_url,
          expiresAt: data.issued_at
            ? new Date(parseInt(data.issued_at) + 7200 * 1000).toISOString()
            : undefined
        },
        input: ctx.input
      };
    },

    handleTokenRefresh: async ctx => {
      if (!ctx.output.refreshToken) {
        throw salesforceServiceError(
          'No Salesforce refresh token available. Re-authorize with the refresh_token scope.'
        );
      }

      let baseUrl = getLoginUrl(ctx.input.environment, ctx.input.customDomain);
      let http = createAxios({ baseURL: baseUrl });

      let response;
      try {
        response = await http.post(
          '/services/oauth2/token',
          new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: ctx.output.refreshToken,
            client_id: ctx.clientId,
            client_secret: ctx.clientSecret
          }).toString(),
          {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
          }
        );
      } catch (error) {
        throw salesforceOAuthError('token refresh', error);
      }

      let data = response.data;

      return {
        output: {
          token: data.access_token,
          refreshToken: data.refresh_token ?? ctx.output.refreshToken,
          instanceUrl: data.instance_url || ctx.output.instanceUrl,
          expiresAt: data.issued_at
            ? new Date(parseInt(data.issued_at) + 7200 * 1000).toISOString()
            : undefined
        },
        input: ctx.input
      };
    },

    getProfile: async (ctx: any) => {
      let http = createAxios({ baseURL: ctx.output.instanceUrl });

      let response = await http.get('/services/oauth2/userinfo', {
        headers: { Authorization: `Bearer ${ctx.output.token}` }
      });

      let data = response.data;

      return {
        profile: {
          id: data.user_id,
          email: data.email,
          name: data.name,
          imageUrl: data.picture,
          organizationId: data.organization_id,
          username: data.preferred_username
        }
      };
    }
  });

let getLoginUrl = (environment: string, customDomain?: string): string => {
  if (environment === 'sandbox') {
    return 'https://test.salesforce.com';
  }
  if (environment === 'custom' && customDomain) {
    return `https://${customDomain}.my.salesforce.com`;
  }
  return 'https://login.salesforce.com';
};
