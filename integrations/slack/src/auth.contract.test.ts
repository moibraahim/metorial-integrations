import { createLocalSlateTestClient } from '@slates/test';
import { afterEach, describe, expect, it, vi } from 'vitest';

let oauthPost = vi.fn();
let profileGet = vi.fn();

let loadProviderClient = async () => {
  vi.resetModules();
  oauthPost.mockReset();
  profileGet.mockReset();

  vi.doMock('slates', async () => {
    let actual = await vi.importActual<typeof import('slates')>('slates');

    return {
      ...actual,
      createAxios: vi.fn(() => ({
        post: oauthPost,
        get: profileGet
      }))
    };
  });

  let { provider } = await import('./index');
  return createLocalSlateTestClient({ slate: provider });
};

afterEach(() => {
  vi.doUnmock('slates');
  vi.resetModules();
});

describe('slack auth contract', () => {
  it('exposes bot and user auth methods', async () => {
    let client = await loadProviderClient();
    let methods = (await client.listAuthMethods()).authenticationMethods;

    expect(methods.map(method => method.id)).toEqual([
      'oauth',
      'user_oauth',
      'bot_token',
      'user_token'
    ]);
    expect(methods.find(method => method.id === 'oauth')?.name).toBe('Slack OAuth (Bot)');
    expect(methods.find(method => method.id === 'user_oauth')?.name).toBe(
      'Slack OAuth (User)'
    );
  });

  it('builds bot OAuth URLs with scope and user OAuth URLs with user_scope', async () => {
    let client = await loadProviderClient();

    let bot = await client.getAuthorizationUrl({
      authenticationMethodId: 'oauth',
      redirectUri: 'https://example.com/callback',
      state: 'state-123',
      input: {},
      clientId: 'client-id',
      clientSecret: 'client-secret',
      scopes: ['chat:write', 'channels:read']
    });
    let botUrl = new URL(bot.authorizationUrl);
    expect(botUrl.searchParams.get('scope')).toBe('chat:write,channels:read');
    expect(botUrl.searchParams.get('user_scope')).toBeNull();

    let user = await client.getAuthorizationUrl({
      authenticationMethodId: 'user_oauth',
      redirectUri: 'https://example.com/callback',
      state: 'state-123',
      input: {},
      clientId: 'client-id',
      clientSecret: 'client-secret',
      scopes: ['search:read', 'users.profile:write']
    });
    let userUrl = new URL(user.authorizationUrl);
    expect(userUrl.searchParams.get('scope')).toBeNull();
    expect(userUrl.searchParams.get('user_scope')).toBe('search:read,users.profile:write');
  });

  it('maps bot OAuth callback responses and granted scopes', async () => {
    let client = await loadProviderClient();
    oauthPost.mockResolvedValueOnce({
      data: {
        ok: true,
        access_token: 'xoxb-token',
        scope: 'chat:write,channels:read',
        team: { id: 'T123', name: 'Acme' },
        bot_user_id: 'Ubot'
      }
    });

    let result = await client.handleAuthorizationCallback({
      authenticationMethodId: 'oauth',
      code: 'code-123',
      state: 'state-123',
      redirectUri: 'https://example.com/callback',
      input: {},
      clientId: 'client-id',
      clientSecret: 'client-secret',
      scopes: ['chat:write'],
      callbackState: undefined
    });

    expect(oauthPost).toHaveBeenCalledWith('/oauth.v2.access', null, {
      params: {
        code: 'code-123',
        client_id: 'client-id',
        client_secret: 'client-secret',
        redirect_uri: 'https://example.com/callback'
      }
    });
    expect(result.output).toMatchObject({
      token: 'xoxb-token',
      actorType: 'bot',
      teamId: 'T123',
      teamName: 'Acme',
      botUserId: 'Ubot'
    });
    expect(result.scopes).toEqual(['chat:write', 'channels:read']);
  });

  it('maps user OAuth callback responses and granted scopes', async () => {
    let client = await loadProviderClient();
    oauthPost.mockResolvedValueOnce({
      data: {
        ok: true,
        authed_user: {
          id: 'Uuser',
          access_token: 'xoxp-token',
          scope: 'search:read,users.profile:write'
        },
        team: { id: 'T123', name: 'Acme' }
      }
    });

    let result = await client.handleAuthorizationCallback({
      authenticationMethodId: 'user_oauth',
      code: 'code-123',
      state: 'state-123',
      redirectUri: 'https://example.com/callback',
      input: {},
      clientId: 'client-id',
      clientSecret: 'client-secret',
      scopes: ['search:read'],
      callbackState: undefined
    });

    expect(result.output).toMatchObject({
      token: 'xoxp-token',
      actorType: 'user',
      teamId: 'T123',
      teamName: 'Acme',
      userId: 'Uuser'
    });
    expect(result.scopes).toEqual(['search:read', 'users.profile:write']);
  });
});
