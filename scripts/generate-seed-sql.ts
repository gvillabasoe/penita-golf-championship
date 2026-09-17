/**
 * Genera el SQL de datos iniciales: los 13 jugadores, la competicion y la
 * valoracion del campo.
 *
 *   npm run gen:seed-sql
 *
 * ---------------------------------------------------------------------------
 * Para que existe
 * ---------------------------------------------------------------------------
 * El seed normal (`npm run db:seed`) necesita Node, porque las contrasenas se
 * guardan hasheadas y el hash hay que calcularlo: no se puede hacer en SQL.
 *
 * Esto calcula los hashes UNA VEZ y los escribe en un archivo SQL, para poder
 * poner en marcha el torneo pegandolo en el editor de Neon, sin instalar nada.
 *
 * ---------------------------------------------------------------------------
 * El archivo generado contiene hashes de contrasenas reales
 * ---------------------------------------------------------------------------
 * No son las contrasenas en claro —eso seria inaceptable— pero un hash de una
 * contrasena que sigue un patron adivinable se puede atacar sin prisa y sin
 * dejar rastro.
 *
 * Por eso el archivo:
 *   - esta en .gitignore y NO se versiona,
 *   - no debe compartirse por correo ni por WhatsApp,
 *   - hay que borrarlo en cuanto se haya ejecutado.
 *
 * Las contrasenas en claro se leen de prisma/seed-credentials.json, que tampoco
 * se versiona, y no aparecen en la salida por ningun sitio.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { hashPassword } from '../src/lib/auth/password';
import { resolveRoster } from '../src/lib/seed/roster';
import { ULZAMA_AMARILLAS_CABALLEROS, ULZAMA_HOLES } from '../src/lib/golf/course';
import { buildRuleVersion } from '../src/lib/golf/competition-config';
import { isColumn, parseSchema, type ParsedSchema } from './generate-sql';

const STAMP = "TIMESTAMP '2026-09-17 00:00:00'";

/** Comilla simple de SQL, escapando las que vengan dentro. */
function quote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

interface Insert {
  table: string;
  columns: string[];
  rows: string[][];
}

function renderInsert(insert: Insert): string {
  const columns = insert.columns.map((column) => `"${column}"`).join(', ');
  const values = insert.rows.map((row) => `  (${row.join(', ')})`).join(',\n');
  return [
    `INSERT INTO "${insert.table}" (${columns}) VALUES`,
    values,
    `ON CONFLICT ("id") DO NOTHING;`,
  ].join('\n');
}

/**
 * Columnas obligatorias de una tabla: NOT NULL y sin valor por defecto.
 *
 * Se derivan del esquema, no de una lista escrita a mano. Olvidar una columna
 * obligatoria en un INSERT tumba la transaccion entera al pegarla, y es
 * exactamente el error que nadie ve leyendo 200 lineas de SQL.
 */
export function requiredColumns(schema: ParsedSchema, table: string): string[] {
  const model = schema.models.find((item) => item.name === table);
  if (!model) throw new Error(`Tabla desconocida: ${table}`);
  return model.fields
    .filter((field) => isColumn(field, schema))
    .filter((field) => !field.optional)
    .filter((field) => !/@default\(/.test(field.attributes))
    .map((field) => field.name);
}

export async function generateSeedSql(credentials: Record<string, string>): Promise<string> {
  const schema = parseSchema(readFileSync(join(process.cwd(), 'prisma/schema.prisma'), 'utf8'));
  const roster = resolveRoster();

  const missing = roster.filter((entry) => !credentials[entry.slug]);
  if (missing.length > 0) {
    throw new Error(
      `Faltan contrasenas para: ${missing.map((entry) => entry.slug).join(', ')}`,
    );
  }

  const competitionId = 'cmp_ulzama_2026';
  const courseId = 'crs_ulzama_4401';
  const sourceId = 'src_rfeg_web_2026';
  const snapshotId = 'snp_amarillas_caballeros';
  const adminId = `usr_${roster.find((entry) => entry.role === 'ADMIN')?.slug ?? 'gvillabaso'}`;

  const inserts: Insert[] = [];

  // --- Jugadores -----------------------------------------------------------
  const userRows: string[][] = [];
  for (const entry of roster) {
    const passwordHash = await hashPassword(credentials[entry.slug]);
    userRows.push([
      quote(`usr_${entry.slug}`),
      quote(entry.firstName),
      quote(entry.lastName),
      quote(entry.displayName),
      quote(entry.normalizedName),
      quote(passwordHash),
      `${quote(entry.role)}::"Role"`,
      quote(entry.defaultColor),
      STAMP,
    ]);
  }
  inserts.push({
    table: 'User',
    columns: [
      'id',
      'firstName',
      'lastName',
      'displayName',
      'normalizedName',
      'passwordHash',
      'role',
      'defaultColor',
      'updatedAt',
    ],
    rows: userRows,
  });

  // --- Campo ---------------------------------------------------------------
  inserts.push({
    table: 'Course',
    columns: ['id', 'clubCode', 'name', 'courseName', 'updatedAt'],
    rows: [
      [
        quote(courseId),
        quote('4401'),
        quote('Club de Golf Ulzama'),
        quote('Ulzama'),
        STAMP,
      ],
    ],
  });

  inserts.push({
    table: 'CourseDataSource',
    columns: [
      'id',
      'courseId',
      'provider',
      'sourceType',
      'sourceReference',
      'ratingDate',
      'validFrom',
      'fetchedAt',
      'version',
      'isVerified',
      'verifiedByUserId',
      'verifiedAt',
    ],
    rows: [
      [
        quote(sourceId),
        quote(courseId),
        quote('RFEG'),
        `${quote('WEB_OFICIAL')}::"CourseSourceType"`,
        quote('https://rfegolf.es/club/club_de_golf_ulzama?id=211'),
        "TIMESTAMP '2024-07-01 00:00:00'",
        "TIMESTAMP '2024-07-01 00:00:00'",
        STAMP,
        '1',
        'true',
        quote(adminId),
        STAMP,
      ],
    ],
  });

  // --- Competicion ---------------------------------------------------------
  const ruleVersion = buildRuleVersion({ allowancePercent: 95, roundingPolicy: 'ROUND_TWICE' });
  inserts.push({
    table: 'Competition',
    columns: [
      'id',
      'name',
      'edition',
      'timezone',
      'modality',
      'teeColor',
      'category',
      'handicapAllowancePercent',
      'handicapRoundingPolicy',
      'handicapRuleVersion',
      'status',
      'classificationStatus',
      'updatedAt',
    ],
    rows: [
      [
        quote(competitionId),
        quote('Peñita Golf Championship'),
        quote('I Peñita Golf Championship – Ulzama-Bariain 2026'),
        quote('Europe/Madrid'),
        `${quote('INDIVIDUAL_STABLEFORD')}::"Modality"`,
        `${quote('AMARILLAS')}::"TeeName"`,
        `${quote('CABALLEROS')}::"PlayerCategory"`,
        '95',
        `${quote('ROUND_TWICE')}::"HandicapRoundingPolicy"`,
        quote(ruleVersion),
        `${quote('CONFIGURED')}::"CompetitionStatus"`,
        `${quote('HIDDEN')}::"ClassificationStatus"`,
        STAMP,
      ],
    ],
  });

  // --- Valoracion del campo, activa y confirmada ---------------------------
  inserts.push({
    table: 'CompetitionCourseSnapshot',
    columns: [
      'id',
      'competitionId',
      'sourceId',
      'teeName',
      'category',
      'slopeRating',
      'courseRatingTenths',
      'parTotal',
      'distanceTotal',
      'isActive',
      'confirmedByUserId',
      'confirmedAt',
    ],
    rows: [
      [
        quote(snapshotId),
        quote(competitionId),
        quote(sourceId),
        `${quote('AMARILLAS')}::"TeeName"`,
        `${quote('CABALLEROS')}::"PlayerCategory"`,
        String(ULZAMA_AMARILLAS_CABALLEROS.slopeRating),
        String(ULZAMA_AMARILLAS_CABALLEROS.courseRatingTenths),
        String(ULZAMA_AMARILLAS_CABALLEROS.parTotal),
        String(ULZAMA_AMARILLAS_CABALLEROS.distanceTotal),
        'true',
        quote(adminId),
        STAMP,
      ],
    ],
  });

  inserts.push({
    table: 'CourseHoleSnapshot',
    columns: ['id', 'snapshotId', 'holeNumber', 'par', 'strokeIndex', 'distance'],
    rows: ULZAMA_HOLES.map((hole) => [
      quote(`hol_${String(hole.holeNumber).padStart(2, '0')}`),
      quote(snapshotId),
      String(hole.holeNumber),
      String(hole.par),
      String(hole.strokeIndex),
      String(hole.distance),
    ]),
  });

  // --- Inscripciones -------------------------------------------------------
  inserts.push({
    table: 'CompetitionPlayer',
    columns: ['id', 'competitionId', 'userId', 'snapshotId', 'color', 'updatedAt'],
    rows: roster.map((entry) => [
      quote(`plr_${entry.slug}`),
      quote(competitionId),
      quote(`usr_${entry.slug}`),
      quote(snapshotId),
      quote(entry.defaultColor),
      STAMP,
    ]),
  });

  // --- Auditoria de la confirmacion ---------------------------------------
  inserts.push({
    table: 'AuditLog',
    columns: [
      'id',
      'competitionId',
      'actorId',
      'action',
      'entityType',
      'entityId',
      'beforeData',
      'afterData',
      'reason',
      'createdAt',
    ],
    rows: [
      [
        quote('aud_confirmacion_valoracion'),
        quote(competitionId),
        quote(adminId),
        quote('COURSE_SNAPSHOT_CONFIRMED'),
        quote('CompetitionCourseSnapshot'),
        quote(snapshotId),
        `${quote(JSON.stringify({ slopeRating: 132, courseRatingTenths: 722, source: 'ficha RFEG 09/10/2014' }))}::jsonb`,
        `${quote(JSON.stringify({ slopeRating: 139, courseRatingTenths: 726, ratingDate: '2024-07', source: 'microsite oficial RFEG' }))}::jsonb`,
        quote(
          'Confirmada por el organizador el 17/09/2026 tras comprobar los valores y la fecha de vigencia contra el microsite oficial de RFEG. Registrada en el SQL de arranque porque el panel aun no existia.',
        ),
        STAMP,
      ],
    ],
  });

  // --- Comprobacion antes de escribir -------------------------------------
  for (const insert of inserts) {
    const required = requiredColumns(schema, insert.table);
    const absent = required.filter((column) => !insert.columns.includes(column));
    if (absent.length > 0) {
      throw new Error(
        `INSERT en "${insert.table}" sin columnas obligatorias: ${absent.join(', ')}`,
      );
    }
    for (const row of insert.rows) {
      if (row.length !== insert.columns.length) {
        throw new Error(
          `INSERT en "${insert.table}": ${insert.columns.length} columnas y ${row.length} valores`,
        );
      }
    }
  }

  const out: string[] = [];
  out.push('-- =============================================================================');
  out.push('-- Peñita Golf Championship - datos iniciales');
  out.push('--');
  out.push('-- GENERADO por scripts/generate-seed-sql.ts. No editar a mano.');
  out.push('--');
  out.push('-- Aplicar DESPUÉS de schema.sql y constraints.sql.');
  out.push('--');
  out.push('-- Crea: 13 jugadores con su contraseña hasheada, el campo, la fuente RFEG,');
  out.push('-- la competición, la valoración activa y confirmada, los 18 hoyos, las 13');
  out.push('-- inscripciones y la entrada de auditoría de la confirmación.');
  out.push('--');
  out.push('-- ### ESTE ARCHIVO CONTIENE HASHES DE CONTRASEÑAS REALES ###');
  out.push('--');
  out.push('-- No son las contraseñas en claro, pero un hash de una contraseña que sigue');
  out.push('-- un patrón adivinable se puede atacar sin prisa y sin dejar rastro.');
  out.push('--');
  out.push('--   - NO lo subas a GitHub (está en .gitignore).');
  out.push('--   - NO lo mandes por correo ni por WhatsApp.');
  out.push('--   - BÓRRALO en cuanto lo hayas ejecutado.');
  out.push('--');
  out.push('-- Va en una transacción y es re-ejecutable: ON CONFLICT DO NOTHING en cada');
  out.push('-- INSERT, así que pegarlo dos veces no duplica ni sobreescribe nada. En');
  out.push('-- particular, NO reescribe una contraseña que alguien haya cambiado después.');
  out.push('-- =============================================================================');
  out.push('');
  out.push('BEGIN;');
  out.push('');

  for (const insert of inserts) {
    out.push(`-- ${insert.table} (${insert.rows.length})`);
    out.push(renderInsert(insert));
    out.push('');
  }

  out.push('COMMIT;');
  out.push('');
  out.push('-- Comprobación: abrir /api/diagnostico. Debe decir "ready": true.');
  out.push('-- Siguiente paso: introducir los hándicaps en /admin/jugadores.');

  return out.join('\n');
}

async function main(): Promise<void> {
  const path = process.env.SEED_CREDENTIALS_FILE ?? join(process.cwd(), 'prisma/seed-credentials.json');
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    throw new Error(
      `Falta ${path}. Copia prisma/seed-credentials.example.json y rellena las contrasenas.`,
    );
  }

  const parsed = JSON.parse(raw) as Record<string, unknown>;
  const credentials = Object.fromEntries(
    Object.entries(parsed)
      .filter(([key, value]) => !key.startsWith('_') && typeof value === 'string')
      .map(([key, value]) => [key, value as string]),
  );

  const sql = await generateSeedSql(credentials);
  const target = join(process.cwd(), 'prisma/sql/datos-iniciales.sql');
  writeFileSync(target, `${sql}\n`);

  console.log('prisma/sql/datos-iniciales.sql generado.');
  console.log('  Contiene hashes de contrasenas: no lo versiones y borralo tras usarlo.');
}

if (process.argv[1]?.endsWith('generate-seed-sql.ts')) {
  main().catch((error: unknown) => {
    console.error('Fallo:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
