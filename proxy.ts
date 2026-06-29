import { NextResponse, type NextRequest } from 'next/server'

function hasSessionCookie(request: NextRequest) {
  return request.cookies
    .getAll()
    .some((cookie) =>
      ['authjs.session-token', '__Secure-authjs.session-token', 'next-auth.session-token', '__Secure-next-auth.session-token'].includes(cookie.name)
    )
}

export function proxy(request: NextRequest) {
  if (hasSessionCookie(request)) {
    return NextResponse.next()
  }

  const loginUrl = new URL('/login', request.url)
  loginUrl.searchParams.set('callbackUrl', request.nextUrl.pathname)

  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: [
    '/((?!login|register|api/auth|api/register|_next/static|_next/image|favicon.ico).*)',
  ],
}
