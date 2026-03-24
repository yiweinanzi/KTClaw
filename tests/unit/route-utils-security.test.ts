import { describe, expect, it } from 'vitest';
import type { IncomingMessage } from 'node:http';
import { HOST_API_SESSION_HEADER, isAuthorizedHostApiRequest } from '@electron/api/route-utils';

describe('route-utils host api authorization', () => {
  it('rejects requests without the host session header', () => {
    expect(isAuthorizedHostApiRequest({ headers: {} } as IncomingMessage, 'session-token')).toBe(false);
  });

  it('rejects requests with the wrong host session header', () => {
    expect(
      isAuthorizedHostApiRequest(
        {
          headers: {
            [HOST_API_SESSION_HEADER]: 'wrong-token',
          },
        } as unknown as IncomingMessage,
        'session-token',
      ),
    ).toBe(false);
  });

  it('accepts requests with the matching host session header', () => {
    expect(
      isAuthorizedHostApiRequest(
        {
          headers: {
            [HOST_API_SESSION_HEADER]: 'session-token',
          },
        } as unknown as IncomingMessage,
        'session-token',
      ),
    ).toBe(true);
  });
});
