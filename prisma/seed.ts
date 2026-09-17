/**
 * Seed idempotente.
 *
 * Toda la logica de decision esta en `src/lib/seed/plan.ts`, que es una funcion
 * pura y tiene 11 tests. Este archivo solo la conecta con Prisma y con las
 * credenciales.
 *
 * Las credenciales NO estan en el repositorio. Se leen de:
 *   1. La variable de entorno SEED_CREDENTIALS_FILE, si esta definida.
 *   2. prisma/seed-credentials.json, que esta en .gitignore.
 *
 * Formato del archivo (ver docs/seed-credentials.md):
 *   { "gvillabaso": "...", "apagadi": "...", ... }
 *
 * Ejecutar:  npm run db:seed
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { hashPassword, PREFERRED_ALGORITHM } from '../src/lib/auth/password';
import { assertCredentialsAvailable, buildSeedPlan } from '../src/lib/seed/plan';
import { ROSTER } from '../src/lib/seed/roster';
import { buildRuleVersion } from '../src/lib/golf/competition-config';
import { ULZAMA_AMARILLAS_CABALLEROS, ULZAMA_HOLES } from '../src/lib/golf/course';

const prisma = new PrismaClient();

function loadCredentials(requiredSlugs: string[]): Record<string, string> {
  if (requiredSlugs.length === 0) return {};

  const path = process.env.SEED_CREDENTIALS_FILE ?? resolve('prisma/seed-credentials.json');
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    throw new Error(
      `Faltan las credenciales iniciales. Crea ${path} con un objeto JSON ` +
        `{ "slug": "contrasena" } para: ${requiredSlugs.join(', ')}. ` +
        `Ese archivo esta en .gitignore y no debe versionarse. Ver docs/seed-credentials.md.`,
    );
  }

  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('El archivo de credenciales debe contener un objeto JSON plano.');
  }
  return parsed as Record<string, string>;
}

async function main() {
  console.log('Seed: leyendo estado actual...');

  const existingUsers = await prisma.user.findMany({
    select: { id: true, normalizedName: true, role: true, isActive: true },
  });

  const plan = buildSeedPlan(existingUsers, ROSTER);
  console.log(
    `Plan: crear ${plan.summary.toCreate}, conservar ${plan.summary.toKeep}, ` +
      `divergencias ${plan.summary.divergences}.`,
  );
  for (const divergence of plan.divergences) {
    console.warn(`  [aviso] ${divergence.kind}: ${divergence.detail}`);
  }

  const credentials = loadCredentials(plan.slugsNeedingPassword);
  assertCredentialsAvailable(plan, credentials);

  // Hashes fuera de la transaccion: scrypt con N=2^15 tarda y no conviene
  // mantener abierta una transaccion mientras se calculan 13 hashes.
  const toCreate = plan.actions.filter((action) => action.type === 'CREATE');
  const prepared = await Promise.all(
    toCreate.map(async (action) => ({
      entry: action.entry,
      passwordHash: await hashPassword(credentials[action.slug] as string),
    })),
  );

  await prisma.$transaction(async (tx) => {
    for (const { entry, passwordHash } of prepared) {
      await tx.user.create({
        data: {
          firstName: entry.firstName,
          lastName: entry.lastName,
          displayName: entry.displayName,
          normalizedName: entry.normalizedName,
          role: entry.role,
          defaultColor: entry.defaultColor,
          passwordHash,
        },
      });
      console.log(`  creado: ${entry.displayName} (${entry.role})`);
    }

    // --- Campo y competicion, idempotentes por clave natural ---------------

    const course = await tx.course.upsert({
      where: { clubCode: '4401' },
      update: {},
      create: {
        clubCode: '4401',
        name: 'Club de Golf Ulzama',
        courseName: 'Ulzama',
      },
    });

    const existingCompetition = await tx.competition.findFirst({
      where: { edition: 'I Peñita Golf Championship – Ulzama-Bariain 2026' },
    });

    if (existingCompetition) {
      console.log('  competicion ya existente: no se modifica');
      return;
    }

    const source = await tx.courseDataSource.create({
      data: {
        courseId: course.id,
        provider: 'RFEG',
        sourceType: 'WEB_OFICIAL',
        sourceReference: 'https://rfegolf.es/club/club_de_golf_ulzama?id=211',
        fetchedAt: new Date('2026-09-17T00:00:00Z'),
        version: 1,
        isVerified: false,
        rawMetadata: {
          nota:
            'Vc 72,6 / Slope 139 para AMARILLAS (M). La web de RFEG no publica fecha de ' +
            'valoracion ni valoraciones de 9 hoyos. Pendiente de solicitar la ficha al club.',
        },
      },
    });

    const competition = await tx.competition.create({
      data: {
        name: 'Peñita Golf Championship',
        edition: 'I Peñita Golf Championship – Ulzama-Bariain 2026',
        timezone: 'Europe/Madrid',
        modality: 'INDIVIDUAL_STABLEFORD',
        teeColor: 'AMARILLAS',
        category: 'CABALLEROS',
        handicapAllowancePercent: 95,
        // ROUND_TWICE: lectura literal del WHS. Autorizado por el organizador
        // el 17/09/2026 tras ver el impacto medido. Ver handicap.ts.
        handicapRoundingPolicy: 'ROUND_TWICE',
        handicapRuleVersion: buildRuleVersion({
          allowancePercent: 95,
          roundingPolicy: 'ROUND_TWICE',
        }),
        status: 'DRAFT',
        classificationStatus: 'HIDDEN',
      },
    });

    /**
     * La valoracion se activa CONFIRMADA.
     *
     * El organizador la comprobo contra el microsite oficial de RFEG el
     * 17/09/2026 y la confirmo. Como el panel todavia no existe, la confirmacion
     * se registra aqui, con su actor, su fecha y su motivo en la auditoria, que
     * es exactamente lo que habria quedado registrado al pulsar el boton.
     *
     * La restriccion `active_requires_confirmation` de prisma/sql/constraints.sql
     * sigue vigente: un snapshot activo sin actor y sin fecha lo rechaza la base
     * de datos.
     */
    const admin = await tx.user.findFirst({
      where: { role: 'ADMIN' },
      select: { id: true },
    });
    if (!admin) {
      throw new Error('No hay administrador: no se puede registrar quien confirma la valoracion.');
    }

    const confirmedAt = new Date('2026-09-17T00:00:00Z');

    const snapshot = await tx.competitionCourseSnapshot.create({
      data: {
        competitionId: competition.id,
        sourceId: source.id,
        teeName: 'AMARILLAS',
        category: 'CABALLEROS',
        slopeRating: ULZAMA_AMARILLAS_CABALLEROS.slopeRating,
        courseRatingTenths: ULZAMA_AMARILLAS_CABALLEROS.courseRatingTenths,
        parTotal: ULZAMA_AMARILLAS_CABALLEROS.parTotal,
        distanceTotal: ULZAMA_AMARILLAS_CABALLEROS.distanceTotal,
        isActive: true,
        confirmedByUserId: admin.id,
        confirmedAt,
        holes: {
          create: ULZAMA_HOLES.map((hole) => ({
            holeNumber: hole.holeNumber,
            par: hole.par,
            strokeIndex: hole.strokeIndex,
            distance: hole.distance,
          })),
        },
      },
    });

    await tx.courseDataSource.update({
      where: { id: source.id },
      data: { isVerified: true, verifiedByUserId: admin.id, verifiedAt: confirmedAt },
    });

    await tx.auditLog.create({
      data: {
        competitionId: competition.id,
        actorId: admin.id,
        action: 'COURSE_SNAPSHOT_CONFIRMED',
        entityType: 'CompetitionCourseSnapshot',
        entityId: snapshot.id,
        beforeData: { slopeRating: 132, courseRatingTenths: 722, source: 'ficha RFEG 09/10/2014' } as object,
        afterData: { slopeRating: 139, courseRatingTenths: 726, source: 'microsite oficial RFEG' },
        reason:
          'Confirmada por el organizador el 17/09/2026 tras comprobar los valores contra el ' +
          'microsite oficial de RFEG. Pendiente unicamente la fecha de vigencia, que RFEG no ' +
          'publica. Registrada en el seed porque el panel de administracion aun no existe.',
        createdAt: confirmedAt,
      },
    });

    console.log('  competicion creada y valoracion 72,6/139 activada (confirmada, con auditoria)');
  });

  console.log(`Seed completado. Algoritmo de hash: ${PREFERRED_ALGORITHM}.`);
  console.log('Siguiente paso: confirmar la valoracion del campo desde el panel de admin.');
}

main()
  .catch((error) => {
    // Nunca imprimir el objeto de credenciales.
    console.error('Seed fallido:', error instanceof Error ? error.message : 'error desconocido');
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
