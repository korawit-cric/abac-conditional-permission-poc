import { NextRequest, NextResponse } from 'next/server';
import { cookieOptions, equal, open, seal } from '../../../lib/auth/crypto';
import type { LoginAttempt, Session } from '../../../lib/auth/types';

export async function GET(request: NextRequest) {
  const attempt = open<LoginAttempt>(
    request.cookies.get('oauth_attempt')?.value,
    'login-attempt',
  );
  const state = request.nextUrl.searchParams.get('state');
  const code = request.nextUrl.searchParams.get('code');
  const fail = () => {
    const response = NextResponse.redirect(
      new URL('/?error=login_failed', request.url),
    );
    response.cookies.delete('oauth_attempt');
    return response;
  };
  if (
    !attempt ||
    attempt.expiresAt < Date.now() ||
    !state ||
    !equal(attempt.state, state) ||
    !code
  )
    return fail();
  const tokenResponse = await fetch(
    new URL('/mock-provider/token', request.url),
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        code_verifier: attempt.verifier,
        redirect_uri: new URL('/auth/callback', request.url).toString(),
      }),
      cache: 'no-store',
    },
  ).catch(() => null);
  if (!tokenResponse?.ok) return fail();
  const identity = (await tokenResponse.json()) as {
    subject?: string;
    name?: string;
  };
  if (identity.subject !== 'mock-thaid-123' || !identity.name) return fail();
  const session: Session = {
    sub: identity.subject,
    name: identity.name,
    expiresAt: Date.now() + 60 * 60_000,
  };
  const response = NextResponse.redirect(new URL('/dashboard', request.url));
  response.cookies.delete('oauth_attempt');
  response.cookies.set('app_session', seal(session, 'app-session'), {
    ...cookieOptions,
    maxAge: 3600,
  });
  return response;
}
