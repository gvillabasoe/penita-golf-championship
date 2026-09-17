/**
 * Middleware de autorizacion.
 *
 * Primera de las dos capas. Aqui se resuelve lo que se puede resolver sin base
 * de datos: rutas publicas, y quien no trae cookie de sesion. Lo que necesita
 * conocer el rol se marca como DEFER_TO_SERVER y lo comprueba `requireAdmin()`
 * en el servidor.
 *
 * El motivo es tecnico y no negociable: el middleware corre en el runtime edge,
 * donde no hay Prisma. La capa que de verdad protege el panel es la segunda.
 *
 * Toda la decision vive en `middlewareDecision`, que tiene tests. Aqui solo se
 * traduce a respuestas de Next.
 */

import { NextResponse, type NextRequest } from 'next/server';

import { middlewareDecision } from '@/lib/http/routes';
import { SESSION_COOKIE_NAME } from '@/lib/auth/session';

export function middleware(request: NextRequest) {
  const decision = middlewareDecision({
    path: request.nextUrl.pathname,
    method: request.method,
    hasSessionCookie: request.cookies.has(SESSION_COOKIE_NAME),
  });

  switch (decision.action) {
    case 'ALLOW':
    case 'DEFER_TO_SERVER':
      return NextResponse.next();

    case 'REDIRECT_TO_LOGIN': {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.search = `?returnTo=${encodeURIComponent(decision.returnTo)}`;
      return NextResponse.redirect(url);
    }

    case 'UNAUTHORIZED':
      return NextResponse.json({ error: 'Sesion requerida' }, { status: 401 });

    case 'NOT_FOUND':
      // 404 y no 403: un 403 confirmaria que la ruta existe.
      return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

    default:
      return NextResponse.next();
  }
}

export const config = {
  // Se excluyen los recursos generados y los archivos de la PWA: no aportan
  // nada al middleware y cada invocacion cuesta.
  matcher: ['/((?!_next/static|_next/image|icons|sw\\.js|manifest\\.webmanifest|favicon\\.ico).*)'],
};
