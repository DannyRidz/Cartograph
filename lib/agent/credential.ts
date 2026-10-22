import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const CREDENTIAL_SECONDS = 300;
// Issuance uses database time. Tolerate a slightly slower app clock without
// extending signed expiry or the database's five minute grant lifetime.
const CREDENTIAL_CLOCK_SKEW_SECONDS = 60;
export interface AgentCredential {
  version: 1;
  audience: 'cartograph-tools';
  analysisId: string;
  organizationId: string;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
}
export const analysisIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const organizationPattern = /^org_[A-Za-z0-9]+$/;

export function credentialHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
function signature(payload: string, secret: string) {
  if (Buffer.byteLength(secret) < 32) throw new Error('CARTOGRAPH_AGENT_SIGNING_SECRET must contain at least 32 bytes.');
  return createHmac('sha256', secret).update(`cartograph-tools.v1.${payload}`).digest();
}
export function signCredential(analysisId: string, organizationId: string, secret: string, now = Date.now()) {
  if (!analysisIdPattern.test(analysisId) || !organizationPattern.test(organizationId)) throw new Error('Invalid credential scope.');
  const issuedAt = Math.floor(now / 1000);
  const claims: AgentCredential = { version: 1, audience: 'cartograph-tools', analysisId, organizationId,
    nonce: randomBytes(32).toString('base64url'), issuedAt, expiresAt: issuedAt + CREDENTIAL_SECONDS };
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return { token: `${payload}.${signature(payload, secret).toString('base64url')}`, claims };
}
export function verifyCredential(token: string, secret: string, now = Date.now()): AgentCredential {
  if (token.length > 2048 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) throw new Error('Invalid agent credential.');
  const [payload, signed] = token.split('.');
  const expected = signature(payload, secret);
  const supplied = Buffer.from(signed, 'base64url');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new Error('Invalid agent credential.');
  const claims: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (!claims || typeof claims !== 'object' || !('version' in claims) || claims.version !== 1
    || !('audience' in claims) || claims.audience !== 'cartograph-tools'
    || !('analysisId' in claims) || typeof claims.analysisId !== 'string' || !analysisIdPattern.test(claims.analysisId)
    || !('organizationId' in claims) || typeof claims.organizationId !== 'string' || !organizationPattern.test(claims.organizationId)
    || !('nonce' in claims) || typeof claims.nonce !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(claims.nonce)
    || !('issuedAt' in claims) || typeof claims.issuedAt !== 'number' || !Number.isSafeInteger(claims.issuedAt)
    || !('expiresAt' in claims) || typeof claims.expiresAt !== 'number' || !Number.isSafeInteger(claims.expiresAt)
    || claims.expiresAt - claims.issuedAt !== CREDENTIAL_SECONDS
    || claims.issuedAt > Math.floor(now / 1000) + CREDENTIAL_CLOCK_SKEW_SECONDS
    || claims.expiresAt <= Math.floor(now / 1000)) {
    throw new Error('Invalid or expired agent credential.');
  }
  return { version: 1, audience: 'cartograph-tools', analysisId: claims.analysisId,
    organizationId: claims.organizationId, nonce: claims.nonce, issuedAt: claims.issuedAt, expiresAt: claims.expiresAt };
}
