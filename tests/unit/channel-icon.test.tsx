import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChannelIcon } from '@/components/channels/ChannelIcon';

describe('ChannelIcon', () => {
  it('renders svg assets for domestic workbench channels', () => {
    render(
      <div>
        <ChannelIcon type="feishu" />
        <ChannelIcon type="dingtalk" />
        <ChannelIcon type="wecom" />
        <ChannelIcon type="qqbot" />
        <ChannelIcon type="wechat" />
      </div>,
    );

    for (const name of ['Feishu / Lark', 'DingTalk', 'WeCom', 'QQ Bot', '微信']) {
      const icon = screen.getByRole('img', { name });
      expect(icon.tagName).toBe('IMG');
      expect(icon).toHaveAttribute('src');
    }
  });

  it('falls back to emoji rendering for channels without a dedicated asset', () => {
    render(<ChannelIcon type="telegram" />);

    expect(screen.getByRole('img', { name: 'Telegram' })).toHaveTextContent('✈️');
  });
});
