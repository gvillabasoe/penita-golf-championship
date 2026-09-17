/**
 * Normalizacion y busqueda de nombres para el selector del login (seccion 13).
 *
 * Requisitos: ignorar mayusculas, minusculas y tildes; buscar por nombre, por
 * apellido y por fragmentos.
 *
 * Detalle que importa en euskera y castellano: la enye NO se descompone en "n".
 * "Penita" no debe encontrar a alguien apellidado "Núñez" por accidente, pero
 * "nunez" si debe encontrarlo. Se resuelve quitando solo las marcas diacriticas
 * tras descomponer, lo que convierte ñ -> n de forma consistente y predecible.
 */

/** Forma canonica para indexar y comparar: sin tildes, minusculas, sin dobles espacios. */
export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export interface SearchableUser {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  normalizedName: string;
  isActive: boolean;
}

/**
 * Devuelve true si la consulta encuentra al usuario. Cada palabra de la consulta
 * debe aparecer como prefijo de alguna palabra del nombre: asi "gon vil" encuentra
 * a "Gonzalo Villabaso" y "villa" encuentra a "Villabaso", pero "lab" no
 * encuentra a "Villabaso" por el medio de la palabra.
 *
 * Los apellidos compuestos con guion se tratan como dos palabras:
 * "Rodríguez-Rey" se encuentra con "rey" y con "rodriguez".
 */
export function matchesQuery(user: SearchableUser, query: string): boolean {
  const normalizedQuery = normalizeName(query);
  if (normalizedQuery === '') return true;

  const haystack = user.normalizedName.split(' ');
  const needles = normalizedQuery.split(' ');

  return needles.every((needle) => haystack.some((word) => word.startsWith(needle)));
}

/**
 * Filtra y ordena la lista del selector. El orden es alfabetico por apellido y
 * luego nombre, con la coincidencia exacta de prefijo primero.
 */
export function searchUsers(users: SearchableUser[], query: string): SearchableUser[] {
  const collator = new Intl.Collator('es', { sensitivity: 'base' });
  return users
    .filter((u) => u.isActive && matchesQuery(u, query))
    .sort(
      (a, b) =>
        collator.compare(a.lastName, b.lastName) || collator.compare(a.firstName, b.firstName),
    );
}

/** Nombre a mostrar, conservando tildes y guiones exactamente como se registraron. */
export function buildDisplayName(firstName: string, lastName: string): string {
  return `${firstName.trim()} ${lastName.trim()}`.replace(/\s+/g, ' ');
}
