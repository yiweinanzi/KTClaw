import type { IncomingMessage, ServerResponse } from 'http';
import {
  assignChannelToAgent,
  clearChannelBinding,
  createAgent,
  deleteAgentConfig,
  finalizeAgentDeletion,
  listAgentsSnapshot,
  removeAgentWorkspaceDirectory,
  resolveAccountIdForAgent,
  updateAgentProfile,
} from '../../utils/agent-config';
import {
  deleteAgentChannelAccounts,
  deleteChannelAccountConfig,
  readOpenClawConfig,
  writeOpenClawConfig,
} from '../../utils/channel-config';
import { logger } from '../../utils/logger';
import { syncAllProviderAuthToRuntime } from '../../services/providers/provider-runtime-sync';
import type { HostApiContext } from '../context';
import { parseJsonBody, sendJson } from '../route-utils';

function scheduleGatewayReload(ctx: HostApiContext, reason: string): void {
  if (ctx.gatewayManager.getStatus().state !== 'stopped') {
    ctx.gatewayManager.debouncedReload();
    return;
  }
  void reason;
}

function isGatewayPid(pid: unknown): pid is number {
  return typeof pid === 'number' && Number.isInteger(pid) && pid > 1;
}

function isNoSuchProcessError(error: unknown): boolean {
  return Boolean(error) && typeof error === 'object' && (error as NodeJS.ErrnoException).code === 'ESRCH';
}

/**
 * Force a full Gateway process restart after agent deletion.
 *
 * A SIGUSR1 in-process reload is NOT sufficient here: channel plugins
 * (e.g. Feishu) maintain long-lived WebSocket connections to external
 * services and do not disconnect accounts that were removed from the
 * config during an in-process reload. The only reliable way to drop
 * stale bot connections is to kill the Gateway process entirely and
 * spawn a fresh one that reads the updated openclaw.json from scratch.
 */
async function restartGatewayForAgentDeletion(ctx: HostApiContext): Promise<void> {
  const status = ctx.gatewayManager.getStatus();
  if (status.state === 'stopped') return;

  // Safety gate: never do blind "kill by port" for deletion flows.
  // Without a PID we cannot validate process identity, so surface
  // partial failure instead of risking unrelated processes.
  if (!isGatewayPid(status.pid)) {
    throw new Error(
      'Agent deleted, but Gateway restart could not be safely completed: missing Gateway PID (port-kill disabled).',
    );
  }

  const pid = status.pid;
  try {
    process.kill(pid, 'SIGTERM');
  } catch (error) {
    if (!isNoSuchProcessError(error)) {
      throw new Error(
        `Failed to stop Gateway PID ${pid}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 500));

  try {
    process.kill(pid, 0);
    process.kill(pid, 'SIGKILL');
  } catch (error) {
    if (!isNoSuchProcessError(error)) {
      throw new Error(
        `Failed to force-stop Gateway PID ${pid}: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }

  try {
    await ctx.gatewayManager.restart();
  } catch (error) {
    throw new Error(
      `Agent deleted, but Gateway restart failed after config removal: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
}

export async function handleAgentRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  ctx: HostApiContext,
): Promise<boolean> {
  if (url.pathname === '/api/agents' && req.method === 'GET') {
    sendJson(res, 200, { success: true, ...(await listAgentsSnapshot()) });
    return true;
  }

  if (url.pathname === '/api/agents' && req.method === 'POST') {
    try {
      const body = await parseJsonBody<{ name: string; persona?: string }>(req);
      const snapshot = await createAgent(body.name, body.persona);
      // Sync provider API keys to the new agent's auth-profiles.json so the
      // embedded runner can authenticate with LLM providers when messages
      // arrive via channel bots (e.g. Feishu). Without this, the copied
      // auth-profiles.json may contain a stale key -> 401 from the LLM.
      syncAllProviderAuthToRuntime().catch((err) => {
        logger.warn('[agents] Failed to sync provider auth after agent creation:', err);
      });
      scheduleGatewayReload(ctx, 'create-agent');
      sendJson(res, 200, { success: true, ...snapshot });
    } catch (error) {
      sendJson(res, 500, { success: false, error: String(error) });
    }
    return true;
  }

  if (url.pathname.startsWith('/api/agents/') && req.method === 'PUT') {
    const suffix = url.pathname.slice('/api/agents/'.length);
    const parts = suffix.split('/').filter(Boolean);

    if (parts.length === 1) {
      try {
        const body = await parseJsonBody<{ name?: string; persona?: string }>(req);
        const agentId = decodeURIComponent(parts[0]);
        const snapshot = await updateAgentProfile(agentId, {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.persona !== undefined ? { persona: body.persona } : {}),
        });
        scheduleGatewayReload(ctx, 'update-agent');
        sendJson(res, 200, { success: true, ...snapshot });
      } catch (error) {
        sendJson(res, 500, { success: false, error: String(error) });
      }
      return true;
    }

    if (parts.length === 3 && parts[1] === 'channels') {
      try {
        const agentId = decodeURIComponent(parts[0]);
        const channelType = decodeURIComponent(parts[2]);
        const snapshot = await assignChannelToAgent(agentId, channelType);
        scheduleGatewayReload(ctx, 'assign-channel');
        sendJson(res, 200, { success: true, ...snapshot });
      } catch (error) {
        sendJson(res, 500, { success: false, error: String(error) });
      }
      return true;
    }
  }

  if (url.pathname.startsWith('/api/agents/') && req.method === 'DELETE') {
    const suffix = url.pathname.slice('/api/agents/'.length);
    const parts = suffix.split('/').filter(Boolean);

    if (parts.length === 1) {
      let rollbackConfig: Record<string, unknown> | null = null;
      let deletionResult: { snapshot: Awaited<ReturnType<typeof listAgentsSnapshot>>; removedEntry: { id: string; workspace?: string } } | null = null;
      try {
        const agentId = decodeURIComponent(parts[0]);
        rollbackConfig = await readOpenClawConfig() as Record<string, unknown>;
        deletionResult = await deleteAgentConfig(agentId);
        await deleteAgentChannelAccounts(agentId);
        // Await reload synchronously BEFORE responding to the client.
        // This ensures the Feishu plugin has disconnected the deleted bot
        // before the UI shows "delete success" and the user tries chatting.
        await restartGatewayForAgentDeletion(ctx);
        await finalizeAgentDeletion(agentId).catch((err) => {
          logger.warn('[agents] Failed to remove agent runtime after deletion:', err);
        });
        // Delete workspace after reload so the new config is already live.
        await removeAgentWorkspaceDirectory(deletionResult.removedEntry).catch((err) => {
          logger.warn('[agents] Failed to remove workspace after agent deletion:', err);
        });
        sendJson(res, 200, { success: true, ...deletionResult.snapshot });
      } catch (error) {
        if (rollbackConfig && deletionResult) {
          try {
            await writeOpenClawConfig(rollbackConfig);
          } catch (rollbackError) {
            logger.warn('[agents] Failed to rollback agent deletion after gateway restart failure:', rollbackError);
          }
        }
        sendJson(res, 500, { success: false, error: String(error) });
      }
      return true;
    }

    if (parts.length === 3 && parts[1] === 'channels') {
      try {
        const agentId = decodeURIComponent(parts[0]);
        const channelType = decodeURIComponent(parts[2]);
        const accountId = resolveAccountIdForAgent(agentId);
        await deleteChannelAccountConfig(channelType, accountId);
        const snapshot = await clearChannelBinding(channelType, accountId);
        scheduleGatewayReload(ctx, 'remove-agent-channel');
        sendJson(res, 200, { success: true, ...snapshot });
      } catch (error) {
        sendJson(res, 500, { success: false, error: String(error) });
      }
      return true;
    }
  }

  return false;
}
