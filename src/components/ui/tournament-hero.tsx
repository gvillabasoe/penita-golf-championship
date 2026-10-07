/**
 * Tarjeta heroe de Mi tarjeta.
 *
 * ---------------------------------------------------------------------------
 * La metafora
 * ---------------------------------------------------------------------------
 * Un portatarjetas de piel marino —el del escudo— con la tarjeta de juego
 * impresa metida dentro. En la tapa, el campo y los puntos. En la cartulina,
 * los 18 hoyos con los golpes "escritos" y las formas de siempre: circulo bajo
 * par, cuadrado sobre par, raya para la bola levantada.
 *
 * Es el unico sitio de la aplicacion donde se gasta la audacia visual. Todo lo
 * demas va plano y callado para que esto se lea primero.
 *
 * El hoyo en juego se marca en amarillo tee, que en todo el sistema significa
 * una sola cosa: "estas aqui".
 *
 * ---------------------------------------------------------------------------
 * Fotografia
 * ---------------------------------------------------------------------------
 * El proyecto no incluye ninguna imagen del campo con derechos comprobados, y
 * no se descarga ninguna. `photoUrl` la admite el dia que exista, con el velo
 * oscuro que garantiza el contraste del texto encima.
 */

import type { GrossCategory, HoleResult } from '@/lib/golf/types';
import { resultLabel } from '@/lib/golf/stableford';

const MINI_CLASS: Record<GrossCategory, string> = {
  HOLE_IN_ONE: 'mini-hole__value--hole-in-one',
  ALBATROS: 'mini-hole__value--albatros',
  EAGLE: 'mini-hole__value--eagle',
  BIRDIE: 'mini-hole__value--birdie',
  PAR: '',
  BOGEY: 'mini-hole__value--bogey',
  DOUBLE_BOGEY: 'mini-hole__value--double',
  TRIPLE_BOGEY_OR_WORSE: 'mini-hole__value--triple',
  PICKUP: 'mini-hole__value--pickup',
};

/**
 * Curvas de nivel finas, en el trazo marfil del escudo. Decorativas, y por
 * tanto ocultas al lector de pantalla. El color lo pone la hoja de estilos.
 */
function ContourTexture() {
  return (
    <svg
      className="hero__texture"
      viewBox="0 0 400 220"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <g fill="none" strokeWidth="1">
        <path d="M240 -10 C 300 30, 330 70, 420 80" />
        <path d="M210 -10 C 280 44, 320 96, 420 108" />
        <path d="M182 -10 C 262 58, 312 122, 420 136" />
        <path d="M156 -10 C 246 72, 304 148, 420 164" />
        <path d="M132 -10 C 232 86, 296 174, 420 192" />
        <path d="M110 -10 C 220 100, 290 200, 420 222" />
      </g>
    </svg>
  );
}

export interface MiniNineProps {
  label: string;
  results: HoleResult[];
  total: number;
  /** Hoyo en juego, para marcarlo. */
  currentHole?: number;
}

/** Una de las dos filas de la cartulina, con su total al final. */
export function MiniNine({ label, results, total, currentHole }: MiniNineProps) {
  return (
    <div className="mini-nine" role="group" aria-label={label}>
      {results.map((result) => {
        const hasResult = result.grossStrokes !== null || result.isPickup;
        const isCurrent = currentHole === result.holeNumber;

        return (
          <span
            className="mini-hole"
            key={result.holeNumber}
            data-current={isCurrent ? 'true' : undefined}
          >
            <span className="mini-hole__number" aria-hidden="true">
              {result.holeNumber}
            </span>
            <span
              className={`mini-hole__value ${
                hasResult ? MINI_CLASS[result.grossCategory] : 'mini-hole__value--empty'
              }`.trim()}
              role="img"
              aria-label={
                hasResult
                  ? `Hoyo ${result.holeNumber}: ${resultLabel(result)}`
                  : isCurrent
                    ? `Hoyo ${result.holeNumber}: el siguiente por jugar`
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

      <span className="mini-nine__total" aria-label={`${label}: ${total} puntos`}>
        {total}
      </span>
    </div>
  );
}

export interface TournamentHeroProps {
  /** Nombre del campo. */
  course: string;
  /** Fecha formateada, ya en la zona del torneo. */
  date: string;
  /** Linea de apoyo del campo: par y numero de hoyos. */
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
  /** Hoyo en juego. Se marca en amarillo tee en la cartulina. */
  currentHole?: number;
  /** Fotografia autorizada del campo, si algun dia existe. */
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
  currentHole,
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
        <ContourTexture />
      )}

      <div className="hero__body">
        <div className="hero__identity">
          <p className="hero__course">{course}</p>
          <p className="hero__meta">
            <span>{date}</span>
            <span>{courseLine}</span>
          </p>
        </div>

        <p className="hero__score">
          <span className="hero__score-value">{score}</span>
          <span className="hero__score-unit">{scoreUnit}</span>
          {scoreNote ? <span className="hero__score-note">{scoreNote}</span> : null}
        </p>
      </div>

      {chips ? <div className="hero__chips">{chips}</div> : null}

      {nines ? (
        <div className="hero__card">
          <MiniNine
            label="Ida"
            results={nines.out}
            total={nines.outTotal}
            currentHole={currentHole}
          />
          <MiniNine
            label="Vuelta"
            results={nines.in}
            total={nines.inTotal}
            currentHole={currentHole}
          />
        </div>
      ) : null}
    </section>
  );
}
