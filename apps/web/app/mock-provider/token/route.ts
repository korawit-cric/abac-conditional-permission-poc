import { NextRequest, NextResponse } from 'next/server';
import { challenge, equal, open } from '../../../lib/auth/crypto';
import type { MockCode } from '../../../lib/auth/types';

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const rawCode = form.get('code');
  const code =
    typeof rawCode === 'string' ? open<MockCode>(rawCode, 'mock-code') : null;
  const verifier = form.get('code_verifier');
  const redirectUri = form.get('redirect_uri');
  if (typeof verifier !== 'string' || typeof redirectUri !== 'string')
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  if (
    form.get('grant_type') !== 'authorization_code' ||
    !code ||
    code.expiresAt < Date.now() ||
    code.redirectUri !== redirectUri ||
    !equal(code.codeChallenge, challenge(verifier))
  ) {
    return NextResponse.json({ error: 'invalid_grant' }, { status: 400 });
  }
  return NextResponse.json({ subject: code.sub, name: code.name });
}
