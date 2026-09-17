/**
 * Puerto de almacenamiento local.
 *
 * La cola offline vive en IndexedDB en el movil, pero la logica de persistencia
 * no debe depender de IndexedDB: en el servidor no existe, en los tests no hay
 * navegador, y atarse a su API haria imposible probar lo unico que de verdad
 * importa, que es que **ningun hoyo confirmado se pierda**.
 *
 * Asi que toda la logica trabaja contra esta interfaz. Hay dos implementaciones:
 * la de memoria (probada aqui) y la de IndexedDB (una capa fina de fontaneria).
 */

export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  keys(prefix?: string): Promise<string[]>;
  /**
   * Lectura, modificacion y escritura como una sola operacion.
   *
   * No es un lujo. Sin esto, dos confirmaciones de hoyo casi simultaneas leen la
   * misma cola, cada una le anade su operacion y la segunda escritura pisa la
   * primera: un hoyo confirmado desaparece sin que nadie se entere. Es
   * exactamente el fallo que la seccion 41 prohibe.
   */
  update(key: string, updater: (current: string | null) => string): Promise<string>;
}

/**
 * Implementacion en memoria. Se usa en los tests y como reserva cuando no hay
 * IndexedDB disponible (renderizado en servidor, modo privado en algunos
 * navegadores).
 *
 * Los `update` se serializan por clave con una cadena de promesas, que es lo que
 * emula el comportamiento transaccional de IndexedDB.
 */
export class MemoryStore implements KeyValueStore {
  private readonly data = new Map<string, string>();
  private readonly locks = new Map<string, Promise<unknown>>();

  async get(key: string): Promise<string | null> {
    return this.data.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.data.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }

  async keys(prefix?: string): Promise<string[]> {
    const all = [...this.data.keys()];
    return (prefix === undefined ? all : all.filter((key) => key.startsWith(prefix))).sort();
  }

  async update(key: string, updater: (current: string | null) => string): Promise<string> {
    const previous = this.locks.get(key) ?? Promise.resolve();

    const next = previous.then(async () => {
      const current = this.data.get(key) ?? null;
      const updated = updater(current);
      this.data.set(key, updated);
      return updated;
    });

    // Se guarda la cadena incluso si falla, para no romper el orden de los
    // siguientes update sobre la misma clave.
    this.locks.set(
      key,
      next.catch(() => undefined),
    );
    return next;
  }

  /** Solo para tests: cuantas claves hay. */
  get size(): number {
    return this.data.size;
  }
}
