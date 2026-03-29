import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { hostApiFetch } from '@/lib/host-api';
import { subscribeHostEvent } from '@/lib/host-events';
import { useChannelsStore } from '@/stores/channels';
import { useSettingsStore } from '@/stores/settings';
import { FeishuOnboardingWizard } from '@/components/channels/FeishuOnboardingWizard';
import MarkdownContent from '@/pages/Chat/MarkdownContent';
import {
  CHANNEL_ICONS,
  CHANNEL_META,
  CHANNEL_NAMES,
  type ChannelRuntimeCapability,
  type ChannelType,
} from '@/types/channel';
import type { ChannelSyncConversation, ChannelSyncFileInfo, ChannelSyncMessage, ChannelSyncSession } from '@/types/channel-sync';

const DOMESTIC_CHANNEL_TYPES: ChannelType[] = ['feishu', 'dingtalk', 'wecom', 'qqbot'];

const CHANNEL_FAMILY_UI: Record<ChannelType, { railLabel: string; panelTitle: string; icon: string }> = {
  feishu: { railLabel: '飞书接入', panelTitle: '飞书配置详情', icon: '🪶' },
  dingtalk: { railLabel: '钉钉接入', panelTitle: '钉钉配置详情', icon: '💙' },
  wecom: { railLabel: '企微接入', panelTitle: '企微配置详情', icon: '🍀' },
  qqbot: { railLabel: 'QQ接入', panelTitle: 'QQ配置详情', icon: '🐧' },
  whatsapp: { railLabel: 'WhatsApp', panelTitle: 'WhatsApp', icon: CHANNEL_ICONS.whatsapp },
  telegram: { railLabel: 'Telegram', panelTitle: 'Telegram', icon: CHANNEL_ICONS.telegram },
  discord: { railLabel: 'Discord', panelTitle: 'Discord', icon: CHANNEL_ICONS.discord },
  signal: { railLabel: 'Signal', panelTitle: 'Signal', icon: CHANNEL_ICONS.signal },
  imessage: { railLabel: 'iMessage', panelTitle: 'iMessage', icon: CHANNEL_ICONS.imessage },
  matrix: { railLabel: 'Matrix', panelTitle: 'Matrix', icon: CHANNEL_ICONS.matrix },
  line: { railLabel: 'LINE', panelTitle: 'LINE', icon: CHANNEL_ICONS.line },
  msteams: { railLabel: 'Microsoft Teams', panelTitle: 'Microsoft Teams', icon: CHANNEL_ICONS.msteams },
  googlechat: { railLabel: 'Google Chat', panelTitle: 'Google Chat', icon: CHANNEL_ICONS.googlechat },
  mattermost: { railLabel: 'Mattermost', panelTitle: 'Mattermost', icon: CHANNEL_ICONS.mattermost },
};

const SESSION_TYPE_LABEL: Record<'group' | 'private', string> = {
  group: '群聊',
  private: '私聊',
};

function formatRelativeTimestamp(value?: string): string {
  if (!value) return '';
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return '';
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function formatToolDuration(durationMs?: number): string | null {
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs <= 0) return null;
  if (durationMs < 1000) return `${Math.round(durationMs)}ms`;
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function isVisibleConversationMessage(message: ChannelSyncMessage): boolean {
  if (message.role === 'system' && message.internal) return false;
  return true;
}

function getDrawerFieldLabel(fieldKey: string, fallback: string): string {
  if (fieldKey === 'appId') return 'App ID';
  if (fieldKey === 'appSecret') return 'App Secret';
  return fallback;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FileCard({ info }: { info: ChannelSyncFileInfo }) {
  function formatBytes(bytes?: number): string | null {
    if (bytes == null) return null;
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) {
      const kb = bytes / 1024;
      return `${Number.isInteger(kb) ? kb : kb.toFixed(1)} KB`;
    }
    const mb = bytes / (1024 * 1024);
    return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
  }
  const sizeLabel = formatBytes(info.size);
  return (
    <div className="flex items-center gap-3 rounded-xl border border-black/[0.08] bg-[#f8fafc] px-3 py-2.5">
      <span className="text-[24px]">📄</span>
      <div className="min-w-0 flex-1">
        {info.name && <p className="truncate text-[13px] font-medium text-[#111827]">{info.name}</p>}
        {sizeLabel && <p className="text-[11px] text-[#94a3b8]">{sizeLabel}</p>}
      </div>
      {info.downloadUrl && (
        <button
          type="button"
          className="shrink-0 rounded-md bg-[#4F46E5] px-2.5 py-1 text-[12px] text-white hover:bg-[#4338CA]"
          onClick={() => window.open(info.downloadUrl, '_blank')}
        >下载</button>
      )}
    </div>
  );
}

function MessageBubble({
  message,
  bubbleClass,
  onImageClick,
}: {
  message: ChannelSyncMessage;
  bubbleClass: string;
  onImageClick: (url: string) => void;
}) {
  const msgType = message.messageType ?? 'text';

  if (msgType === 'image' && message.imageUrl) {
    return (
      <button
        type="button"
        data-testid={`bubble-${message.id}`}
        className="block cursor-zoom-in overflow-hidden rounded-2xl border border-black/[0.06]"
        onClick={() => onImageClick(message.imageUrl!)}
        aria-label="查看图片"
      >
        <img
          src={message.imageUrl}
          alt=""
          className="max-h-[200px] max-w-[360px] object-contain"
          loading="lazy"
        />
      </button>
    );
  }

  if ((msgType === 'file' || msgType === 'audio' || msgType === 'video') && message.fileInfo) {
    return (
      <div data-testid={`bubble-${message.id}`}>
        <FileCard info={message.fileInfo} />
      </div>
    );
  }

  if (!message.content && msgType !== 'text') {
    return (
      <p data-testid={`bubble-${message.id}`} className="italic text-[13px] text-[#94a3b8]">
        [不支持的消息类型: {msgType}]
      </p>
    );
  }

  return (
    <div data-testid={`bubble-${message.id}`} className={cn('rounded-2xl px-4 py-3 text-[14px] leading-7', bubbleClass)}>
      <MarkdownContent content={message.content ?? ''} />
    </div>
  );
}

export function Channels() {
  const { t } = useTranslation(['channels', 'common']);
  const requestedChannel = (() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get('channel');
    return requested && DOMESTIC_CHANNEL_TYPES.includes(requested as ChannelType)
      ? requested as ChannelType
      : 'feishu';
  })();
  const [activeChannel, setActiveChannel] = useState<ChannelType>(requestedChannel);
  const [composerValue, setComposerValue] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [addType, setAddType] = useState<ChannelType>('feishu');
  const [addName, setAddName] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [feishuWizardOpen, setFeishuWizardOpen] = useState(false);
  const [feishuWizardInitialName, setFeishuWizardInitialName] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [runtimeCapabilities, setRuntimeCapabilities] = useState<Record<string, ChannelRuntimeCapability>>({});
  const [sessions, setSessions] = useState<ChannelSyncSession[]>([]);
  const [conversation, setConversation] = useState<ChannelSyncConversation | null>(null);
  const [messages, setMessages] = useState<ChannelSyncMessage[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const isComposingRef = useRef(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [oldestMessageTs, setOldestMessageTs] = useState<string | null>(null);
  const messageScrollRef = useRef<HTMLDivElement>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const defaultModel = useSettingsStore((s) => s.defaultModel);
  // identity toggle: 'bot' | 'self'
  const [identityMode, setIdentityMode] = useState<'bot' | 'self'>('bot');
  // feishu user auth status for showing identity toggle
  const [userAuthStatus, setUserAuthStatus] = useState<'authorized' | 'unauthorized' | 'unknown'>('unknown');
  // mention popover
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [workbenchMembers, setWorkbenchMembers] = useState<Array<{ openId: string; name: string }>>([]);
  const composerRef = useRef<HTMLInputElement>(null);
  const [sessionSearchQuery, setSessionSearchQuery] = useState('');

  const {
    channels,
    loading,
    error,
    fetchChannels,
    connectChannel,
    disconnectChannel,
    deleteChannel,
    addChannel,
  } = useChannelsStore();

  useEffect(() => {
    void fetchChannels();
  }, [fetchChannels]);

  // Fetch feishu user auth status to decide whether to show identity toggle
  useEffect(() => {
    if (activeChannel !== 'feishu') return;
    hostApiFetch<{ status?: string; channel?: { configured?: boolean; pluginEnabled?: boolean } }>('/api/feishu/status')
      .then((resp) => {
        // 'authorized' = explicit status field; fallback: channel configured + plugin enabled
        if (resp.status === 'authorized') {
          setUserAuthStatus('authorized');
        } else if (resp.channel?.configured && resp.channel?.pluginEnabled) {
          setUserAuthStatus('authorized');
        } else {
          setUserAuthStatus('unauthorized');
        }
      })
      .catch(() => setUserAuthStatus('unknown'));
  }, [activeChannel]);

  // Fetch group members when mention popover opens
  const fetchMembers = useCallback(() => {
    if (!selectedConversationId) return;
    hostApiFetch<{ members?: Array<{ openId: string; name: string }> }>(
      `/api/channels/workbench/members?sessionId=${encodeURIComponent(selectedConversationId)}`,
    )
      .then((resp) => setWorkbenchMembers(resp.members ?? []))
      .catch(() => setWorkbenchMembers([]));
  }, [selectedConversationId]);

  useEffect(() => {
    if (mentionOpen) fetchMembers();
  }, [mentionOpen, fetchMembers]);

  useEffect(() => {
    if (requestedChannel !== activeChannel) {
      setActiveChannel(requestedChannel);
    }
  }, [requestedChannel, activeChannel]);

  useEffect(() => {
    let active = true;
    void hostApiFetch<{ capabilities?: ChannelRuntimeCapability[] }>('/api/channels/capabilities')
      .then((response) => {
        if (!active) return;
        const next: Record<string, ChannelRuntimeCapability> = {};
        for (const capability of response.capabilities ?? []) {
          next[capability.channelId] = capability;
        }
        setRuntimeCapabilities(next);
      })
      .catch(() => {
        if (active) setRuntimeCapabilities({});
      });
    return () => {
      active = false;
    };
  }, [channels]);

  const filteredChannels = channels.filter((channel) => channel.type === activeChannel);
  const selectedChannel = filteredChannels[0] ?? null;
  const selectedMeta = CHANNEL_META[activeChannel];
  const selectedRuntimeCapability = selectedChannel
    ? runtimeCapabilities[selectedChannel.id] ?? runtimeCapabilities[`${selectedChannel.type}-${selectedChannel.accountId || 'default'}`] ?? null
    : null;

  const loadConversation = async (conversationId: string) => {
    const response = await hostApiFetch<{
      conversation?: ChannelSyncConversation | null;
      messages?: ChannelSyncMessage[];
      hasMore?: boolean;
    }>(
      `/api/channels/workbench/conversations/${encodeURIComponent(conversationId)}/messages?limit=50`,
    );
    const msgs = (response.messages ?? []).filter(isVisibleConversationMessage);
    setConversation(response.conversation ?? null);
    setMessages(msgs);
    setHasMoreMessages(response.hasMore ?? false);
    setOldestMessageTs(msgs[0]?.createdAt ?? null);
  };

  const loadMoreMessages = async () => {
    if (!selectedConversationId || loadingMore || !hasMoreMessages || !oldestMessageTs) return;
    setLoadingMore(true);
    const scrollEl = messageScrollRef.current;
    const prevScrollHeight = scrollEl?.scrollHeight ?? 0;
    try {
      const response = await hostApiFetch<{
        conversation?: ChannelSyncConversation | null;
        messages?: ChannelSyncMessage[];
        hasMore?: boolean;
      }>(
        `/api/channels/workbench/conversations/${encodeURIComponent(selectedConversationId)}/messages?limit=50&cursor=${encodeURIComponent(oldestMessageTs)}`,
      );
      const older = (response.messages ?? []).filter(isVisibleConversationMessage);
      if (older.length > 0) {
        setMessages((prev) => [...older, ...prev]);
        setOldestMessageTs(older[0]?.createdAt ?? oldestMessageTs);
        // Restore scroll position so the user doesn't jump
        requestAnimationFrame(() => {
          if (scrollEl) {
            scrollEl.scrollTop = scrollEl.scrollHeight - prevScrollHeight;
          }
        });
      }
      setHasMoreMessages(response.hasMore ?? false);
    } catch {
      // swallow load-more errors silently
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    let active = true;
    setSessions([]);
    setConversation(null);
    setMessages([]);
    setSelectedConversationId(null);

    void hostApiFetch<{ sessions?: ChannelSyncSession[] }>(
      `/api/channels/workbench/sessions?channelType=${encodeURIComponent(activeChannel)}`,
    )
      .then(async (response) => {
        if (!active) return;
        const sortedSessions = [...(response.sessions ?? [])].sort((left, right) => {
          if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
          return Date.parse(right.latestActivityAt ?? '') - Date.parse(left.latestActivityAt ?? '');
        });
        setSessions(sortedSessions);
        const firstConversationId = sortedSessions[0]?.id ?? null;
        setSelectedConversationId(firstConversationId);
        if (firstConversationId) {
          await loadConversation(firstConversationId);
        }
      })
      .catch(() => {
        if (active) {
          setSessions([]);
          setSelectedConversationId(null);
        }
      });

    return () => {
      active = false;
    };
  }, [activeChannel]);

  useEffect(() => {
    if (!selectedConversationId) return;
    let active = true;
    void loadConversation(selectedConversationId)
      .then(() => {
        if (!active) return;
      })
      .catch(() => {
        if (!active) return;
        setConversation(null);
        setMessages([]);
      });

    return () => {
      active = false;
    };
  }, [selectedConversationId]);

  useEffect(() => {
    if (!selectedConversationId) return undefined;
    const timer = window.setInterval(() => {
      void hostApiFetch<{ sessions?: ChannelSyncSession[] }>(
        `/api/channels/workbench/sessions?channelType=${encodeURIComponent(activeChannel)}`,
      ).then((response) => {
        const sortedSessions = [...(response.sessions ?? [])].sort((left, right) => {
          if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
          return Date.parse(right.latestActivityAt ?? '') - Date.parse(left.latestActivityAt ?? '');
        });
        setSessions(sortedSessions);
      }).catch(() => undefined);
      void loadConversation(selectedConversationId);
    }, 5000);

    return () => {
      window.clearInterval(timer);
    };
  }, [activeChannel, selectedConversationId]);

  useEffect(() => {
    if (!selectedConversationId) return undefined;

    return subscribeHostEvent('gateway:notification', () => {
      void hostApiFetch<{ sessions?: ChannelSyncSession[] }>(
        `/api/channels/workbench/sessions?channelType=${encodeURIComponent(activeChannel)}`,
      ).then((response) => {
        const sortedSessions = [...(response.sessions ?? [])].sort((left, right) => {
          if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
          return Date.parse(right.latestActivityAt ?? '') - Date.parse(left.latestActivityAt ?? '');
        });
        setSessions(sortedSessions);
      }).catch(() => undefined);

      void loadConversation(selectedConversationId).catch(() => undefined);
    });
  }, [activeChannel, selectedConversationId]);

  const handleAdd = async () => {
    if (!addName.trim()) return;
    if (addType === 'feishu') {
      setAddOpen(false);
      setFeishuWizardInitialName(addName.trim());
      setFeishuWizardOpen(true);
      setAddName('');
      return;
    }
    setAddLoading(true);
    try {
      await addChannel({ type: addType, name: addName.trim() });
      setAddOpen(false);
      setAddName('');
    } finally {
      setAddLoading(false);
    }
  };

  const handleSend = async (retryText?: string) => {
    const text = (retryText ?? composerValue).trim();
    if (!text || !selectedChannel || !selectedConversationId) return;
    const convId = selectedConversationId;
    if (!retryText) setComposerValue('');
    // Append optimistic message immediately
    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticMsg: ChannelSyncMessage = {
      id: optimisticId,
      role: 'human',
      content: text,
      isSelf: true,
      optimistic: true,
      sendText: text,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => {
      // Remove any existing optimistic with same id (retry)
      const filtered = prev.filter((m) => m.id !== optimisticId);
      return [...filtered, optimisticMsg];
    });
    // For feishu-default sessions, construct a feishu: prefixed conversationId
    // so the backend routes it through the Feishu send path.
    let sendConversationId = convId;
    if (activeChannel === 'feishu' && !convId.startsWith('feishu:')) {
      // feishu-default → feishu:default:default (account:chatId)
      const accountId = convId.replace(/^feishu-/, '') || 'default';
      sendConversationId = `feishu:${accountId}:default`;
    }
    try {
      await hostApiFetch(`/api/channels/${encodeURIComponent(selectedChannel.id)}/send`, {
        method: 'POST',
        body: JSON.stringify({ text, conversationId: sendConversationId, identity: identityMode }),
      });
      // Replace optimistic with polled messages
      await loadConversation(convId);
      window.setTimeout(() => { void loadConversation(convId); }, 1000);
      window.setTimeout(() => { void loadConversation(convId); }, 2500);
      window.setTimeout(() => { void loadConversation(convId); }, 5000);
    } catch (error) {
      // Mark optimistic message as failed
      setMessages((prev) =>
        prev.map((m) =>
          m.id === optimisticId
            ? { ...m, optimistic: false, sendError: true }
            : m,
        ),
      );
      setTestResult({ ok: false, msg: String(error) });
      window.setTimeout(() => setTestResult(null), 6000);
    }
  };

  const ARCHIVE_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const filteredSessions = sessions.filter((s) => {
    if (!sessionSearchQuery) return true;
    const q = sessionSearchQuery.toLowerCase();
    if (s.title.toLowerCase().includes(q)) return true;
    if (s.previewText?.toLowerCase().includes(q)) return true;
    return false;
  });

  const handleTest = async () => {
    if (!selectedChannel) return;
    try {
      await hostApiFetch(`/api/channels/${encodeURIComponent(selectedChannel.id)}/test`, { method: 'POST' });
      setTestResult({ ok: true, msg: t('feedback.testSent', { defaultValue: '测试消息已发送' }) });
    } catch (error) {
      setTestResult({ ok: false, msg: String(error) });
    }
    window.setTimeout(() => setTestResult(null), 4000);
  };

  return (
    <div className="flex h-full flex-row overflow-hidden bg-[#f2f2f7]">
      <section className={cn(
        'flex w-[290px] shrink-0 flex-col border-r border-black/[0.06] bg-white',
        selectedConversationId ? 'hidden xl:flex' : 'flex',
      )}>
        <div className="flex h-[56px] items-center justify-between px-5">
          <div>
            <h1 className="text-[15px] font-semibold text-[#111827]">{CHANNEL_FAMILY_UI[activeChannel].panelTitle}</h1>
            <p className="text-[12px] text-[#8e8e93]">{t('syncWorkbench.sessionsTitle', { defaultValue: '同步会话' })}</p>
          </div>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-black/10 text-[16px] text-[#3c3c43] hover:bg-[#f8fafc]"
          >
            +
          </button>
        </div>

        <div className="px-4 pb-3">
          <input
            className="w-full rounded-2xl border border-black/10 bg-[#f4f7fb] px-4 py-2.5 text-[13px] outline-none"
            placeholder={t('syncWorkbench.searchPlaceholder', { defaultValue: '搜索群聊或机器人...' })}
            value={sessionSearchQuery}
            onChange={(e) => setSessionSearchQuery(e.target.value)}
            data-testid="session-search-input"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-3" data-testid="channels-conversation-list">
          {loading ? (
            <div className="px-2 py-8 text-[13px] text-[#8e8e93]">{t('common:status.loading')}</div>
          ) : error ? (
            <div className="px-2 py-8 text-[13px] text-[#ef4444]">{error}</div>
          ) : filteredSessions.length === 0 ? (
            <div className="px-2 py-8 text-[13px] text-[#8e8e93]">{t('syncWorkbench.emptySessions', { defaultValue: '暂无同步会话' })}</div>
          ) : (
            <div className="flex flex-col gap-2">
              {filteredSessions.map((session) => {
                const isActive = session.id === selectedConversationId;
                const isError = session.syncState === 'error';
                const lastActivity = session.latestActivityAt ? Date.parse(session.latestActivityAt) : null;
                const isArchived = lastActivity != null && (now - lastActivity) > ARCHIVE_THRESHOLD_MS;
                return (
                  <button
                    key={session.id}
                    type="button"
                    data-testid={`session-item-${session.id}`}
                    onClick={() => {
                      setSelectedConversationId(session.id);
                      void loadConversation(session.id);
                    }}
                    className={cn(
                      'rounded-2xl border px-3 py-3 text-left transition-colors',
                      isActive
                        ? 'border-l-[3px] border-[#6366f1] bg-[#EEF2FF]'
                        : 'border-black/[0.06] bg-white hover:bg-[#f8fafc]',
                      isArchived && 'opacity-50',
                    )}
                  >
                    <div className="mb-1 flex items-start justify-between gap-3">
                      <span className={cn('truncate text-[14px] font-medium text-[#111827]', isArchived && 'italic')} data-testid={isArchived ? `session-archived-${session.id}` : undefined}>
                        {isArchived ? `[归档] ${session.title}` : session.title}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {session.pinned ? <span className="text-[11px] text-[#f59e0b]">📌</span> : null}
                        {isError
                          ? <span className="h-2 w-2 rounded-full bg-[#ef4444]" data-testid={`session-error-badge-${session.id}`} />
                          : <span className="h-2 w-2 rounded-full bg-[#10b981]" />}
                      </div>
                    </div>
                    <div className="mb-2 flex items-center gap-2">
                      <span className="rounded-full bg-[#f1f5f9] px-2 py-0.5 text-[11px] text-[#475569]">
                        {SESSION_TYPE_LABEL[session.sessionType]}
                      </span>
                      {session.syncState && !isError ? (
                        <span className="rounded-full bg-[#eff6ff] px-2 py-0.5 text-[11px] text-[#0284c7]">
                          {session.syncState === 'synced' ? '已同步' : session.syncState}
                        </span>
                      ) : null}
                      {isError ? (
                        <span className="rounded-full bg-[#fee2e2] px-2 py-0.5 text-[11px] text-[#ef4444]">同步失败</span>
                      ) : null}
                    </div>
                    {session.previewText ? (
                      <p className="line-clamp-2 text-[12px] leading-5 text-[#64748b]">{session.previewText}</p>
                    ) : null}
                    <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-[#94a3b8]">
                      <span className="truncate">{session.participantSummary}</span>
                      <span>{formatRelativeTimestamp(session.latestActivityAt)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <main className="flex min-w-0 flex-1 flex-col bg-white">
        {!conversation || !selectedChannel ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <span className="text-[40px]">{CHANNEL_ICONS[activeChannel]}</span>
            <p className="text-[14px] text-[#8e8e93]">{t('syncWorkbench.emptyConversation', { defaultValue: '选择一个同步会话开始查看' })}</p>
          </div>
        ) : (
          <>
            <header className="flex h-[68px] shrink-0 items-center justify-between border-b border-black/[0.06] px-6">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  className="xl:hidden mr-1 flex h-7 w-7 items-center justify-center rounded-full text-[#6366f1] hover:bg-[#EEF2FF]"
                  onClick={() => setSelectedConversationId(null)}
                  aria-label="返回会话列表"
                  data-testid="back-to-sessions"
                >←</button>
                <h2 className="truncate text-[17px] font-semibold text-[#111827]">{conversation.title}</h2>
                <span className="rounded-full border border-[#dbeafe] bg-[#eff6ff] px-3 py-1 text-[12px] text-[#0284c7]">
                  {conversation.syncState === 'synced' ? '飞书同步中' : conversation.syncState}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[12px] text-[#64748b]">{conversation.participantSummary}</span>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  className="rounded-xl border border-black/10 px-3 py-1.5 text-[13px] text-[#3c3c43] hover:bg-[#f8fafc]"
                >
                  设置
                </button>
              </div>
            </header>

            {testResult ? (
              <div className={cn(
                'mx-6 mt-3 rounded-xl px-3 py-2 text-[12px]',
                testResult.ok ? 'bg-[#dcfce7] text-[#059669]' : 'bg-[#fee2e2] text-[#ef4444]',
              )}>
                {testResult.msg}
              </div>
            ) : null}

            <div
              ref={messageScrollRef}
              className="flex-1 overflow-y-auto px-6 py-6"
              onScroll={(event) => {
                const el = event.currentTarget;
                if (el.scrollTop === 0 && hasMoreMessages && !loadingMore) {
                  void loadMoreMessages();
                }
              }}
            >
              {loadingMore && (
                <div className="mb-4 flex justify-center">
                  <span className="text-[12px] text-[#94a3b8]">{t('syncWorkbench.loadingMore', { defaultValue: '加载更多…' })}</span>
                </div>
              )}
              <div className="mb-6 flex justify-center">
                <span className="rounded-full bg-[#f1f5f9] px-4 py-2 text-[12px] text-[#64748b]">
                  {t('syncWorkbench.filteredHint', { defaultValue: '已隐藏同步噪音，仅显示群聊消息、Agent 回复和精简工具卡' })}
                </span>
              </div>

              <div className="flex flex-col gap-5">
                {messages.map((message) => {
                  if (message.role === 'tool') {
                    return (
                      <div key={message.id} className="ml-[54px] max-w-[760px] rounded-2xl border border-black/[0.06] bg-[#f8fafc] p-3">
                        <div className="flex items-center justify-between gap-3 text-[12px]">
                          <div className="flex items-center gap-2 text-[#334155]">
                            <span>⚡</span>
                            <strong>{message.toolName}</strong>
                            {formatToolDuration(message.durationMs) ? (
                              <span className="text-[#94a3b8]">{formatToolDuration(message.durationMs)}</span>
                            ) : null}
                          </div>
                          <span className="text-[#94a3b8]">{t('syncWorkbench.compactToolCard', { defaultValue: '精简工具卡' })}</span>
                        </div>
                        {message.summary ? (
                          <p className="mt-2 text-[13px] leading-6 text-[#475569]">{message.summary}</p>
                        ) : null}
                      </div>
                    );
                  }

                  if (message.isSelf) {
                    // Right-aligned blue bubble — messages sent by the active agent/self
                    return (
                      <div key={message.id} data-testid={message.optimistic ? 'optimistic-bubble' : `msg-row-${message.id}`} className="flex flex-col items-end gap-1">
                        {message.authorName && (
                          <span className="mr-1 text-[11px] text-[#94a3b8]">{message.authorName}</span>
                        )}
                        <MessageBubble
                          message={message}
                          bubbleClass={message.sendError ? 'bg-[#fee2e2] text-[#991b1b]' : message.optimistic ? 'bg-[#93c5fd] text-white opacity-70' : 'bg-[#3b82f6] text-white'}
                          onImageClick={setLightboxUrl}
                        />
                        {message.sendError && (
                          <button
                            type="button"
                            data-testid={`retry-btn-${message.id}`}
                            className="mr-1 text-[11px] text-[#dc2626] underline"
                            onClick={() => {
                              const retryText = message.sendText ?? message.content ?? '';
                              if (retryText) {
                                setMessages((prev) => prev.filter((m) => m.id !== message.id));
                                setComposerValue(retryText);
                              }
                            }}
                          >
                            重试
                          </button>
                        )}
                        {message.optimistic && !message.sendError && (
                          <span className="mr-1 text-[10px] text-[#94a3b8]">发送中…</span>
                        )}
                      </div>
                    );
                  }

                  if (message.role === 'agent') {
                    // Left-aligned brand-color bubble
                    return (
                      <div key={message.id} data-testid={`msg-row-${message.id}`} className="flex items-start gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#4F46E5] text-[13px] font-semibold text-white">
                          {message.authorName?.charAt(0) ?? 'A'}
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-[12px] font-medium text-[#4F46E5]">{message.authorName ?? '机器人'}</span>
                          <MessageBubble
                            message={message}
                            bubbleClass="bg-[#f0f4ff] text-[#1e1b4b]"
                            onImageClick={setLightboxUrl}
                          />
                        </div>
                      </div>
                    );
                  }

                  // role=human isSelf=false — left-aligned grey bubble
                  return (
                    <div key={message.id} data-testid={`msg-row-${message.id}`} className="flex items-start gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e5e7eb] text-[13px] font-semibold text-[#475569]">
                        {message.authorName?.charAt(0) ?? '人'}
                      </div>
                      <div className="flex flex-col gap-1">
                        {message.authorName && (
                          <span className="text-[12px] font-medium text-[#6b7280]">{message.authorName}</span>
                        )}
                        <MessageBubble
                          message={message}
                          bubbleClass="bg-[#f3f4f6] text-[#111827]"
                          onImageClick={setLightboxUrl}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="shrink-0 border-t border-black/[0.06] px-5 py-4">
              {mentionOpen && (
                <div
                  data-testid="mention-popover"
                  className="mb-2 rounded-xl border border-black/[0.08] bg-white shadow-lg"
                >
                  {workbenchMembers.length === 0 ? (
                    <div className="px-4 py-2 text-[13px] text-[#94a3b8]">无成员</div>
                  ) : (
                    workbenchMembers
                      .filter((m) => !mentionQuery || m.name.toLowerCase().includes(mentionQuery.toLowerCase()))
                      .map((member, idx) => (
                        <button
                          key={member.openId}
                          type="button"
                          data-testid={`mention-item-${member.openId}`}
                          className={cn(
                            'flex w-full items-center gap-2 px-4 py-2 text-[13px] text-left hover:bg-[#f1f5f9]',
                            idx === mentionIndex && 'bg-[#f1f5f9] font-medium',
                          )}
                          onClick={() => {
                            setComposerValue((prev) => {
                              const atIdx = prev.lastIndexOf('@');
                              return atIdx >= 0 ? `${prev.slice(0, atIdx)}@${member.name} ` : `${prev}@${member.name} `;
                            });
                            setMentionOpen(false);
                            setMentionQuery('');
                            composerRef.current?.focus();
                          }}
                        >
                          {member.name}
                        </button>
                      ))
                  )}
                </div>
              )}
              <div className="flex items-center gap-3 rounded-[24px] border border-black/[0.08] bg-white px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
                <button type="button" className="text-[18px] text-[#94a3b8]">📎</button>
                <span className="inline-flex items-center gap-2 rounded-full bg-[#f1f5f9] px-3 py-1 text-[12px] font-medium text-[#475569]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#10b981]" />
                  {defaultModel || t('notConfigured', { defaultValue: '未配置模型' })}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-[#ecfeff] px-3 py-1 text-[12px] font-medium text-[#0f766e]">
                  当前发言身份：{conversation.visibleAgentId || 'KTClaw'}
                </span>
                {userAuthStatus === 'authorized' && (
                  <div
                    data-testid="identity-toggle"
                    aria-label="切换发言身份"
                    className="inline-flex items-center rounded-full border border-[#e2e8f0] bg-[#f8fafc] px-1 py-0.5 text-[12px] font-medium"
                  >
                    <button
                      type="button"
                      aria-label="机器人"
                      onClick={() => setIdentityMode('bot')}
                      className={cn(
                        'rounded-full px-2 py-0.5 transition-colors',
                        identityMode === 'bot' ? 'bg-[#0f172a] text-white' : 'text-[#64748b]',
                      )}
                    >
                      机器人
                    </button>
                    <button
                      type="button"
                      aria-label="我"
                      onClick={() => setIdentityMode('self')}
                      className={cn(
                        'rounded-full px-2 py-0.5 transition-colors',
                        identityMode === 'self' ? 'bg-[#0f172a] text-white' : 'text-[#64748b]',
                      )}
                    >
                      我
                    </button>
                  </div>
                )}
                <input
                  ref={composerRef}
                  value={composerValue}
                  onChange={(event) => {
                    const val = event.target.value;
                    setComposerValue(val);
                    // Open mention popover when '@' is typed
                    const atIdx = val.lastIndexOf('@');
                    if (atIdx >= 0 && !mentionOpen && val.endsWith('@')) {
                      setMentionOpen(true);
                      setMentionQuery('');
                      setMentionIndex(0);
                    } else if (atIdx >= 0 && mentionOpen) {
                      setMentionQuery(val.slice(atIdx + 1));
                      setMentionIndex(0);
                    } else if (atIdx < 0 && mentionOpen) {
                      setMentionOpen(false);
                      setMentionQuery('');
                    }
                  }}
                  onCompositionStart={() => {
                    isComposingRef.current = true;
                  }}
                  onCompositionEnd={() => {
                    isComposingRef.current = false;
                  }}
                  onKeyDown={(event) => {
                    if (mentionOpen) {
                      const filtered = workbenchMembers.filter(
                        (m) => !mentionQuery || m.name.toLowerCase().includes(mentionQuery.toLowerCase()),
                      );
                      if (event.key === 'ArrowDown') {
                        event.preventDefault();
                        setMentionIndex((prev) => Math.min(prev + 1, filtered.length - 1));
                        return;
                      }
                      if (event.key === 'ArrowUp') {
                        event.preventDefault();
                        setMentionIndex((prev) => Math.max(prev - 1, 0));
                        return;
                      }
                      if (event.key === 'Enter' && filtered[mentionIndex]) {
                        event.preventDefault();
                        const member = filtered[mentionIndex];
                        setComposerValue((prev) => {
                          const atIdx = prev.lastIndexOf('@');
                          return atIdx >= 0 ? `${prev.slice(0, atIdx)}@${member.name} ` : `${prev}@${member.name} `;
                        });
                        setMentionOpen(false);
                        setMentionQuery('');
                        return;
                      }
                      if (event.key === 'Escape') {
                        setMentionOpen(false);
                        setMentionQuery('');
                        return;
                      }
                    }
                    if (event.key === '@') {
                      setMentionOpen(true);
                      setMentionQuery('');
                      setMentionIndex(0);
                    }
                    if (event.key === 'Enter' && !event.shiftKey) {
                      const nativeEvent = event.nativeEvent as KeyboardEvent;
                      if (isComposingRef.current || nativeEvent.isComposing || nativeEvent.keyCode === 229) {
                        return;
                      }
                      event.preventDefault();
                      void handleSend();
                    }
                  }}
                  placeholder="在群聊发送消息（将同步至飞书）..."
                  className="min-w-0 flex-1 bg-transparent text-[14px] text-[#111827] outline-none placeholder:text-[#8e8e93]"
                />
                <button
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={!composerValue.trim()}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0f172a] text-white disabled:opacity-40"
                >
                  ➤
                </button>
              </div>
            </div>
          </>
        )}
      </main>

      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80"
          role="dialog"
          aria-modal="true"
          aria-label="图片预览"
          onClick={() => setLightboxUrl(null)}
        >
          <img
            src={lightboxUrl}
            alt=""
            className="max-h-[90vh] max-w-[90vw] object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            className="absolute right-6 top-6 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
            onClick={() => setLightboxUrl(null)}
            aria-label="关闭"
          >
            ×
          </button>
        </div>
      )}

      {settingsOpen && selectedChannel && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onClick={() => setSettingsOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="频道设置"
            className="flex h-full w-[360px] flex-col bg-white shadow-[-8px_0_24px_rgba(0,0,0,0.08)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex h-[56px] items-center justify-between border-b border-black/[0.06] px-5">
              <div>
                <h3 className="text-[15px] font-semibold text-[#111827]">频道设置</h3>
                <p className="text-[12px] text-[#8e8e93]">{selectedChannel.name}</p>
              </div>
              <button type="button" className="text-[18px] text-[#8e8e93]" onClick={() => setSettingsOpen(false)}>×</button>
            </div>

            <div className="flex flex-col gap-5 overflow-y-auto px-5 py-5">
              <div className="rounded-2xl border border-black/[0.06] p-4">
                <p className="mb-3 text-[12px] font-medium text-[#8e8e93]">配置控制</p>
                <div className="flex flex-wrap gap-2">
                  {selectedChannel.status === 'connected' ? (
                    <button type="button" onClick={() => void disconnectChannel(selectedChannel.id)} className="rounded-xl border border-black/10 px-3 py-2 text-[13px] text-[#3c3c43]">断开连接</button>
                  ) : (
                    <button type="button" onClick={() => void connectChannel(selectedChannel.id)} className="rounded-xl bg-[#0f172a] px-3 py-2 text-[13px] text-white">连接</button>
                  )}
                  <button type="button" onClick={() => void handleTest()} className="rounded-xl border border-black/10 px-3 py-2 text-[13px] text-[#3c3c43]">发送测试</button>
                  <button type="button" onClick={() => void deleteChannel(selectedChannel.id)} className="rounded-xl border border-[#ef4444]/30 px-3 py-2 text-[13px] text-[#ef4444]">删除</button>
                </div>
              </div>

              <div className="rounded-2xl border border-black/[0.06] p-4">
                <p className="mb-3 text-[12px] font-medium text-[#8e8e93]">配置字段</p>
                <div className="flex flex-col gap-3">
                  {selectedMeta.configFields.map((field) => (
                    <div key={field.key} className="flex items-center justify-between gap-4">
                      <span className="text-[13px] text-[#3c3c43]">{getDrawerFieldLabel(field.key, t(field.label))}</span>
                      <span className="font-mono text-[12px] text-[#8e8e93]">
                        {field.type === 'password' ? '••••••••' : field.label.includes('appId') ? 'cli_******' : '—'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {selectedRuntimeCapability && (
                <div className="rounded-2xl border border-black/[0.06] p-4">
                  <p className="mb-3 text-[12px] font-medium text-[#8e8e93]">Runtime capabilities</p>
                  <p className="text-[13px] text-[#3c3c43]">
                    Actions: {selectedRuntimeCapability.availableActions.join(', ')}
                  </p>
                  <p className="mt-1 text-[12px] text-[#8e8e93]">
                    Schema: {selectedRuntimeCapability.configSchemaSummary.totalFieldCount} fields (required {selectedRuntimeCapability.configSchemaSummary.requiredFieldCount})
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {addOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30">
          <div className="w-[360px] rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="mb-4 text-[16px] font-semibold text-[#000000]">{t('common:channels.addChannelTitle')}</h2>
            <div className="mb-3">
              <p className="mb-1.5 text-[13px] font-medium text-[#000000]">{t('common:channels.channelType')}</p>
              <select
                value={addType}
                onChange={(event) => setAddType(event.target.value as ChannelType)}
                className="w-full rounded-lg border border-black/10 px-3 py-2 text-[13px] text-[#000000]"
              >
                {DOMESTIC_CHANNEL_TYPES.map((entry) => (
                  <option key={entry} value={entry}>{CHANNEL_FAMILY_UI[entry].railLabel}</option>
                ))}
              </select>
            </div>
            <div className="mb-5">
              <p className="mb-1.5 text-[13px] font-medium text-[#000000]">{t('common:channels.channelName')}</p>
              <input
                value={addName}
                onChange={(event) => setAddName(event.target.value)}
                placeholder={t('common:channels.channelNamePlaceholder')}
                className="w-full rounded-lg border border-black/10 px-3 py-2 text-[13px] text-[#000000]"
              />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setAddOpen(false)} className="flex-1 rounded-xl border border-black/10 py-2 text-[13px] text-[#3c3c43]">
                {t('common:actions.cancel')}
              </button>
              <button
                type="button"
                onClick={() => void handleAdd()}
                disabled={addLoading || !addName.trim()}
                className="flex-1 rounded-xl bg-clawx-ac py-2 text-[13px] font-medium text-white disabled:opacity-50"
              >
                {addLoading ? t('common:channels.adding') : t('common:channels.confirmAdd')}
              </button>
            </div>
          </div>
        </div>
      )}

      {feishuWizardOpen && (
        <FeishuOnboardingWizard
          initialChannelName={feishuWizardInitialName}
          onClose={() => {
            setFeishuWizardOpen(false);
            setFeishuWizardInitialName('');
          }}
          onConfigured={async ({ channelName }) => {
            const hasFeishuChannel = channels.some((channel) => channel.type === 'feishu');
            if (!hasFeishuChannel) {
              await addChannel({
                type: 'feishu',
                name: channelName.trim() || CHANNEL_NAMES.feishu,
              });
            }
            await fetchChannels();
            setActiveChannel('feishu');
          }}
        />
      )}
    </div>
  );
}

export default Channels;
