import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { RawMessage } from '@/stores/chat';
import { ChatMessage } from '@/pages/Chat/ChatMessage';

describe('ChatMessage', () => {
  it('renders user bubble with the current accent-token styling', () => {
    const message: RawMessage = {
      role: 'user',
      content: '用户消息',
      timestamp: 1710000000,
    };

    render(<ChatMessage message={message} showThinking={false} />);

    const text = screen.getByText('用户消息');
    const bubble = screen.getByTestId('chat-bubble-user');

    expect(text).toBeInTheDocument();
    expect(bubble).toHaveClass('bg-clawx-ac');
    expect(bubble).toHaveClass('text-white');
  });

  it('renders assistant tool card and allows expanding tool input', () => {
    const message: RawMessage = {
      role: 'assistant',
      content: [
        { type: 'tool_use', id: 'tool-1', name: 'query_k8s_logs', input: { range: '24h' } },
      ],
      timestamp: 1710001000,
    };

    render(<ChatMessage message={message} showThinking={false} />);

    expect(screen.getByText('工具执行')).toBeInTheDocument();
    expect(screen.getByText('query_k8s_logs')).toBeInTheDocument();
    expect(screen.queryByText(/"range": "24h"/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /工具执行/ }));

    expect(screen.getByText(/"range": "24h"/)).toBeInTheDocument();
  });

  it('renders assistant markdown text with inline code in the current neutral assistant surface', () => {
    const message: RawMessage = {
      role: 'assistant',
      content: '结果包含 **重点** 和 `trace_id`。',
      timestamp: 1710002000,
    };

    render(<ChatMessage message={message} showThinking={false} />);

    const strong = screen.getByText('重点');
    const code = screen.getByText('trace_id');
    const bubble = screen.getByTestId('chat-bubble-assistant');

    expect(strong.tagName.toLowerCase()).toBe('strong');
    expect(code.tagName.toLowerCase()).toBe('code');
    expect(bubble).toHaveClass('bg-white');
    expect(bubble).toHaveClass('text-black');
  });
});
