/**
 * Planificador del seed (seccion 15: "El seed debe ser idempotente").
 *
 * Funcion pura: recibe la lista de usuarios que ya existen y devuelve el plan de
 * acciones. No toca la base de datos, no lee credenciales, no registra nada.
 * Asi se puede probar la idempotencia sin base de datos.
 *
 * Garantia central: **un usuario que ya existe nunca recibe una contrasena
 * nueva.** El seed solo establece contrasena al crear. Si Alfonso cambio la suya
 * y alguien vuelve a ejecutar el seed, la suya sigue siendo la suya. No hace
 * falta detectar "ha sido cambiada": simplemente no se toca nunca.
 *
 * Lo que el seed tampoco hace, a proposito:
 *   - No borra usuarios que no esten en la lista: los reporta.
 *   - No desactiva a nadie.
 *   - No cambia roles ya asignados: lo reporta como divergencia.
 *   - No cambia colores ya elegidos por el administrador.
 */

import { resolveRoster, type ResolvedRosterEntry, type Role, type RosterEntry } from './roster';

export interface ExistingUser {
  id: string;
  normalizedName: string;
  role: Role;
  isActive: boolean;
}

export type SeedAction =
  | {
      type: 'CREATE';
      slug: string;
      entry: ResolvedRosterEntry;
      /** El ejecutor debe aportar una contrasena inicial para este slug. */
      requiresPassword: true;
    }
  | {
      type: 'KEEP';
      slug: string;
      userId: string;
      /** Motivo por el que no se toca nada. */
      note: string;
    };

export interface SeedDivergence {
  kind: 'ROLE_MISMATCH' | 'INACTIVE' | 'NOT_IN_ROSTER';
  slug: string | null;
  userId: string | null;
  detail: string;
}

export interface SeedPlan {
  actions: SeedAction[];
  divergences: SeedDivergence[];
  /** Slugs para los que hay que aportar contrasena inicial. */
  slugsNeedingPassword: string[];
  summary: { toCreate: number; toKeep: number; divergences: number };
}

export function buildSeedPlan(
  existingUsers: ExistingUser[],
  roster: RosterEntry[] | ResolvedRosterEntry[] = [],
): SeedPlan {
  const resolved = roster.length > 0 ? resolveRoster(roster as RosterEntry[]) : resolveRoster();
  const byNormalizedName = new Map(existingUsers.map((u) => [u.normalizedName, u]));
  const matchedIds = new Set<string>();

  const actions: SeedAction[] = [];
  const divergences: SeedDivergence[] = [];

  for (const entry of resolved) {
    const existing = byNormalizedName.get(entry.normalizedName);

    if (!existing) {
      actions.push({ type: 'CREATE', slug: entry.slug, entry, requiresPassword: true });
      continue;
    }

    matchedIds.add(existing.id);
    actions.push({
      type: 'KEEP',
      slug: entry.slug,
      userId: existing.id,
      note: 'Ya existe: no se modifica la contrasena ni el perfil.',
    });

    if (existing.role !== entry.role) {
      divergences.push({
        kind: 'ROLE_MISMATCH',
        slug: entry.slug,
        userId: existing.id,
        detail: `La lista dice ${entry.role} y en base de datos es ${existing.role}. Cambialo a mano si procede.`,
      });
    }
    if (!existing.isActive) {
      divergences.push({
        kind: 'INACTIVE',
        slug: entry.slug,
        userId: existing.id,
        detail: 'Esta desactivado en base de datos. El seed no lo reactiva.',
      });
    }
  }

  for (const user of existingUsers) {
    if (!matchedIds.has(user.id)) {
      divergences.push({
        kind: 'NOT_IN_ROSTER',
        slug: null,
        userId: user.id,
        detail: `Existe en base de datos pero no en la lista (${user.normalizedName}). El seed no lo borra.`,
      });
    }
  }

  const toCreate = actions.filter((a) => a.type === 'CREATE');

  return {
    actions,
    divergences,
    slugsNeedingPassword: toCreate.map((a) => a.slug),
    summary: {
      toCreate: toCreate.length,
      toKeep: actions.length - toCreate.length,
      divergences: divergences.length,
    },
  };
}

export class SeedCredentialsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeedCredentialsError';
  }
}

/**
 * Comprueba que hay una credencial para cada slug que la necesita, sin exponer
 * ningun valor. Los mensajes de error citan slugs, jamas contrasenas.
 */
export function assertCredentialsAvailable(
  plan: SeedPlan,
  credentials: Record<string, string>,
  minLength = 8,
): void {
  const missing: string[] = [];
  const tooShort: string[] = [];

  for (const slug of plan.slugsNeedingPassword) {
    const value = credentials[slug];
    if (typeof value !== 'string' || value.length === 0) {
      missing.push(slug);
    } else if (value.length < minLength) {
      tooShort.push(slug);
    }
  }

  const problems: string[] = [];
  if (missing.length > 0) {
    problems.push(`faltan credenciales para: ${missing.join(', ')}`);
  }
  if (tooShort.length > 0) {
    problems.push(
      `credenciales por debajo de ${minLength} caracteres para: ${tooShort.join(', ')}`,
    );
  }

  const extra = Object.keys(credentials).filter(
    (slug) => !plan.slugsNeedingPassword.includes(slug),
  );
  if (extra.length > 0) {
    // No es un error: puede haber credenciales de jugadores ya creados. Solo se
    // avisa de que no se van a usar, para que nadie crea que se han aplicado.
    problems.push(
      `credenciales aportadas que NO se aplicaran porque el jugador ya existe: ${extra.join(', ')}`,
    );
  }

  if (missing.length > 0 || tooShort.length > 0) {
    throw new SeedCredentialsError(problems.join('. '));
  }
}
