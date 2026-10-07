import type { Metadata, Viewport } from 'next';
import { Archivo, Archivo_Narrow } from 'next/font/google';

import './globals.css';
import { ServiceWorkerRegistration } from '@/components/client/service-worker';

/**
 * Una familia, dos anchos (sistema "Escudo", v2.0.0).
 *
 *   Archivo         interfaz, texto y titulos
 *   Archivo Narrow  cifras, tarjeta, clasificacion
 *
 * El ancho estrecho no es un capricho: con el, nueve hoyos mas la columna de
 * etiquetas caben en 320 px sin bajar el cuerpo de letra, y las cifras de un
 * leaderboard se leen como en un marcador.
 *
 * Pesos explicitos y solo los que se usan: cada peso extra es peso que viaja
 * por la cobertura del campo. `next/font` los sirve desde el propio dominio, sin
 * peticiones a Google en tiempo de ejecucion. Los `fallback` estan escritos a
 * mano: si la fuente no llega, la app tiene que seguir siendo legible.
 */
const archivo = Archivo({
  subsets: ['latin'],
  display: 'swap',
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-archivo',
  fallback: ['system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
});

const archivoNarrow = Archivo_Narrow({
  subsets: ['latin'],
  display: 'swap',
  weight: ['500', '600', '700'],
  variable: '--font-archivo-narrow',
  fallback: ['Arial Narrow', 'Roboto Condensed', 'system-ui', 'sans-serif'],
});

export const metadata: Metadata = {
  title: 'Peñita Golf Championship',
  description: 'I Peñita Golf Championship – Ulzama-Bariain 2026',
  manifest: '/manifest.webmanifest',
  applicationName: 'Peñita Golf',
  // `black-translucent` y no `default`: con el navy del escudo detras, una barra
  // de estado blanca cortaria el icono al abrir.
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Peñita Golf' },
  /**
   * `apple` apunta a su propio archivo de 180 px: iOS usa `apple-touch-icon` y
   * no lee el manifest para el icono de la pantalla de inicio.
   */
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Sin maximumScale ni userScalable: bloquear el zoom es una barrera de
  // accesibilidad, y esta app se usa al sol con los ojos cansados.
  //
  // El navy del escudo, no el verde de la interfaz: es el color de la barra de
  // estado al abrir desde la pantalla de inicio, y tiene que continuar el icono.
  themeColor: '#364f6e',
  // La pagina llega hasta debajo de la muesca y de la barra de inicio; la
  // cabecera y el dock se apartan con env(safe-area-inset-*). Sin esto, esos
  // valores valen 0 y el dock flotante quedaria pegado al gesto de inicio.
  viewportFit: 'cover',
  // En Android el teclado encoge el viewport, como en iOS: los campos del
  // administrador no quedan tapados.
  interactiveWidget: 'resizes-content',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${archivo.variable} ${archivoNarrow.variable}`}>
      <body>
        <div className="app-shell">{children}</div>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
