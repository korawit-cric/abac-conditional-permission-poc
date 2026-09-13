import { cookies } from 'next/headers';
import { open } from './crypto';
import type { Session } from './types';
import { actors } from './authorization';

export async function currentActor() {
  const session = open<Session>(
    (await cookies()).get('app_session')?.value,
    'app-session',
  );
  if (!session || session.expiresAt < Date.now()) return null;
  // Resolve authorization on every request; a session carries identity only.
  return actors[session.sub] || null;
}

export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  return !!origin && origin === new URL(request.url).origin;
}
