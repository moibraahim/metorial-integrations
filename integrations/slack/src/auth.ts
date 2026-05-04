import { SlateAuth, createAxios } from 'slates';
import { z } from 'zod';
import {
  parseSlackGrantedScopes,
  slackBotOAuthScopes,
  slackUserOAuthScopes
} from './lib/scopes';
import { slackOAuthError } from './lib/errors';

type SlackProfile = {
  id?: string;
  name?: string;
  teamId?: string;
  teamName?: string;
  imageUrl?: string;
};

let getSlackProfile = async (token: string): Promise<SlackProfile> => {
  let client = createAxios({ baseURL: 'https://slack.com/api' });

  let response = await client.get('/auth.test', {
    headers: { Authorization: `Bearer ${token}` }
  });

  let data = response.data as {
    ok: boolean;
    user_id?: string;
    user?: string;
    team_id?: string;
    team?: string;
    url?: string;
  };

  let profile: SlackProfile = {
    id: data.user_id,
    name: data.user,
    teamId: data.team_id,
    teamName: data.team
  };

  try {
    let teamResponse = await client.get('/team.info', {
      headers: { Authorization: `Bearer ${token}` }
    });

    let teamData = teamResponse.data as {
      ok: boolean;
      team?: { icon?: { image_132?: string } };
    };

    if (teamData.ok && teamData.team?.icon?.image_132) {
      profile.imageUrl = teamData.team.icon.image_132;
    }
  } catch {
    // Team icons are nice-to-have profile metadata.
  }

  return profile;
};

let getAuthorizationUrl =
  (scopeParam: 'scope' | 'user_scope') =>
  async (ctx: { clientId: string; scopes: string[]; redirectUri: string; state: string }) => {
    let params = new URLSearchParams({
      client_id: ctx.clientId,
      [scopeParam]: ctx.scopes.join(','),
      redirect_uri: ctx.redirectUri,
      state: ctx.state
    });

    return {
      url: `https://slack.com/oauth/v2/authorize?${params.toString()}`
    };
  };

export let auth = SlateAuth.create()
  .output(
    z.object({
      token: z.string(),
      actorType: z.enum(['bot', 'user']).optional(),
      teamId: z.string().optional(),
      teamName: z.string().optional(),
      botUserId: z.string().optional(),
      userId: z.string().optional()
    })
  )
  .addOauth({
    type: 'auth.oauth',
    name: 'Slack OAuth (Bot)',
    key: 'oauth',
    scopes: slackBotOAuthScopes,
    getAuthorizationUrl: getAuthorizationUrl('scope'),

    handleCallback: async ctx => {
      let client = createAxios({ baseURL: 'https://slack.com/api' });

      let response = await client.post('/oauth.v2.access', null, {
        params: {
          code: ctx.code,
          client_id: ctx.clientId,
          client_secret: ctx.clientSecret,
          redirect_uri: ctx.redirectUri
        }
      });

      let data = response.data as {
        ok: boolean;
        access_token?: string;
        scope?: string;
        team?: { id?: string; name?: string };
        bot_user_id?: string;
        authed_user?: { id?: string };
        error?: string;
      };

      if (!data.ok || !data.access_token) {
        throw slackOAuthError(data.error);
      }

      let scopes = parseSlackGrantedScopes(data.scope);

      return {
        output: {
          token: data.access_token,
          actorType: 'bot' as const,
          teamId: data.team?.id,
          teamName: data.team?.name,
          botUserId: data.bot_user_id,
          userId: data.authed_user?.id
        },
        scopes: scopes.length > 0 ? scopes : undefined
      };
    },

    getProfile: async (ctx: { output: { token: string } }) => ({
      profile: await getSlackProfile(ctx.output.token)
    })
  })
  .addOauth({
    type: 'auth.oauth',
    name: 'Slack OAuth (User)',
    key: 'user_oauth',
    scopes: slackUserOAuthScopes,
    getAuthorizationUrl: getAuthorizationUrl('user_scope'),

    handleCallback: async ctx => {
      let client = createAxios({ baseURL: 'https://slack.com/api' });

      let response = await client.post('/oauth.v2.access', null, {
        params: {
          code: ctx.code,
          client_id: ctx.clientId,
          client_secret: ctx.clientSecret,
          redirect_uri: ctx.redirectUri
        }
      });

      let data = response.data as {
        ok: boolean;
        authed_user?: {
          id?: string;
          access_token?: string;
          scope?: string;
        };
        team?: { id?: string; name?: string };
        error?: string;
      };

      let token = data.authed_user?.access_token;
      if (!data.ok || !token) {
        throw slackOAuthError(data.error || 'missing user access token');
      }

      let scopes = parseSlackGrantedScopes(data.authed_user?.scope);

      return {
        output: {
          token,
          actorType: 'user' as const,
          teamId: data.team?.id,
          teamName: data.team?.name,
          userId: data.authed_user?.id
        },
        scopes: scopes.length > 0 ? scopes : undefined
      };
    },

    getProfile: async (ctx: { output: { token: string } }) => ({
      profile: await getSlackProfile(ctx.output.token)
    })
  })
  .addTokenAuth({
    type: 'auth.token',
    name: 'Bot Token',
    key: 'bot_token',

    inputSchema: z.object({
      token: z.string().describe('Slack Bot Token (starts with xoxb-)')
    }),

    getOutput: async ctx => ({
      output: {
        token: ctx.input.token,
        actorType: 'bot' as const
      }
    }),

    getProfile: async (ctx: { output: { token: string } }) => ({
      profile: await getSlackProfile(ctx.output.token)
    })
  })
  .addTokenAuth({
    type: 'auth.token',
    name: 'User Token',
    key: 'user_token',

    inputSchema: z.object({
      token: z.string().describe('Slack User Token (starts with xoxp-)')
    }),

    getOutput: async ctx => ({
      output: {
        token: ctx.input.token,
        actorType: 'user' as const
      }
    }),

    getProfile: async (ctx: { output: { token: string } }) => ({
      profile: await getSlackProfile(ctx.output.token)
    })
  });
