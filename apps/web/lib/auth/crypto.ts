import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const base64url = (value: Buffer) => value.toString('base64url');

function key(purpose: string): Buffer {
  const secret = process.env.AUTH_COOKIE_SECRET;
  if (!secret || Buffer.from(secret, 'base64url').length < 32) {
    throw new Error(
      'Set AUTH_COOKIE_SECRET to at least 32 random bytes encoded as base64url.',
    );
  }
  return createHash('sha256').update(secret).update(purpose).digest();
}

export function seal(value: object, purpose: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(purpose), iv);
  const data = Buffer.concat([
    cipher.update(JSON.stringify(value)),
    cipher.final(),
  ]);
  return [base64url(iv), base64url(data), base64url(cipher.getAuthTag())].join(
    '.',
  );
}

export function open<T>(token: string | undefined, purpose: string): T | null {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const iv = Buffer.from(parts[0]!, 'base64url');
    const data = Buffer.from(parts[1]!, 'base64url');
    const tag = Buffer.from(parts[2]!, 'base64url');
    if (iv.length !== 12 || tag.length !== 16) return null;
    const decipher = createDecipheriv('aes-256-gcm', key(purpose), iv);
    decipher.setAuthTag(tag);
    return JSON.parse(
      Buffer.concat([decipher.update(data), decipher.final()]).toString(),
    ) as T;
  } catch {
    return null;
  }
}

export function randomSecret(): string {
  return randomBytes(32).toString('base64url');
}

export function challenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export function equal(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};
