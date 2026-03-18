export type SettingsGroupId = 'basic' | 'workflow' | 'capability' | 'governance';

export type SettingsSectionId =
  | 'general'
  | 'model-provider'
  | 'network-proxy'
  | 'team-role-strategy'
  | 'channel-advanced'
  | 'automation-defaults'
  | 'memory-knowledge'
  | 'skills-mcp'
  | 'tool-permissions'
  | 'monitoring'
  | 'security-audit'
  | 'migration-backup'
  | 'feedback-developer';

export type SettingsNavItem = {
  id: SettingsSectionId;
  label: string;
  summary: string;
};

export type SettingsNavGroup = {
  id: SettingsGroupId;
  label: string;
  items: SettingsNavItem[];
};

export const SETTINGS_NAV_GROUPS: SettingsNavGroup[] = [
  {
    id: 'basic',
    label: '基础',
    items: [
      { id: 'general', label: '常规设置', summary: '主题、语言与启动偏好' },
      { id: 'model-provider', label: '模型与 Provider', summary: '默认模型路由与云端配置' },
      { id: 'network-proxy', label: '网络与代理', summary: '网关代理、连通性与出口策略' },
    ],
  },
  {
    id: 'workflow',
    label: '工作流',
    items: [
      { id: 'team-role-strategy', label: '团队与角色策略', summary: '团队模板、职责分层与协同约束' },
      { id: 'channel-advanced', label: '通道高级配置', summary: '渠道路由与通知编排' },
      { id: 'automation-defaults', label: '自动化默认策略', summary: 'Cron 默认模板与运行节奏' },
    ],
  },
  {
    id: 'capability',
    label: '能力',
    items: [
      { id: 'memory-knowledge', label: '记忆与知识', summary: '知识策略、索引与数据浏览' },
      { id: 'skills-mcp', label: 'Skills 与 MCP', summary: '能力包、工具接入与目录治理' },
      { id: 'tool-permissions', label: '工具权限', summary: '执行白名单与风险边界' },
    ],
  },
  {
    id: 'governance',
    label: '治理',
    items: [
      { id: 'monitoring', label: '监控与统计', summary: '成本、用量、异常与运行态势' },
      { id: 'security-audit', label: '安全与审计', summary: '审计策略、留存与审批基线' },
      { id: 'migration-backup', label: '迁移与备份', summary: '快照迁移、恢复与导出' },
      { id: 'feedback-developer', label: '反馈与开发者', summary: '更新、诊断与开发者工具' },
    ],
  },
];

export const DEFAULT_SETTINGS_SECTION: SettingsSectionId = 'monitoring';

export const SETTINGS_SECTION_META: Record<
  SettingsSectionId,
  { title: string; subtitle: string; kicker: string }
> = {
  general: {
    title: '常规设置',
    subtitle: '管理应用的视觉风格、语言偏好与本地启动行为。',
    kicker: '基础',
  },
  'model-provider': {
    title: '模型与 Provider',
    subtitle: '保留现有 Provider 管理能力，并以新的卡片层级承载它。',
    kicker: '基础',
  },
  'network-proxy': {
    title: '网络与代理',
    subtitle: '集中管理 Gateway 代理、协议出口与网络排障信息。',
    kicker: '基础',
  },
  'team-role-strategy': {
    title: '团队与角色策略',
    subtitle: '以静态草案形式呈现团队模板、角色职责和协作边界。',
    kicker: '工作流',
  },
  'channel-advanced': {
    title: '通道高级配置',
    subtitle: '展示消息通道的路由、限流和故障兜底策略。',
    kicker: '工作流',
  },
  'automation-defaults': {
    title: '自动化默认策略',
    subtitle: '为定时任务、触发器和默认编排策略提供可视化骨架。',
    kicker: '工作流',
  },
  'memory-knowledge': {
    title: '记忆与知识',
    subtitle: '保留能力页骨架，后续承接数据浏览器与知识索引视图。',
    kicker: '能力',
  },
  'skills-mcp': {
    title: 'Skills 与 MCP',
    subtitle: '呈现技能安装、MCP 连接器与可用状态的统一入口。',
    kicker: '能力',
  },
  'tool-permissions': {
    title: '工具权限',
    subtitle: '聚焦执行白名单、风险分级和受控运行策略。',
    kicker: '能力',
  },
  monitoring: {
    title: '监控与统计',
    subtitle: '从 transcript usage 与 Cron 成本视角审视系统运行状态。',
    kicker: '治理',
  },
  'security-audit': {
    title: '安全与审计',
    subtitle: '聚合审计日志保留、审批流和隔离策略的静态面板。',
    kicker: '治理',
  },
  'migration-backup': {
    title: '迁移与备份',
    subtitle: '延续设计稿中的快照迁移与冷备份工作流。',
    kicker: '治理',
  },
  'feedback-developer': {
    title: '反馈与开发者',
    subtitle: '继续承载更新、Doctor 诊断和开发者模式等真实功能。',
    kicker: '治理',
  },
};
