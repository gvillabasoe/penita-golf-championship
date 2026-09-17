/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  /**
   * Paquetes que no se empaquetan: se cargan como modulos de Node en tiempo de
   * ejecucion.
   *
   * - `@node-rs/argon2` es una dependencia opcional cargada con import dinamico:
   *   sin esto el empaquetado falla cuando NO esta instalada.
   * - `sharp` y `pdf-lib` se usan solo en rutas de exportacion, que corren en
   *   Node. Empaquetar sharp rompe porque lleva binario nativo.
   *
   * En Next 14 esta opcion vivia en `experimental.serverComponentsExternalPackages`.
   */
  serverExternalPackages: ['@node-rs/argon2', 'sharp', 'pdf-lib'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
      {
        // Nada privado se cachea (seccion 66).
        source: '/api/:path*',
        headers: [{ key: 'Cache-Control', value: 'no-store, max-age=0' }],
      },
    ];
  },
};

export default nextConfig;
