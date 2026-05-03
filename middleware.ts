import { NextResponse, type NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const publicRoutes = ['/', '/login', '/signup', '/auth/callback'];
  const isPublicRoute = publicRoutes.some(
    (route) => pathname === route || (route !== '/' && pathname.startsWith(route))
  );

  // Check for Supabase session cookie — no network call needed
  const hasSession =
    request.cookies.has('sb-dwaqexnkrtayokarnefl-auth-token') ||
    request.cookies.has('sb-dwaqexnkrtayokarnefl-auth-token.0') ||
    request.cookies.has('sb-dwaqexnkrtayokarnefl-auth-token.1');

  if (!hasSession && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (hasSession && (pathname === '/login' || pathname === '/signup' || pathname === '/')) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
