/**
 * Lista de participantes de la I edicion.
 *
 * ESTE ARCHIVO NO CONTIENE NINGUNA CONTRASENA, ni el patron para deducirlas.
 * Las credenciales iniciales se leen en el momento del seed desde un archivo
 * fuera del repositorio. Ver docs/seed-credentials.md.
 *
 * Nombres, apellidos, tildes y guiones se conservan exactamente como figuran en
 * el pliego (seccion 14).
 */

import { buildDisplayName, normalizeName } from '../auth/normalize';

export type Role = 'PLAYER' | 'ADMIN';

export interface RosterEntry {
  /** Clave estable para casar con las credenciales sin usar el nombre. */
  slug: string;
  firstName: string;
  lastName: string;
  role: Role;
}

/**
 * Paleta de acentos de jugador.
 *
 * Trece tonos profundos y moderadamente saturados, distinguibles entre si y con
 * contraste suficiente sobre blanco y sobre el marfil del fondo. Se asignan por
 * indice, de forma deterministica, y el administrador puede cambiarlos despues
 * (quedan en base de datos).
 *
 * Sustituyen a la paleta pastel de la v1.1. La conversion de los valores ya
 * guardados es deterministica y esta en
 * prisma/sql/migrations/002-limite-hcp-y-vaciado.sql: cada pastel antiguo tiene
 * un unico destino, en el mismo orden que esta lista, asi que ningun jugador
 * cambia de color dos veces. Un color elegido a mano por el administrador no
 * coincide con ninguno de los antiguos y se conserva.
 *
 * Por que profundos y no pastel: el color de jugador se lee sobre blanco, al
 * sol, en una barra de 4 px. Un pastel ahi no se distingue de otro pastel.
 */
const ACCENT_RAMP = [
  '#1b563b', // verde esmeralda oscuro
  '#8c3b2e', // terracota
  '#1d4e79', // azul atlantico
  '#8a6a1f', // ocre
  '#4a3168', // morado profundo
  '#1f5c60', // azul petroleo
  '#7a2540', // burdeos
  '#55631f', // verde oliva
  '#9c5a24', // cobre
  '#1f3a5f', // azul marino
  '#6b5433', // bronce
  '#2f6b46', // verde bosque
  '#7d4a3a', // castano rojizo
] as const;

export const ROSTER: RosterEntry[] = [
  { slug: 'gvillabaso', firstName: 'Gonzalo', lastName: 'Villabaso', role: 'ADMIN' },
  { slug: 'apagadi', firstName: 'Alex', lastName: 'Pagadi', role: 'PLAYER' },
  { slug: 'jolabarri', firstName: 'Juan', lastName: 'Olabarri', role: 'PLAYER' },
  { slug: 'liribarren', firstName: 'Luis', lastName: 'Iribarren', role: 'PLAYER' },
  { slug: 'gsuarez', firstName: 'Gonzalo', lastName: 'Suárez', role: 'PLAYER' },
  { slug: 'prodriguezrey', firstName: 'Pacho', lastName: 'Rodríguez-Rey', role: 'PLAYER' },
  { slug: 'iurzay', firstName: 'Ignacio', lastName: 'Urzay', role: 'PLAYER' },
  { slug: 'azabala', firstName: 'Alfonso', lastName: 'Zabala', role: 'PLAYER' },
  { slug: 'jcancio', firstName: 'Juan', lastName: 'Cancio', role: 'PLAYER' },
  { slug: 'tmolina', firstName: 'Tomás', lastName: 'Molina', role: 'PLAYER' },
  { slug: 'gayesa', firstName: 'Gabriel', lastName: 'Ayesa', role: 'PLAYER' },
  { slug: 'sguerra', firstName: 'Santiago', lastName: 'Guerra', role: 'PLAYER' },
  { slug: 'mpalomino', firstName: 'Marcos', lastName: 'Palomino', role: 'PLAYER' },
];

export interface ResolvedRosterEntry extends RosterEntry {
  displayName: string;
  normalizedName: string;
  defaultColor: string;
}

export function resolveRoster(roster: RosterEntry[] = ROSTER): ResolvedRosterEntry[] {
  return roster.map((entry, index) => ({
    ...entry,
    displayName: buildDisplayName(entry.firstName, entry.lastName),
    normalizedName: normalizeName(`${entry.firstName} ${entry.lastName}`),
    defaultColor: ACCENT_RAMP[index % ACCENT_RAMP.length],
  }));
}
