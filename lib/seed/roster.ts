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
 * Paleta pastel: 13 tonos distinguibles entre si y con contraste suficiente
 * para texto oscuro encima. Se asignan por indice, de forma deterministica, y el
 * administrador puede cambiarlos despues (quedan en base de datos).
 */
const PASTEL_RAMP = [
  '#cfe3d4',
  '#f2c9c0',
  '#cddcf0',
  '#f4e3b2',
  '#dcd0ea',
  '#c9e4e0',
  '#f0d3e2',
  '#dfe8c4',
  '#f5d9bd',
  '#c8d9e8',
  '#e6dcc8',
  '#d4e8cf',
  '#ead6cd',
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
    defaultColor: PASTEL_RAMP[index % PASTEL_RAMP.length],
  }));
}
