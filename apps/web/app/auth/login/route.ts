import { NextRequest, NextResponse } from 'next/server';
import {
  challenge,
  cookieOptions,
  randomSecret,
  seal,
} from '../../../lib/auth/crypto';
import type { LoginAttempt } from '../../../lib/auth/types';

export function GET(request: NextRequest) {
  const state = randomSecret();
  const verifier = randomSecret();
  const callback = new URL('/auth/callback', request.url);
  const provider = new URL('/mock-provider/authorize', request.url);
  provider.searchParams.set('response_type', 'code');
  provider.searchParams.set('client_id', 'demo-app');
  provider.searchParams.set('redirect_uri', callback.toString());
  provider.searchParams.set('state', state);
  provider.searchParams.set('code_challenge', challenge(verifier));
  provider.searchParams.set('code_challenge_method', 'S256');
  const response = NextResponse.redirect(provider);
  response.cookies.set(
    'oauth_attempt',
    seal(
      {
        state,
        verifier,
        expiresAt: Date.now() + 5 * 60_000,
      } satisfies LoginAttempt,
      'login-attempt',
    ),
    { ...cookieOptions, maxAge: 300 },
  );
  return response;
}
