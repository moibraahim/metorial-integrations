import { createLocalSlateTestClient, expectSlateContract } from '@slates/test';
import { describe, expect, it } from 'vitest';
import { provider } from './index';
import { slackActionScopes, slackBotOAuthScopes, slackUserOAuthScopes } from './lib/scopes';

let grantedScopeIds = (scopes: Array<{ scope: string }>) => scopes.map(scope => scope.scope);

let actionIdsAvailableForScopes = (
  actions: Array<{ id: string; scopes?: { AND: Array<{ OR: string[] }> } }>,
  grantedScopes: string[]
) => {
  let granted = new Set(grantedScopes);
  return actions
    .filter(action =>
      action.scopes?.AND.every(clause => clause.OR.some(scope => granted.has(scope)))
    )
    .map(action => action.id);
};

describe('slack provider contract', () => {
  it('exposes the merged Slack tool and auth surface with scopes', async () => {
    let client = createLocalSlateTestClient({ slate: provider });
    let contract = await expectSlateContract({
      client,
      provider: {
        id: 'slack',
        name: 'Slack'
      },
      toolIds: [
        'send_message',
        'update_message',
        'schedule_message',
        'manage_scheduled_messages',
        'get_conversation_history',
        'get_conversation_info',
        'open_conversation',
        'list_conversations',
        'manage_channel',
        'manage_channel_members',
        'get_user_info',
        'manage_user_status',
        'manage_reactions',
        'manage_pins',
        'manage_files',
        'search_messages',
        'search_files',
        'manage_reminders',
        'manage_user_groups',
        'manage_bookmarks',
        'get_team_info'
      ],
      triggerIds: [
        'new_message',
        'new_message_webhook',
        'channel_activity',
        'new_reaction',
        'new_file',
        'user_change'
      ],
      authMethodIds: ['oauth', 'user_oauth', 'bot_token', 'user_token']
    });

    for (let action of [...contract.tools, ...contract.triggers]) {
      expect(action.scopes?.AND.length).toBeGreaterThan(0);
    }

    expect(contract.actions.find(action => action.id === 'send_message')?.scopes).toEqual(
      slackActionScopes.chatWrite
    );
    expect(contract.actions.find(action => action.id === 'search_messages')?.scopes).toEqual(
      slackActionScopes.search
    );
    expect(
      contract.actions.find(action => action.id === 'manage_user_status')?.scopes
    ).toEqual(slackActionScopes.userStatus);
    expect(contract.actions.find(action => action.id === 'manage_reminders')?.scopes).toEqual(
      slackActionScopes.reminders
    );
    expect(contract.actions.find(action => action.id === 'new_message')?.scopes).toEqual(
      slackActionScopes.messagePolling
    );
    expect(
      contract.actions.find(action => action.id === 'new_message_webhook')?.scopes
    ).toEqual(slackActionScopes.messageEvents);
    expect(
      contract.actions.find(action => action.id === 'channel_activity')?.scopes
    ).toEqual(slackActionScopes.channelActivity);
    expect(contract.actions.find(action => action.id === 'new_reaction')?.scopes).toEqual(
      slackActionScopes.reactionEvents
    );
    expect(contract.actions.find(action => action.id === 'new_file')?.scopes).toEqual(
      slackActionScopes.fileEvents
    );
    expect(contract.actions.find(action => action.id === 'user_change')?.scopes).toEqual(
      slackActionScopes.userChange
    );

    let botOAuth = await client.getAuthMethod('oauth');
    let userOAuth = await client.getAuthMethod('user_oauth');
    expect(
      botOAuth.authenticationMethod.scopes?.some(scope => scope.id === 'search:read')
    ).toBe(false);
    expect(
      userOAuth.authenticationMethod.scopes?.some(scope => scope.id === 'search:read')
    ).toBe(true);
  });

  it('models bot and user scope availability distinctly', async () => {
    let client = createLocalSlateTestClient({ slate: provider });
    let actions = (await client.listActions()).actions as Array<{
      id: string;
      scopes?: { AND: Array<{ OR: string[] }> };
    }>;

    let botActions = actionIdsAvailableForScopes(
      actions,
      grantedScopeIds(slackBotOAuthScopes)
    );
    expect(botActions).toContain('send_message');
    expect(botActions).toContain('new_message');
    expect(botActions).toContain('new_message_webhook');
    expect(botActions).not.toContain('manage_reminders');
    expect(botActions).not.toContain('search_messages');
    expect(botActions).not.toContain('search_files');
    expect(botActions).not.toContain('manage_user_status');

    let userActions = actionIdsAvailableForScopes(
      actions,
      grantedScopeIds(slackUserOAuthScopes)
    );
    expect(userActions).toContain('send_message');
    expect(userActions).toContain('new_message');
    expect(userActions).toContain('new_message_webhook');
    expect(userActions).toContain('manage_reminders');
    expect(userActions).toContain('search_messages');
    expect(userActions).toContain('search_files');
    expect(userActions).toContain('manage_user_status');

    let chatOnlyActions = actionIdsAvailableForScopes(actions, ['chat:write']);
    expect(chatOnlyActions).toEqual([
      'send_message',
      'update_message',
      'schedule_message',
      'manage_scheduled_messages'
    ]);
  });
});
