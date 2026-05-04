import { Slate } from 'slates';
import { spec } from './spec';
import {
  sendMessage,
  updateMessage,
  scheduleMessage,
  manageScheduledMessages,
  getConversationHistory,
  getConversationInfo,
  openConversation,
  listConversations,
  manageChannel,
  manageChannelMembers,
  getUserInfo,
  manageUserStatus,
  manageReactions,
  managePins,
  manageFiles,
  searchMessages,
  searchFiles,
  manageReminders,
  manageUserGroups,
  manageBookmarks,
  getTeamInfo
} from './tools';
import {
  newMessage,
  newMessageWebhook,
  channelActivity,
  newReaction,
  newFile,
  userChange
} from './triggers';

export let provider = Slate.create({
  spec,
  tools: [
    sendMessage,
    updateMessage,
    scheduleMessage,
    manageScheduledMessages,
    getConversationHistory,
    getConversationInfo,
    openConversation,
    listConversations,
    manageChannel,
    manageChannelMembers,
    getUserInfo,
    manageUserStatus,
    manageReactions,
    managePins,
    manageFiles,
    searchMessages,
    searchFiles,
    manageReminders,
    manageUserGroups,
    manageBookmarks,
    getTeamInfo
  ],
  triggers: [newMessage, newMessageWebhook, channelActivity, newReaction, newFile, userChange]
});
