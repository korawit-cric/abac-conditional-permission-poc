import { NextRequest, NextResponse } from 'next/server';
import { seal } from '../../../lib/auth/crypto';
import type { MockCode } from '../../../lib/auth/types';

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
  const code = seal(
    {
      sub: 'mock-thaid-123',
      name: 'Demo ThaiD User',
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
