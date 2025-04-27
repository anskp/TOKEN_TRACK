import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(req) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  
  // Get the pathname of the request
  const { pathname } = req.nextUrl;

  // Allow public paths
  if (
    pathname.startsWith('/_next') || 
    pathname.startsWith('/api/auth') ||
    pathname === '/' ||
    pathname === '/login' ||
    pathname === '/register' ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  // Check for admin routes
  if (pathname.startsWith('/admin')) {
    // Redirect to login if not authenticated
    if (!token) {
      return NextResponse.redirect(new URL('/login?role=admin', req.url));
    }
    
    // Redirect to appropriate dashboard if not an admin
    if (!token.roles.includes('admin')) {
      return NextResponse.redirect(new URL('/', req.url));
    }
    
    return NextResponse.next();
  }

  // Check for issuer routes
  if (pathname.startsWith('/issuer')) {
    // Redirect to login if not authenticated
    if (!token) {
      return NextResponse.redirect(new URL('/login?role=issuer', req.url));
    }
    
    // Redirect to appropriate dashboard if not an issuer
    if (!token.roles.includes('issuer')) {
      return NextResponse.redirect(new URL('/', req.url));
    }
    
    return NextResponse.next();
  }

  // Check for investor routes
  if (pathname.startsWith('/investor')) {
    // Redirect to login if not authenticated
    if (!token) {
      return NextResponse.redirect(new URL('/login?role=investor', req.url));
    }
    
    // Redirect to appropriate dashboard if not an investor
    if (!token.roles.includes('investor')) {
      return NextResponse.redirect(new URL('/', req.url));
    }
    
    return NextResponse.next();
  }

  // Check for KYC routes - must be authenticated
  if (pathname === '/kyc') {
    if (!token) {
      return NextResponse.redirect(new URL('/login', req.url));
    }
    
    return NextResponse.next();
  }

  // Default behavior - allow request
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/auth (Next Auth API routes)
     * - _next (Next.js static files)
     * - favicon.ico, images, public (static files)
     */
    '/((?!api/auth|_next|favicon.ico|images|public).*)',
  ],
};
