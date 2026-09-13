import { NextRequest, NextResponse } from 'next/server';
export function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL('/', request.url), 303);
  response.cookies.delete('app_session');
  response.cookies.delete('oauth_attempt');
  return response;
}
