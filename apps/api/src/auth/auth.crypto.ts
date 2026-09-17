import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const encode = (value: Buffer) => value.toString('base64url');

function key(purpose: string): Buffer {
  const secret = process.env.AUTH_COOKIE_SECRET;
  if (!secret || Buffer.from(secret, 'base64url').length < 32) {
    throw new Error(
      'AUTH_COOKIE_SECRET must contain at least 32 random base64url bytes.',
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
  return [encode(iv), encode(data), encode(cipher.getAuthTag())].join('.');
}

export function open<T>(token: string | undefined, purpose: string): T | null {
  if (!token) return null;
  try {
    const [ivValue, dataValue, tagValue] = token.split('.');
    if (!ivValue || !dataValue || !tagValue) return null;
    const iv = Buffer.from(ivValue, 'base64url');
    const tag = Buffer.from(tagValue, 'base64url');
    if (iv.length !== 12 || tag.length !== 16) return null;
    const decipher = createDecipheriv('aes-256-gcm', key(purpose), iv);
    decipher.setAuthTag(tag);
    return JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(dataValue, 'base64url')),
        decipher.final(),
      ]).toString(),
    ) as T;
  } catch {
    return null;
  }
}

export const randomSecret = () => randomBytes(32).toString('base64url');
export const challenge = (verifier: string) =>
  createHash('sha256').update(verifier).digest('base64url');
export const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('base64url');

export function equal(leftValue: string, rightValue: string): boolean {
  const left = Buffer.from(leftValue);
  const right = Buffer.from(rightValue);
  return left.length === right.length && timingSafeEqual(left, right);
}
