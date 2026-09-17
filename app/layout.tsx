import type { Metadata, Viewport } from 'next';

import './globals.css';
import { ServiceWorkerRegistration } from '@/components/client/service-worker';

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
    <html lang="es">
      <body>
        <div className="app-shell">{children}</div>
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
