/**
 * Heroe del campeonato y resumen compacto de la vuelta.
 *
 * ---------------------------------------------------------------------------
 * Por que no hay fotografia
 * ---------------------------------------------------------------------------
 * La referencia visual apoya el resumen sobre una fotografia del campo, y es un
 * buen patron. Pero este proyecto no incluye ninguna imagen de Ulzama con los
 * derechos comprobados, y bajar una de internet no es una opcion: la seccion 14
 * lo prohibe explicitamente.
 *
 * Asi que la cabecera es grafica: verde profundo, curvas de nivel dibujadas en
 * SVG y tipografia editorial. El dia que exista una foto autorizada, este
 * componente ya la admite: `photoUrl` la pinta con `next/image` y el gradiente
 * oscuro que garantiza el contraste del texto encima. Hasta entonces el
 * parametro no se usa y la cabecera se sostiene sola.
 *
 * El resumen de 18 hoyos conserva las formas deportivas (circulo bajo par,
 * cuadrado sobre par) en version reducida: es la misma informacion que la
 * tarjeta grande, no una decoracion.
 */

import type { GrossCategory, HoleResult } from '@/lib/golf/types';
import { resultLabel } from '@/lib/golf/stableford';

const MINI_CLASS: Record<GrossCategory, string> = {
  HOLE_IN_ONE: 'mini-hole__value--hole-in-one',
  ALBATROS: 'mini-hole__value--albatros',
  EAGLE: 'mini-hole__value--eagle',
  BIRDIE: 'mini-hole__value--birdie',
  PAR: 'mini-hole__value--par',
  BOGEY: 'mini-hole__value--bogey',
  DOUBLE_BOGEY: 'mini-hole__value--double',
  TRIPLE_BOGEY_OR_WORSE: 'mini-hole__value--triple',
  PICKUP: 'mini-hole__value--pickup',
};

/** Curvas de nivel. Decorativa y por tanto oculta al lector de pantalla. */
function FairwayTexture() {
  return (
    <svg
      className="hero__texture"
      viewBox="0 0 400 200"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <g fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="1">
        <path d="M-20 172 C 60 140, 120 168, 200 132 S 340 108, 420 128" />
        <path d="M-20 152 C 60 120, 130 150, 210 112 S 345 88, 420 106" />
        <path d="M-20 132 C 70 100, 140 130, 220 92 S 350 68, 420 84" />
        <path d="M-20 110 C 80 80, 150 108, 230 70 S 355 46, 420 60" />
        <path d="M-20 86 C 90 58, 160 84, 240 48 S 360 26, 420 38" />
      </g>
      <g fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1">
        <path d="M-20 62 C 100 36, 170 60, 250 26 S 365 6, 420 16" />
        <path d="M-20 38 C 110 16, 180 36, 260 6" />
      </g>
    </svg>
  );
}

export interface MiniNineProps {
  label: string;
  results: HoleResult[];
  total: number;
}

/** Una de las dos filas de nueve hoyos, con su total al final. */
export function MiniNine({ label, results, total }: MiniNineProps) {
  return (
    <div className="mini-nine" role="group" aria-label={label}>
      {results.map((result) => {
        const hasResult = result.grossStrokes !== null || result.isPickup;

        return (
          <span className="mini-hole" key={result.holeNumber}>
            <span className="mini-hole__number" aria-hidden="true">
              {result.holeNumber}
            </span>
            <span
              className={`mini-hole__value ${
                hasResult ? MINI_CLASS[result.grossCategory] : 'mini-hole__value--empty'
              }`}
              role="img"
              aria-label={
                hasResult
                  ? `Hoyo ${result.holeNumber}: ${resultLabel(result)}`
                  : `Hoyo ${result.holeNumber}: pendiente`
              }
            >
              {result.isPickup
                ? '\u2014'
                : result.grossStrokes === null
                  ? '\u00b7'
                  : result.grossStrokes}
            </span>
          </span>
        );
      })}

      <span
        className="mini-nine__total data"
        aria-label={`${label}: ${total} puntos`}
      >
        {total}
      </span>
    </div>
  );
}

export interface TournamentHeroProps {
  /** Nombre del campo y recorrido. */
  course: string;
  /** Fecha formateada, ya en la zona del torneo. */
  date: string;
  /** "18 hoyos · Par 72" */
  courseLine: string;
  /** Modalidad, barras y estado: se pintan como insignias. */
  chips?: React.ReactNode;
  /** Cifra grande: los puntos Stableford de la vuelta. */
  score: number;
  scoreUnit?: string;
  /** Secundaria junto a la principal, por ejemplo los hoyos jugados. */
  scoreNote?: string;
  /** Las dos filas de nueve. Sin resultados todavia, se puede omitir. */
  nines?: { out: HoleResult[]; outTotal: number; in: HoleResult[]; inTotal: number };
  /**
   * Fotografia autorizada del campo. Cuando llegue, se pinta de fondo con el
   * gradiente oscuro por encima. Mientras no exista, la cabecera es grafica.
   */
  photoUrl?: string;
}

export function TournamentHero({
  course,
  date,
  courseLine,
  chips,
  score,
  scoreUnit = 'puntos',
  scoreNote,
  nines,
  photoUrl,
}: TournamentHeroProps) {
  return (
    <section className="hero" aria-label="Resumen de la vuelta">
      {photoUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- ver docs/design-system.md */}
          <img className="hero__texture" src={photoUrl} alt="" aria-hidden="true" />
          <span className="hero__scrim" />
        </>
      ) : (
        <FairwayTexture />
      )}

      <div className="hero__body">
        <div className="hero__meta">
          <span>{date}</span>
          <span>{courseLine}</span>
        </div>

        <div className="hero__headline">
          <div>
            <p className="hero__course">{course}</p>
          </div>

          <p className="hero__score">
            <span className="hero__score-value">{score}</span>
            <span className="hero__score-unit">{scoreNote ?? scoreUnit}</span>
          </p>
        </div>

        {chips ? <div className="hero__chips">{chips}</div> : null}
      </div>

      {nines ? (
        <div className="hero__nines">
          <MiniNine label="Ida" results={nines.out} total={nines.outTotal} />
          <MiniNine label="Vuelta" results={nines.in} total={nines.inTotal} />
        </div>
      ) : null}
    </section>
  );
}
