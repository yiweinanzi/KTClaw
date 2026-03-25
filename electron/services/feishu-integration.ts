import { app } from 'electron';
import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { getOpenClawConfigDir, getOpenClawStatus } from '../utils/paths';
import { runOpenClawDoctor, type OpenClawDoctorResult } from '../utils/openclaw-doctor';
import { validateChannelConfig, type ValidationResult } from '../utils/channel-config';

const FEISHU_DOCS_VERSION = '2026.3.25';
const OPENCLAW_MIN_VERSION_WINDOWS = '2026.3.2';
const OPENCLAW_MIN_VERSION_OTHER = '2026.2.26';
const OPENCLAW_PLUGIN_BREAKING_VERSION = '2026.3.22';
const FEISHU_RECOMMENDED_VERSION_NEW = '2026.3.25';
const FEISHU_RECOMMENDED_VERSION_LEGACY = '2026.3.18';
const FEISHU_PLUGIN_DIR_NAME = 'feishu-openclaw-plugin';
const FEISHU_PLUGIN_ALT_DIR_NAME = 'openclaw-lark';

export type FeishuNextAction =
  | 'upgrade-openclaw'
  | 'install-plugin'
  | 'update-plugin'
  | 'configure-channel'
  | 'ready';

export interface FeishuPluginLocationInfo {
  source: 'bundled' | 'node_modules' | 'installed' | 'missing';
  dir: string | null;
  version: string | null;
}

export interface FeishuIntegrationStatus {
  docsVersion: string;
  openClaw: {
    version: string | null;
    minVersion: string;
    compatible: boolean;
  };
  plugin: {
    bundledVersion: string | null;
    bundledSource: string | null;
    installedVersion: string | null;
    installedPath: string | null;
    recommendedVersion: string;
    installed: boolean;
    needsUpdate: boolean;
  };
  channel: {
    configured: boolean;
    accountIds: string[];
    pluginEnabled: boolean;
  };
  nextAction: FeishuNextAction;
}

export interface FeishuPluginInstallResult {
  success: boolean;
  source: 'bundled' | 'node_modules' | 'missing';
  version: string | null;
  sourcePath: string | null;
  installedPath: string;
  error?: string;
}

export interface FeishuDoctorSummary {
  doctor: OpenClawDoctorResult;
  validation: ValidationResult;
  status: FeishuIntegrationStatus;
}

function parseVersionParts(version: string | null | undefined): number[] {
  if (!version) return [];
  return version.split('.').map((part) => Number.parseInt(part, 10) || 0);
}

function compareVersions(a: string | null | undefined, b: string | null | undefined): number {
  const left = parseVersionParts(a);
  const right = parseVersionParts(b);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (left[index] || 0) - (right[index] || 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

async function readPackageVersion(packageJsonPath: string): Promise<string | null> {
  try {
    const raw = await readFile(packageJsonPath, 'utf8');
    const parsed = JSON.parse(raw) as { version?: string };
    return typeof parsed.version === 'string' && parsed.version.trim().length > 0
      ? parsed.version.trim()
      : null;
  } catch {
    return null;
  }
}

function getBundledPluginCandidates(): Array<{ source: 'bundled' | 'node_modules'; dir: string }> {
  const appPath = typeof app.getAppPath === 'function' ? app.getAppPath() : process.cwd();
  if (app.isPackaged) {
    return [
      { source: 'bundled', dir: join(process.resourcesPath, 'openclaw-plugins', FEISHU_PLUGIN_DIR_NAME) },
      { source: 'bundled', dir: join(process.resourcesPath, 'app.asar.unpacked', 'build', 'openclaw-plugins', FEISHU_PLUGIN_DIR_NAME) },
      { source: 'bundled', dir: join(process.resourcesPath, 'app.asar.unpacked', 'openclaw-plugins', FEISHU_PLUGIN_DIR_NAME) },
    ];
  }

  return [
    { source: 'bundled', dir: join(process.cwd(), 'build', 'openclaw-plugins', FEISHU_PLUGIN_DIR_NAME) },
    { source: 'bundled', dir: join(appPath, 'build', 'openclaw-plugins', FEISHU_PLUGIN_DIR_NAME) },
    { source: 'node_modules', dir: join(process.cwd(), 'node_modules', '@larksuite', 'openclaw-lark') },
  ];
}

async function resolveBundledPluginInfo(): Promise<FeishuPluginLocationInfo> {
  for (const candidate of getBundledPluginCandidates()) {
    const manifestPath = join(candidate.dir, 'openclaw.plugin.json');
    if (!existsSync(manifestPath)) continue;
    return {
      source: candidate.source,
      dir: candidate.dir,
      version: await readPackageVersion(join(candidate.dir, 'package.json')),
    };
  }

  return { source: 'missing', dir: null, version: null };
}

async function resolveInstalledPluginInfo(): Promise<FeishuPluginLocationInfo> {
  const extensionsDir = join(getOpenClawConfigDir(), 'extensions');
  const candidates = [
    join(extensionsDir, FEISHU_PLUGIN_DIR_NAME),
    join(extensionsDir, FEISHU_PLUGIN_ALT_DIR_NAME),
  ];

  for (const candidate of candidates) {
    if (!existsSync(join(candidate, 'openclaw.plugin.json'))) continue;
    return {
      source: 'installed',
      dir: candidate,
      version: await readPackageVersion(join(candidate, 'package.json')),
    };
  }

  return { source: 'missing', dir: null, version: null };
}

async function readFeishuChannelState(): Promise<{
  configured: boolean;
  accountIds: string[];
  pluginEnabled: boolean;
}> {
  const configPath = join(getOpenClawConfigDir(), 'openclaw.json');
  try {
    const raw = await readFile(configPath, 'utf8');
    const parsed = JSON.parse(raw) as {
      channels?: Record<string, unknown>;
      plugins?: {
        allow?: string[];
        entries?: Record<string, { enabled?: boolean }>;
      };
    };
    const channelSection = parsed.channels?.feishu as { accounts?: Record<string, unknown> } | undefined;
    const accountIds = channelSection?.accounts ? Object.keys(channelSection.accounts) : [];
    const allow = Array.isArray(parsed.plugins?.allow) ? parsed.plugins?.allow : [];
    const entryEnabled = parsed.plugins?.entries?.['openclaw-lark']?.enabled !== false;
    const pluginEnabled = allow.includes('openclaw-lark') && entryEnabled;

    return {
      configured: accountIds.length > 0,
      accountIds,
      pluginEnabled,
    };
  } catch {
    return {
      configured: false,
      accountIds: [],
      pluginEnabled: false,
    };
  }
}

function resolveRecommendedPluginVersion(openClawVersion: string | null): string {
  if (compareVersions(openClawVersion, OPENCLAW_PLUGIN_BREAKING_VERSION) >= 0) {
    return FEISHU_RECOMMENDED_VERSION_NEW;
  }
  return FEISHU_RECOMMENDED_VERSION_LEGACY;
}

export async function getFeishuIntegrationStatus(): Promise<FeishuIntegrationStatus> {
  const openClawStatus = getOpenClawStatus();
  const bundledPlugin = await resolveBundledPluginInfo();
  const installedPlugin = await resolveInstalledPluginInfo();
  const channelState = await readFeishuChannelState();

  const minVersion = process.platform === 'win32'
    ? OPENCLAW_MIN_VERSION_WINDOWS
    : OPENCLAW_MIN_VERSION_OTHER;
  const compatible = compareVersions(openClawStatus.version ?? null, minVersion) >= 0;
  const recommendedVersion = resolveRecommendedPluginVersion(openClawStatus.version ?? null);
  const needsUpdate = Boolean(
    installedPlugin.version
      && compareVersions(installedPlugin.version, recommendedVersion) < 0
      && bundledPlugin.version
      && compareVersions(bundledPlugin.version, installedPlugin.version) > 0,
  );

  let nextAction: FeishuNextAction = 'ready';
  if (!compatible) {
    nextAction = 'upgrade-openclaw';
  } else if (!installedPlugin.dir) {
    nextAction = 'install-plugin';
  } else if (needsUpdate) {
    nextAction = 'update-plugin';
  } else if (!channelState.configured || !channelState.pluginEnabled) {
    nextAction = 'configure-channel';
  }

  return {
    docsVersion: FEISHU_DOCS_VERSION,
    openClaw: {
      version: openClawStatus.version ?? null,
      minVersion,
      compatible,
    },
    plugin: {
      bundledVersion: bundledPlugin.version,
      bundledSource: bundledPlugin.dir,
      installedVersion: installedPlugin.version,
      installedPath: installedPlugin.dir,
      recommendedVersion,
      installed: Boolean(installedPlugin.dir),
      needsUpdate,
    },
    channel: channelState,
    nextAction,
  };
}

export async function installOrUpdateFeishuPlugin(): Promise<FeishuPluginInstallResult> {
  const source = await resolveBundledPluginInfo();
  const installedPath = join(getOpenClawConfigDir(), 'extensions', FEISHU_PLUGIN_DIR_NAME);

  if (!source.dir) {
    return {
      success: false,
      source: 'missing',
      version: null,
      sourcePath: null,
      installedPath,
      error: 'Bundled Feishu plugin source not found',
    };
  }

  await mkdir(join(getOpenClawConfigDir(), 'extensions'), { recursive: true });
  await rm(installedPath, { recursive: true, force: true });
  await cp(source.dir, installedPath, { recursive: true, force: true });

  return {
    success: true,
    source: source.source,
    version: source.version,
    sourcePath: source.dir,
    installedPath,
  };
}

export async function runFeishuIntegrationDoctor(): Promise<FeishuDoctorSummary> {
  const [doctor, validation, status] = await Promise.all([
    runOpenClawDoctor(),
    validateChannelConfig('feishu'),
    getFeishuIntegrationStatus(),
  ]);

  return {
    doctor,
    validation,
    status,
  };
}
