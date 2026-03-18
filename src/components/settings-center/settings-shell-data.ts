export type SettingsGroupId = 'basic' | 'workflow' | 'capability' | 'governance';

export type SettingsSectionId =
  | 'general'
  | 'model-provider'
  | 'team-role-strategy'
  | 'channel-advanced'
  | 'automation-defaults'
  | 'memory-knowledge'
  | 'skills-mcp'
  | 'tool-permissions'
  | 'monitoring'
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
      { id: 'general', label: '常规设置', summary: '' },
      { id: 'model-provider', label: '模型与 Provider', summary: '' },
    ],
  },
  {
    id: 'workflow',
    label: '工作流',
    items: [
      { id: 'team-role-strategy', label: '团队与角色策略', summary: '' },
      { id: 'channel-advanced', label: '通道高级配置', summary: '' },
      { id: 'automation-defaults', label: '自动化默认策略', summary: '' },
    ],
  },
  {
    id: 'capability',
    label: '能力',
    items: [
      { id: 'memory-knowledge', label: '记忆与知识', summary: '' },
      { id: 'skills-mcp', label: 'Skills 与 MCP', summary: '' },
      { id: 'tool-permissions', label: '工具权限', summary: '' },
    ],
  },
  {
    id: 'governance',
    label: '治理',
    items: [
      { id: 'monitoring', label: '监控与统计', summary: '' },
      { id: 'migration-backup', label: '迁移与备份', summary: '' },
      { id: 'feedback-developer', label: '反馈与开发者', summary: '' },
    ],
  },
];

export const DEFAULT_SETTINGS_SECTION: SettingsSectionId = 'general';

export const SETTINGS_SECTION_META: Record<
  SettingsSectionId,
  { title: string; subtitle: string; kicker: string }
> = {
  general: {
    title: '常规设置',
    subtitle: '管理全局外观、语言以及应用启动行为。',
    kicker: '外观与体验、应用行为',
  },
  'model-provider': {
    title: '模型与服务商',
    subtitle: '配置核心推理引擎，绑定第三方 API Key，并指定全局兜底模型。',
    kicker: 'API Key 配置、大语言模型选择',
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
