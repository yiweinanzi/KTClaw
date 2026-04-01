/**
 * SessionSearchModal Component
 * Modal popup for searching sessions by name, agent, or content.
 * Includes both regular sessions and channel sync sessions.
 */

import { useEffect, useState, useMemo } from 'react';
import { Search, X, Radio } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { searchSessions } from '@/lib/session-search';
import { SessionItem } from './SessionItem';
import { useChatStore } from '@/stores/chat';
import { useAgentsStore } from '@/stores/agents';
import { useChannelsStore } from '@/stores/channels';
import { usePinnedSessions } from '@/lib/pinned-sessions';
import { hostApiFetch } from '@/lib/host-api';
import type { ChannelSyncSession } from '@/types/channel-sync';

interface SessionSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Combined search result type
type SearchResult =
  | { type: 'session'; data: any; key: string; label: string; preview: string; isPinned: boolean; isActive: boolean }
  | { type: 'channel'; data: ChannelSyncSession; key: string; label: string; preview: string; channelType: string };

export function SessionSearchModal({ isOpen, onClose }: SessionSearchModalProps) {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [channelSessions, setChannelSessions] = useState<ChannelSyncSession[]>([]);

  const sessions = useChatStore((state) => state.sessions);
  const currentSessionKey = useChatStore((state) => state.currentSessionKey);
  const sessionLabels = useChatStore((state) => state.sessionLabels);
  const sessionLastActivity = useChatStore((state) => state.sessionLastActivity);
  const messages = useChatStore((state) => state.messages);
  const switchSession = useChatStore((state) => state.switchSession);
  const deleteSession = useChatStore((state) => state.deleteSession);

  const agents = useAgentsStore((state) => state.agents);
  const channels = useChannelsStore((state) => state.channels);
  const { pinnedSessionKeySet, toggleSessionPinned } = usePinnedSessions();

  // Load channel sessions when modal opens
  useEffect(() => {
    if (!isOpen) return;

    const loadChannelSessions = async () => {
      const allChannelSessions: ChannelSyncSession[] = [];

      // Fetch sessions for each configured channel
      for (const channel of channels) {
        try {
          const response = await hostApiFetch<{ sessions?: ChannelSyncSession[] }>(
            `/api/channels/workbench/sessions?channelType=${encodeURIComponent(channel.type)}`
          );
          if (response.sessions) {
            allChannelSessions.push(...response.sessions);
          }
        } catch (error) {
          console.error(`Failed to load sessions for channel ${channel.type}:`, error);
        }
      }

      setChannelSessions(allChannelSessions);
    };

    void loadChannelSessions();
  }, [isOpen, channels]);

  // Debounce search input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Build message map for current session only
  const sessionMessagesMap = useMemo(() => {
    const map = new Map();
    if (currentSessionKey && messages.length > 0) {
      map.set(currentSessionKey, messages);
    }
    return map;
  }, [currentSessionKey, messages]);

  // Filter sessions using search function
  const filteredSessions = useMemo(() => {
    if (!debouncedQuery.trim()) {
      return sessions;
    }
    return searchSessions(sessions, debouncedQuery, agents, sessionMessagesMap);
  }, [sessions, debouncedQuery, agents, sessionMessagesMap]);

  // Filter channel sessions
  const filteredChannelSessions = useMemo(() => {
    if (!debouncedQuery.trim()) {
      return channelSessions;
    }
    const query = debouncedQuery.toLowerCase();
    return channelSessions.filter((session) => {
      return (
        session.title?.toLowerCase().includes(query) ||
        session.previewText?.toLowerCase().includes(query) ||
        session.participantSummary?.toLowerCase().includes(query)
      );
    });
  }, [channelSessions, debouncedQuery]);

  // Combine and sort all results
  const allResults = useMemo((): SearchResult[] => {
    const results: SearchResult[] = [];

    // Add regular sessions
    for (const session of filteredSessions) {
      const label = sessionLabels[session.key] ?? session.label ?? session.displayName ?? session.key;
      const isPinned = pinnedSessionKeySet.has(session.key);
      const isActive = currentSessionKey === session.key;
      const messages = sessionMessagesMap.get(session.key) || [];
      const preview = messages.length > 0
        ? (typeof messages[messages.length - 1].content === 'string'
          ? messages[messages.length - 1].content.slice(0, 50)
          : '')
        : '';

      results.push({
        type: 'session',
        data: session,
        key: session.key,
        label,
        preview,
        isPinned,
        isActive,
      });
    }

    // Add channel sessions
    for (const session of filteredChannelSessions) {
      results.push({
        type: 'channel',
        data: session,
        key: session.id,
        label: session.title || session.id,
        preview: session.previewText || '',
        channelType: session.channelType,
      });
    }

    // Sort: pinned first, then by activity
    return results.sort((left, right) => {
      if (left.type === 'session' && right.type === 'session') {
        if (left.isPinned !== right.isPinned) {
          return left.isPinned ? -1 : 1;
        }
        const leftActivity = sessionLastActivity[left.key] ?? left.data.updatedAt ?? 0;
        const rightActivity = sessionLastActivity[right.key] ?? right.data.updatedAt ?? 0;
        return rightActivity - leftActivity;
      }
      if (left.type === 'channel' && right.type === 'channel') {
        const leftTime = left.data.latestActivityAt ? new Date(left.data.latestActivityAt).getTime() : 0;
        const rightTime = right.data.latestActivityAt ? new Date(right.data.latestActivityAt).getTime() : 0;
        return rightTime - leftTime;
      }
      // Regular sessions before channel sessions
      return left.type === 'session' ? -1 : 1;
    });
  }, [filteredSessions, filteredChannelSessions, sessionLabels, pinnedSessionKeySet, currentSessionKey, sessionMessagesMap, sessionLastActivity]);

  // Handle ESC key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Handle result click
  const handleResultClick = (result: SearchResult) => {
    if (result.type === 'session') {
      // Regular session - switch to it
      switchSession(result.key);
      onClose();
    } else {
      // Channel session - navigate to channels page with conversation
      navigate(`/channels?channel=${result.channelType}&conversation=${encodeURIComponent(result.key)}`);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-20"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Header */}
        <div className="flex items-center gap-3 border-b border-black/10 px-4 py-3">
          <Search className="h-5 w-5 text-[#8e8e93]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索会话名称、Agent 或内容..."
            className="flex-1 text-sm text-[#000000] outline-none placeholder:text-[#8e8e93]"
            autoFocus
          />
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#8e8e93] transition-colors hover:bg-[#f2f2f7]"
            aria-label="Close search"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search Results */}
        <div className="max-h-[500px] overflow-y-auto p-2">
          {allResults.length > 0 ? (
            <div className="space-y-2">
              {allResults.map((result) => {
                if (result.type === 'session') {
                  // Regular session
                  return (
                    <SessionItem
                      key={result.key}
                      session={result.data}
                      label={result.label}
                      isPinned={result.isPinned}
                      isActive={result.isActive}
                      messagePreview={result.preview}
                      onClick={() => handleResultClick(result)}
                      onPinToggle={() => toggleSessionPinned(result.key)}
                      onDelete={() => void deleteSession(result.key)}
                    />
                  );
                } else {
                  // Channel session
                  return (
                    <button
                      key={result.key}
                      type="button"
                      onClick={() => handleResultClick(result)}
                      className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[#f2f2f7]"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#007aff]/10">
                        <Radio className="h-5 w-5 text-[#007aff]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-[#000000]">
                            {result.label}
                          </span>
                          <span className="shrink-0 rounded-md bg-[#007aff]/10 px-1.5 py-0.5 text-xs text-[#007aff]">
                            频道
                          </span>
                        </div>
                        {result.preview && (
                          <p className="mt-0.5 truncate text-xs text-[#8e8e93]">
                            {result.preview}
                          </p>
                        )}
                      </div>
                    </button>
                  );
                }
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Search className="mb-3 h-12 w-12 text-[#c6c6c8]" />
              <p className="text-sm text-[#8e8e93]">
                {debouncedQuery.trim() ? '未找到匹配的会话' : '输入关键词搜索会话'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
