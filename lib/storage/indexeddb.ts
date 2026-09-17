/**
 * Adaptador de IndexedDB.
 *
 * Capa fina a proposito: aqui solo hay fontaneria. Toda la logica que decide si
 * se pierde un hoyo esta en `queue-store.ts`, que se prueba contra `MemoryStore`.
 *
 * NO esta verificado por tests: no hay navegador en el entorno donde se genero.
 * Se ha mantenido lo mas pequeno posible por ese motivo. Si algo falla en un
 * movil, falla aqui, y son setenta lineas que se revisan de un vistazo.
 *
 * Comprobar a mano en el movil, con la lista de docs/acceptance-tests.md.
 */

import { MemoryStore, type KeyValueStore } from './port';

const DB_NAME = 'penita-golf-championship';
const DB_VERSION = 1;
const STORE_NAME = 'kv';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('No se pudo abrir IndexedDB.'));
    request.onblocked = () => reject(new Error('IndexedDB bloqueada por otra pestana.'));
  });
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Error de IndexedDB.'));
  });
}

export class IndexedDbStore implements KeyValueStore {
  private database: Promise<IDBDatabase> | null = null;

  private db(): Promise<IDBDatabase> {
    this.database ??= openDatabase();
    return this.database;
  }

  async get(key: string): Promise<string | null> {
    const db = await this.db();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const value = await promisify<unknown>(tx.objectStore(STORE_NAME).get(key));
    return typeof value === 'string' ? value : null;
  }

  async set(key: string, value: string): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    await promisify(tx.objectStore(STORE_NAME).put(value, key));
  }

  async delete(key: string): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    await promisify(tx.objectStore(STORE_NAME).delete(key));
  }

  async keys(prefix?: string): Promise<string[]> {
    const db = await this.db();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const keys = await promisify(tx.objectStore(STORE_NAME).getAllKeys());
    const asStrings = keys.filter((key): key is string => typeof key === 'string');
    return (prefix === undefined ? asStrings : asStrings.filter((k) => k.startsWith(prefix))).sort();
  }

  /**
   * Lectura y escritura dentro de UNA transaccion `readwrite`.
   *
   * Es lo que hace que dos confirmaciones de hoyo simultaneas no se pisen:
   * IndexedDB serializa las transacciones readwrite sobre el mismo almacen.
   */
  async update(key: string, updater: (current: string | null) => string): Promise<string> {
    const db = await this.db();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const current = await promisify<unknown>(store.get(key));
    const updated = updater(typeof current === 'string' ? current : null);
    await promisify(store.put(updated, key));

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Transaccion fallida.'));
      tx.onabort = () => reject(tx.error ?? new Error('Transaccion abortada.'));
    });

    return updated;
  }
}

/**
 * Devuelve el almacen adecuado para el entorno.
 *
 * Si no hay IndexedDB —renderizado en servidor, o modo privado de algunos
 * navegadores— se usa memoria. La app sigue funcionando en esa vuelta, pero los
 * resultados no sobreviven a cerrar la pestana, y eso hay que avisarlo en
 * pantalla: es justo el caso en que un hoyo se puede perder.
 */
export function createStore(): { store: KeyValueStore; isPersistent: boolean } {
  const hasIndexedDb = typeof globalThis !== 'undefined' && 'indexedDB' in globalThis;
  if (!hasIndexedDb) {
    return { store: new MemoryStore(), isPersistent: false };
  }
  return { store: new IndexedDbStore(), isPersistent: true };
}

/**
 * Pide al navegador que no borre el almacenamiento cuando falte espacio.
 *
 * Sin esto, iOS y Android pueden vaciar IndexedDB de una web cuando el
 * dispositivo se queda sin sitio. Con una tarjeta a medias, eso es perder la
 * vuelta. Conviene llamarlo al iniciar sesion y avisar si el navegador dice no.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || navigator.storage?.persist === undefined) {
    return false;
  }
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
