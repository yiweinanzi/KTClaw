/**
 * Chat Page
 * Native React implementation communicating with OpenClaw Gateway
 * via gateway:rpc IPC. The page now acts as the main KaiTianClaw
 * workbench surface while retaining the existing chat runtime wiring.
 */
import { useEffect, useState } from 'react';
import { AlertCircle, Loader2, Sparkles } from 'lucide-react';
import { useChatStore, type RawMessage } from '@/stores/chat';
import { useGatewayStore } from '@/stores/gateway';
import { useAgentsStore } from '@/stores/agents';
import { LoadingSpinner } from '@/components/common/LoadingSpinner';
import { WorkbenchEmptyState } from '@/components/workbench/workbench-empty-state';
import { ContextRail } from '@/components/workbench/context-rail';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { extractImages, extractText, extractThinking, extractToolUse } from './message-utils';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useStickToBottomInstant } from '@/hooks/use-stick-to-bottom-instant';
import { useMinLoading } from '@/hooks/use-min-loading';

export function Chat() {
  const { t } = useTranslation(['chat', 'common']);
  const gatewayStatus = useGatewayStore((s) => s.status);
  const isGatewayRunning = gatewayStatus.state === 'running';

  const messages = useChatStore((s) => s.messages);
  const currentSessionKey = useChatStore((s) => s.currentSessionKey);
  const loading = useChatStore((s) => s.loading);
  const sending = useChatStore((s) => s.sending);
  const error = useChatStore((s) => s.error);
  const showThinking = useChatStore((s) => s.showThinking);
  const streamingMessage = useChatStore((s) => s.streamingMessage);
  const streamingTools = useChatStore((s) => s.streamingTools);
  const pendingFinal = useChatStore((s) => s.pendingFinal);
  const currentAgentId = useChatStore((s) => s.currentAgentId);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const abortRun = useChatStore((s) => s.abortRun);
  const clearError = useChatStore((s) => s.clearError);
  const cleanupEmptySession = useChatStore((s) => s.cleanupEmptySession);

  const agents = useAgentsStore((s) => s.agents);
  const fetchAgents = useAgentsStore((s) => s.fetchAgents);

  const minLoading = useMinLoading(loading && messages.length > 0);
  const { contentRef, scrollRef } = useStickToBottomInstant(currentSessionKey);
  const [streamingTimestamp, setStreamingTimestamp] = useState(0);

  const currentAgentName = agents.find((agent) => agent.id === currentAgentId)?.name ?? 'KaiTianClaw';

  useEffect(() => {
    return () => {
      cleanupEmptySession();
    };
  }, [cleanupEmptySession]);

  useEffect(() => {
    void fetchAgents();
  }, [fetchAgents]);

  const streamMsg = streamingMessage && typeof streamingMessage === 'object'
    ? streamingMessage as { role?: string; content?: unknown; timestamp?: number }
    : null;
  const streamText = streamMsg ? extractText(streamMsg) : (typeof streamingMessage === 'string' ? streamingMessage : '');
  const hasStreamText = streamText.trim().length > 0;
  const streamThinking = streamMsg ? extractThinking(streamMsg) : null;
  const hasStreamThinking = showThinking && !!streamThinking && streamThinking.trim().length > 0;
  const streamTools = streamMsg ? extractToolUse(streamMsg) : [];
  const hasStreamTools = streamTools.length > 0;
  const streamImages = streamMsg ? extractImages(streamMsg) : [];
  const hasStreamImages = streamImages.length > 0;
  const hasStreamToolStatus = streamingTools.length > 0;
  const shouldRenderStreaming = sending && (hasStreamText || hasStreamThinking || hasStreamTools || hasStreamImages || hasStreamToolStatus);
  const hasAnyStreamContent = hasStreamText || hasStreamThinking || hasStreamTools || hasStreamImages || hasStreamToolStatus;

  const isEmpty = messages.length === 0 && !sending;

  const handleSendMessage = (
    text: string,
    attachments?: Parameters<typeof sendMessage>[1],
    targetAgentId?: Parameters<typeof sendMessage>[2],
  ) => {
    setStreamingTimestamp(Date.now() / 1000);
    sendMessage(text, attachments, targetAgentId);
  };

  return (
    <div className={cn('relative -m-6 flex h-[calc(100vh-2.5rem)] min-h-0 bg-white transition-colors duration-500 dark:bg-background')}>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-[52px] shrink-0 items-center justify-between gap-4 bg-white px-5 dark:bg-background">
          <div className="flex min-w-0 items-center gap-[6px]">
            <h1 className="truncate text-[15px] font-semibold text-foreground">
              {currentAgentName}
            </h1>
            <span className="text-[12px] text-[#8e8e93]">▾</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-lg border border-black/10 bg-white px-3 py-[5px] text-[13px] font-medium text-black shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all hover:-translate-y-[1px] hover:bg-[#f9f9f9] hover:shadow-[0_2px_4px_rgba(0,0,0,0.06)] hover:border-black/15 active:scale-[0.98] active:shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
            >
              📄 {t('common:workbench.files')}
            </button>
            <button
              type="button"
              className="rounded-lg border border-black/10 bg-white px-3 py-[5px] text-[13px] font-medium text-black shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all hover:-translate-y-[1px] hover:bg-[#f9f9f9] hover:shadow-[0_2px_4px_rgba(0,0,0,0.06)] hover:border-black/15 active:scale-[0.98] active:shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
            >
              🤖 {t('common:workbench.agent')}
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            <div ref={scrollRef} className="flex-1 overflow-y-auto bg-[#fafafc] px-8 py-5 dark:bg-background">
              <div ref={contentRef} className="mx-auto flex min-h-full max-w-[1000px] flex-col space-y-6">
                {isEmpty ? (
                  <WorkbenchEmptyState />
                ) : (
                  <>
                    {messages.map((msg, idx) => (
                      <ChatMessage
                        key={msg.id || `msg-${idx}`}
                        message={msg}
                        showThinking={showThinking}
                      />
                    ))}

                    {shouldRenderStreaming && (
                      <ChatMessage
                        message={(streamMsg
                          ? {
                              ...(streamMsg as Record<string, unknown>),
                              role: (typeof streamMsg.role === 'string' ? streamMsg.role : 'assistant') as RawMessage['role'],
                              content: streamMsg.content ?? streamText,
                              timestamp: streamMsg.timestamp ?? streamingTimestamp,
                            }
                          : {
                              role: 'assistant',
                              content: streamText,
                              timestamp: streamingTimestamp,
                            }) as RawMessage}
                        showThinking={showThinking}
                        isStreaming
                        streamingTools={streamingTools}
                      />
                    )}

                    {sending && pendingFinal && !shouldRenderStreaming && (
                      <ActivityIndicator phase="tool_processing" />
                    )}

                    {sending && !pendingFinal && !hasAnyStreamContent && (
                      <TypingIndicator />
                    )}
                  </>
                )}
              </div>
            </div>

            {error && (
              <div className="border-t border-destructive/20 bg-destructive/10 px-6 py-2">
                <div className="mx-auto flex max-w-4xl items-center justify-between">
                  <p className="flex items-center gap-2 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    {error}
                  </p>
                  <button
                    onClick={clearError}
                    className="text-xs text-destructive/60 underline hover:text-destructive"
                  >
                    {t('common:actions.dismiss')}
                  </button>
                </div>
              </div>
            )}

            <div className="px-2 pb-2">
              <ChatInput
                onSend={handleSendMessage}
                onStop={abortRun}
                disabled={!isGatewayRunning}
                sending={sending}
                isEmpty={isEmpty}
              />
            </div>
          </div>

          <ContextRail />
        </div>
      </div>

      {minLoading && !sending && (
        <div className="absolute inset-0 z-50 flex items-center justify-center rounded-xl bg-background/20 backdrop-blur-[1px] pointer-events-auto">
          <div className="rounded-full border border-border bg-background p-2.5 shadow-lg">
            <LoadingSpinner size="md" />
          </div>
        </div>
      )}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/5 text-foreground dark:bg-white/5">
        <Sparkles className="h-4 w-4" />
      </div>
      <div className="rounded-2xl bg-black/5 px-4 py-3 text-foreground dark:bg-white/5">
        <div className="flex gap-1">
          <span className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="h-2 w-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}

function ActivityIndicator({ phase }: { phase: 'tool_processing' }) {
  void phase;
  return (
    <div className="flex gap-3">
      <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/5 text-foreground dark:bg-white/5">
        <Sparkles className="h-4 w-4" />
      </div>
      <div className="rounded-2xl bg-black/5 px-4 py-3 text-foreground dark:bg-white/5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          <span>Processing tool results...</span>
        </div>
      </div>
    </div>
  );
}

export default Chat;
