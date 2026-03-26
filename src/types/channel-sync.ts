export type ChannelSyncSessionType = 'group' | 'private';

export interface ChannelSyncSession {
  id: string;
  channelId: string;
  channelType: string;
  sessionType: ChannelSyncSessionType;
  title: string;
  pinned: boolean;
  syncState: string;
  latestActivityAt?: string;
  previewText?: string;
  participantSummary?: string;
  visibleAgentId?: string;
}

export interface ChannelSyncConversation {
  id: string;
  title: string;
  syncState: string;
  participantSummary?: string;
  visibleAgentId?: string;
}

export interface ChannelSyncMessage {
  id: string;
  role: 'human' | 'agent' | 'tool' | 'system';
  authorName?: string;
  createdAt?: string;
  content?: string;
  toolName?: string;
  durationMs?: number;
  summary?: string;
  internal?: boolean;
}
