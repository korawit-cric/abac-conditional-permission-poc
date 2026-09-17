import { NextRequest, NextResponse } from 'next/server';
import { seal } from '../../../lib/auth/crypto';
import type { MockCode } from '../../../lib/auth/types';
import { mockPersonas } from '../../../lib/auth/mock-personas';

export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const callback = new URL('/auth/callback', request.url);
  if (
    params.get('client_id') !== 'demo-app' ||
    params.get('response_type') !== 'code' ||
    params.get('code_challenge_method') !== 'S256' ||
    params.get('redirect_uri') !== callback.toString() ||
    !params.get('state') ||
    !params.get('code_challenge')
  ) {
    return new NextResponse('Invalid authorization request', { status: 400 });
  }
  const requestedPersona = params.get('persona') || 'mock-manager-10';
  const subject = Object.hasOwn(mockPersonas, requestedPersona)
    ? (requestedPersona as keyof typeof mockPersonas)
    : 'mock-manager-10';
  const code = seal(
    {
      sub: subject,
      name: mockPersonas[subject],
      codeChallenge: params.get('code_challenge')!,
      redirectUri: callback.toString(),
      expiresAt: Date.now() + 60_000,
    } satisfies MockCode,
    'mock-code',
  );
  callback.searchParams.set('code', code);
  callback.searchParams.set('state', params.get('state')!);
  return NextResponse.redirect(callback);
}
