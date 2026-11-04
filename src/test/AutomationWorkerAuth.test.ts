import { describe, expect, it } from 'vitest';
import { requireServiceRole } from '../../supabase/functions/core-automation-worker/auth';

const configuredToken = 'synthetic-worker-token-001';

function requestWithAuthorization(authorization?: string): Request {
  return new Request('https://worker.test/run', {
    method: 'POST',
    headers: authorization ? { authorization } : {},
  });
}

describe('core automation worker authorization', () => {
  it('accepts only the configured service-role bearer token', () => {
    expect(() => requireServiceRole(requestWithAuthorization(`Bearer ${configuredToken}`), configuredToken)).not.toThrow();
  });

  it('rejects a forged JWT whose unverified payload claims service_role', () => {
    const payload = btoa(JSON.stringify({ role: 'service_role' })).replace(/=+$/u, '');
    const forgedToken = `header.${payload}.forged-signature`;
    expect(() => requireServiceRole(requestWithAuthorization(`Bearer ${forgedToken}`), configuredToken)).toThrow('service-role authorization required');
  });

  it('rejects missing credentials and missing server configuration', () => {
    expect(() => requireServiceRole(requestWithAuthorization(), configuredToken)).toThrow('service-role authorization required');
    expect(() => requireServiceRole(requestWithAuthorization(`Bearer ${configuredToken}`), undefined)).toThrow('service-role authorization required');
  });
});
