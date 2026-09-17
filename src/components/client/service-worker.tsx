'use client';

import { useEffect } from 'react';

/**
 * Registra el service worker y pide almacenamiento persistente.
 *
 * Lo segundo importa mas de lo que parece: sin `navigator.storage.persist()`,
 * iOS y Android pueden vaciar IndexedDB cuando al movil le falta espacio, y con
 * una tarjeta a medias eso es perder la vuelta.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Sin service worker la app sigue funcionando online. No se molesta al
      // jugador con un error que no puede arreglar.
    });

    void navigator.storage?.persist?.().catch(() => false);
  }, []);

  return null;
}
