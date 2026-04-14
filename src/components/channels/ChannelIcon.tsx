import dingtalkIcon from '@/assets/channels/dingtalk.svg';
import feishuIcon from '@/assets/channels/feishu.svg';
import qqIcon from '@/assets/channels/qq.svg';
import wechatIcon from '@/assets/channels/wechat.svg';
import wecomIcon from '@/assets/channels/wecom.svg';
import { cn } from '@/lib/utils';
import { CHANNEL_ICONS, CHANNEL_NAMES, type ChannelType } from '@/types/channel';

const CHANNEL_ICON_ASSETS: Partial<Record<ChannelType, string>> = {
  dingtalk: dingtalkIcon,
  feishu: feishuIcon,
  qqbot: qqIcon,
  wechat: wechatIcon,
  wecom: wecomIcon,
};

const CHANNEL_ICON_LABELS: Partial<Record<ChannelType, string>> = {
  dingtalk: 'DingTalk',
  feishu: 'Feishu / Lark',
  qqbot: 'QQ Bot',
  wechat: '微信',
  wecom: 'WeCom',
};

export interface ChannelIconProps {
  type: ChannelType;
  className?: string;
  alt?: string;
  title?: string;
}

export function ChannelIcon({ type, className, alt, title }: ChannelIconProps) {
  const asset = CHANNEL_ICON_ASSETS[type];
  const accessibleLabel = alt ?? CHANNEL_ICON_LABELS[type] ?? CHANNEL_NAMES[type] ?? type;

  if (asset) {
    return (
      <img
        src={asset}
        alt={accessibleLabel}
        title={title}
        className={cn('object-contain', className)}
      />
    );
  }

  return (
    <span
      role="img"
      aria-label={accessibleLabel}
      title={title}
      className={cn('inline-flex items-center justify-center', className)}
    >
      {CHANNEL_ICONS[type] ?? '🔌'}
    </span>
  );
}
