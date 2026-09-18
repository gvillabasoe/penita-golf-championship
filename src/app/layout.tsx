import type { Metadata, Viewport } from 'next';
import { Fraunces, Inter } from 'next/font/google';

import './globals.css';
import { ServiceWorkerRegistration } from '@/components/client/service-worker';

/**
 * Dos familias y ninguna mas (seccion 11).
 *
 * `next/font` las descarga en tiempo de compilacion y las sirve desde el propio
 * dominio, asi que no hay peticion a Google en tiempo de ejecucion ni salto de
 * maquetacion al cargar. Se exponen como variables CSS y toda la hoja de
 * estilos las consume desde `--font-display` y `--font-sans`.
 *
 * `fallback` esta escrito a proposito: si la fuente no llega, la aplicacion
 * tiene que seguir siendo legible en el hoyo 14, no bonita.
 */
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
  fallback: ['system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
});

/**
 * Serif editorial para titulares y cifras grandes. Se cargan solo los dos pesos
 * que se usan: ninguna pantalla necesita mas, y cada peso extra es peso que
 * viaja por la cobertura del campo.
 */
const fraunces = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  weight: ['600', '700'],
  variable: '--font-fraunces',
  fallback: ['Iowan Old Style', 'Georgia', 'Times New Roman', 'serif'],
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
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${inter.variable} ${fraunces.variable}`}>
      <body>
        <div className="app-shell">{children}</div>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
