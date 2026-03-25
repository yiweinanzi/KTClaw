import type { IncomingMessage, ServerResponse } from 'http';
import type { HostApiContext } from '../context';
import { sendJson } from '../route-utils';
import {
  getFeishuIntegrationStatus,
  installOrUpdateFeishuPlugin,
  runFeishuIntegrationDoctor,
} from '../../services/feishu-integration';

export async function handleFeishuRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  _ctx: HostApiContext,
): Promise<boolean> {
  if (url.pathname === '/api/feishu/status' && req.method === 'GET') {
    sendJson(res, 200, await getFeishuIntegrationStatus());
    return true;
  }

  if ((url.pathname === '/api/feishu/install' || url.pathname === '/api/feishu/update') && req.method === 'POST') {
    sendJson(res, 200, await installOrUpdateFeishuPlugin());
    return true;
  }

  if (url.pathname === '/api/feishu/doctor' && req.method === 'POST') {
    sendJson(res, 200, await runFeishuIntegrationDoctor());
    return true;
  }

  return false;
}
