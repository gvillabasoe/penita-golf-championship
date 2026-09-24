import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';

import { PointsCell, ScoreNumber, StrokesReceivedDots } from '../score';
import { HoleRow, ScorecardList, TotalsPanel } from '../scorecard';
import { ConfirmationSheet, Keypad } from '../keypad';
import { Leaderboard, LeaderboardCard, SaveStatusBadge } from '../leaderboard';

import { ULZAMA_HOLES } from '@/lib/golf/course';
import { allocateStrokes } from '@/lib/golf/strokes';
import { computeTotals, resolveHole, resolveScorecard, type HoleScoreInput } from '@/lib/golf/stableford';
import { buildRanking, revealOrder } from '@/lib/golf/ranking';
import { buildConfirmationSummary, deriveSaveStatus } from '@/lib/scorecard/session';
import { initialRevealState, type RevealState } from '@/lib/reveal/controller';
import type { RankingInput } from '@/lib/golf/types';

const render = (element: React.ReactElement) => renderToStaticMarkup(element);

const strokesFor = (hj: number) =>
  new Map(allocateStrokes(hj, ULZAMA_HOLES).map((a) => [a.holeNumber, a.strokesReceived]));

const distances = new Map(ULZAMA_HOLES.map((h) => [h.holeNumber, h.distance]));

const hole = (n: number) => ULZAMA_HOLES[n - 1];

describe('celda de resultado bruto', () => {
  test('el par no lleva forma y el numero es el bruto', () => {
    const result = resolveHole(hole(1), 0, { holeNumber: 1, grossStrokes: 4, isPickup: false });
    const html = render(<ScoreNumber result={result} />);
    assert.match(html, /score-number--par/);
    assert.match(html, /aria-label="Par, 4 golpes, 2 puntos Stableford"/);
    assert.equal(html.includes('score-number--birdie'), false);
  });

  test('el birdie lleva circulo y el bogey cuadrado: la forma informa', () => {
    const birdie = resolveHole(hole(1), 0, { holeNumber: 1, grossStrokes: 3, isPickup: false });
    const bogey = resolveHole(hole(1), 0, { holeNumber: 1, grossStrokes: 5, isPickup: false });
    assert.match(render(<ScoreNumber result={birdie} />), /score-number--birdie/);
    assert.match(render(<ScoreNumber result={bogey} />), /score-number--bogey/);
  });

  test('la categoria visual NO cambia con los golpes recibidos', () => {
    const sinGolpe = resolveHole(hole(1), 0, { holeNumber: 1, grossStrokes: 3, isPickup: false });
    const conGolpe = resolveHole(hole(1), 1, { holeNumber: 1, grossStrokes: 3, isPickup: false });
    assert.match(render(<ScoreNumber result={sinGolpe} />), /score-number--birdie/);
    assert.match(render(<ScoreNumber result={conGolpe} />), /score-number--birdie/);
    // Los puntos si cambian.
    assert.match(render(<ScoreNumber result={sinGolpe} />), /3 puntos/);
    assert.match(render(<ScoreNumber result={conGolpe} />), /4 puntos/);
  });

  test('el hoyo en uno se anuncia como tal', () => {
    const hio = resolveHole(hole(2), 0, { holeNumber: 2, grossStrokes: 1, isPickup: false });
    const html = render(<ScoreNumber result={hio} />);
    assert.match(html, /score-number--hole-in-one/);
    assert.match(html, /aria-label="Hoyo en uno/);
  });

  test('la raya se pinta como guion y se lee como raya sin puntuacion', () => {
    const raya = resolveHole(hole(5), 2, { holeNumber: 5, grossStrokes: null, isPickup: true });
    const html = render(<ScoreNumber result={raya} />);
    assert.match(html, /score-number--pickup/);
    assert.match(html, /aria-label="Raya, sin puntuacion"/);
    assert.equal(html.includes('>0<'), false, 'la raya no debe mostrar un 0 como si fuera bruto');
  });

  test('todas las categorias tienen etiqueta accesible', () => {
    for (const gross of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      const result = resolveHole(hole(1), 0, { holeNumber: 1, grossStrokes: gross, isPickup: false });
      const html = render(<ScoreNumber result={result} />);
      assert.match(html, /aria-label="[^"]+"/, `sin etiqueta con ${gross} golpes`);
      assert.match(html, /role="img"/);
    }
  });
});

describe('celda de puntos', () => {
  test('cada puntuacion tiene su clase y su etiqueta', () => {
    for (const points of [0, 1, 2, 3, 4, 5]) {
      const html = render(<PointsCell points={points} isPickup={false} hasResult />);
      assert.match(html, new RegExp(`points-cell--${points}`));
      assert.match(html, /puntos? Stableford/);
    }
  });

  test('el singular se escribe bien con un punto', () => {
    assert.match(render(<PointsCell points={1} isPickup={false} hasResult />), /1 punto Stableford/);
    assert.match(render(<PointsCell points={2} isPickup={false} hasResult />), /2 puntos Stableford/);
  });

  test('la raya se distingue del cero por algo mas que el color', () => {
    const raya = render(<PointsCell points={0} isPickup hasResult />);
    const cero = render(<PointsCell points={0} isPickup={false} hasResult />);
    assert.match(raya, /points-cell--pickup/);
    assert.equal(cero.includes('points-cell--pickup'), false);
    assert.match(raya, /aria-label="Raya, 0 puntos Stableford"/);
  });

  test('un hoyo sin jugar no muestra 0 puntos', () => {
    const html = render(<PointsCell points={0} isPickup={false} hasResult={false} />);
    assert.match(html, /aria-label="Hoyo sin jugar"/);
    assert.equal(html.includes('points-cell--0'), false);
  });
});

describe('golpes recibidos', () => {
  test('se muestran con puntos y con el numero', () => {
    const html = render(<StrokesReceivedDots strokesReceived={2} />);
    assert.match(html, /aria-label="Recibe 2 golpes"/);
    assert.match(html, /\+2/);
  });

  test('cero golpes no se confunde con un dato ausente', () => {
    assert.match(render(<StrokesReceivedDots strokesReceived={0} />), /aria-label="No recibe golpes"/);
  });

  test('un hándicap plus devuelve golpes y se dice asi', () => {
    const html = render(<StrokesReceivedDots strokesReceived={-1} />);
    assert.match(html, /aria-label="Devuelve 1 golpe"/);
    assert.match(html, /-1/);
  });
});

describe('fila de hoyo', () => {
  test('muestra los seis datos obligatorios de la seccion 11', () => {
    const result = resolveHole(hole(5), 2, { holeNumber: 5, grossStrokes: 6, isPickup: false });
    const html = render(<HoleRow result={result} distance={523} />);
    assert.match(html, /aria-label="Hoyo 5"/);
    assert.match(html, /Par 5/);
    assert.match(html, /SI 1/);
    assert.match(html, /523 m/);
    assert.match(html, /Recibe 2 golpes/);
    assert.match(html, /6 golpes/);
    assert.match(html, /puntos Stableford/);
  });

  test('marca el hoyo actual para la navegacion', () => {
    const result = resolveHole(hole(7), 1, undefined);
    assert.match(render(<HoleRow result={result} distance={400} isCurrent />), /aria-current="step"/);
  });

  test('avisa de escritura pendiente y de correccion administrativa', () => {
    const result = resolveHole(hole(7), 1, { holeNumber: 7, grossStrokes: 5, isPickup: false });
    const html = render(<HoleRow result={result} distance={400} isPending isOverridden />);
    assert.match(html, /aria-label="Pendiente de sincronizacion"/);
    assert.match(html, /aria-label="Corregido por el administrador"/);
  });

  test('en solo lectura la fila no es un enlace', () => {
    const result = resolveHole(hole(7), 1, { holeNumber: 7, grossStrokes: 5, isPickup: false });
    const html = render(<HoleRow result={result} distance={400} />);
    assert.equal(html.startsWith('<a'), false);
  });
});

describe('totales: no se publica un bruto falso', () => {
  const build = (played: Record<number, number | 'RAYA'>) => {
    const inputs = new Map<number, HoleScoreInput>(
      Object.entries(played).map(([h, value]) => [
        Number(h),
        value === 'RAYA'
          ? { holeNumber: Number(h), grossStrokes: null, isPickup: true }
          : { holeNumber: Number(h), grossStrokes: value, isPickup: false },
      ]),
    );
    return computeTotals(resolveScorecard(ULZAMA_HOLES, strokesFor(25), inputs));
  };

  test('vuelta completa sin rayas: muestra el resultado respecto al par', () => {
    const played: Record<number, number> = {};
    for (const h of ULZAMA_HOLES) played[h.holeNumber] = h.par;
    const html = render(<TotalsPanel totals={build(played)} />);
    assert.match(html, /aria-label="Resultado bruto par del campo"/);
    assert.equal(html.includes('Resultado bruto incompleto'), false);
  });

  test('con una sola raya NO aparece ningun bruto total', () => {
    const played: Record<number, number | 'RAYA'> = {};
    for (const h of ULZAMA_HOLES) played[h.holeNumber] = h.par;
    played[7] = 'RAYA';
    const html = render(<TotalsPanel totals={build(played)} />);
    assert.match(html, /Resultado bruto incompleto/);
    assert.match(html, /\(1 raya\)/);
    assert.equal(html.includes('aria-label="Resultado bruto'), false);
  });

  test('con la vuelta a medias tampoco se publica bruto', () => {
    const played: Record<number, number> = {};
    for (let h = 1; h <= 9; h += 1) played[h] = 5;
    const html = render(<TotalsPanel totals={build(played)} />);
    assert.match(html, /Resultado bruto incompleto/);
    assert.match(html, /9\/18/);
  });

  test('el plural de las rayas se escribe bien', () => {
    const played: Record<number, number | 'RAYA'> = {};
    for (const h of ULZAMA_HOLES) played[h.holeNumber] = h.par;
    played[7] = 'RAYA';
    played[12] = 'RAYA';
    assert.match(render(<TotalsPanel totals={build(played)} />), /\(2 rayas\)/);
  });
});

describe('tarjeta completa', () => {
  test('pinta 18 hoyos en dos nueves y no es una tabla', () => {
    const inputs = new Map<number, HoleScoreInput>();
    const results = resolveScorecard(ULZAMA_HOLES, strokesFor(25), inputs);
    const html = render(
      <ScorecardList results={results} distances={distances} totals={computeTotals(results)} />,
    );
    assert.match(html, /aria-label="Hoyos 1 a 9"/);
    assert.match(html, /aria-label="Hoyos 10 a 18"/);
    assert.equal(html.includes('<table'), false, 'la seccion 11 prohibe la tabla de escritorio');
    for (const h of ULZAMA_HOLES) {
      assert.match(html, new RegExp(`aria-label="Hoyo ${h.holeNumber}"`));
    }
  });

  test('en solo lectura lo dice y no genera enlaces de edicion', () => {
    const results = resolveScorecard(ULZAMA_HOLES, strokesFor(25), new Map());
    const html = render(
      <ScorecardList
        results={results}
        distances={distances}
        totals={computeTotals(results)}
        readOnly
        holeHref={(n) => `/tarjeta/${n}`}
      />,
    );
    assert.match(html, /Solo lectura/);
    assert.equal(html.includes('/tarjeta/'), false, 'no debe haber enlaces de edicion');
  });
});

describe('teclado', () => {
  test('tiene exactamente 1 a 9 y raya, sin teclas de mas', () => {
    const html = render(<Keypad />);
    const buttons = html.match(/<button/g) ?? [];
    assert.equal(buttons.length, 10);
    for (let n = 1; n <= 9; n += 1) {
      assert.match(html, new RegExp(`aria-label="${n} golpes"`));
    }
    assert.match(html, /aria-label="Raya, levantar la bola"/);
    assert.equal(html.includes('aria-label="0 golpes"'), false);
    assert.equal(html.includes('aria-label="10 golpes"'), false);
  });

  test('marca la tecla seleccionada de forma accesible', () => {
    const html = render(<Keypad selected={5} />);
    assert.match(html, /aria-label="5 golpes" aria-pressed="true"/);
  });

  test('resalta el numero seleccionado cuando produce puntos Stableford', () => {
    const html = render(<Keypad selected={5} pointsByValue={{ 5: 2 }} />);
    assert.match(html, /score-keypad__key--scoring/);
    assert.match(html, /aria-label="5 golpes, 2 puntos Stableford"/);
    assert.match(html, />2 pts</);
  });

  test('se puede deshabilitar entero con la tarjeta bloqueada', () => {
    const html = render(<Keypad disabled />);
    assert.equal((html.match(/disabled/g) ?? []).length, 10);
  });
});

describe('hoja de confirmacion', () => {
  test('muestra todo lo que exige la seccion 36 antes de confirmar', () => {
    const summary = buildConfirmationSummary(hole(5), 2, {
      holeNumber: 5,
      grossStrokes: 6,
      isPickup: false,
    });
    const html = render(<ConfirmationSheet summary={summary} />);
    assert.match(html, /Hoyo 5/);
    assert.match(html, /<dt>Par<\/dt><dd>5<\/dd>/);
    assert.match(html, /Stroke index/);
    assert.match(html, /523 m/);
    assert.match(html, /Golpes recibidos/);
    assert.match(html, /6 golpes/);
    assert.match(html, /<dt>Neto<\/dt><dd>4<\/dd>/);
    assert.match(html, /Puntos Stableford/);
    assert.match(html, /Confirmar resultado/);
  });

  test('un resultado poco habitual pide casilla extra pero NO se bloquea para siempre', () => {
    const summary = buildConfirmationSummary(hole(2), 0, {
      holeNumber: 2,
      grossStrokes: 1,
      isPickup: false,
    });

    const sinMarcar = render(<ConfirmationSheet summary={summary} />);
    assert.match(sinMarcar, /Hoyo en uno/);
    assert.match(sinMarcar, /role="alert"/);
    assert.match(sinMarcar, /Confirmar resultado<\/button>/);
    assert.match(sinMarcar, /disabled/);

    const marcado = render(<ConfirmationSheet summary={summary} extraConfirmed />);
    assert.equal(
      marcado.includes('disabled'),
      false,
      'con la casilla marcada tiene que poder confirmarse',
    );
  });

  test('un resultado normal no pide nada extra', () => {
    const summary = buildConfirmationSummary(hole(1), 1, {
      holeNumber: 1,
      grossStrokes: 5,
      isPickup: false,
    });
    const html = render(<ConfirmationSheet summary={summary} />);
    assert.equal(html.includes('role="alert"'), false);
    assert.equal(html.includes('disabled'), false);
    assert.match(html, /confirmation__points--positive/);
  });

  test('la raya muestra neto vacio, no un cero', () => {
    const summary = buildConfirmationSummary(hole(5), 2, {
      holeNumber: 5,
      grossStrokes: null,
      isPickup: true,
    });
    const html = render(<ConfirmationSheet summary={summary} />);
    assert.match(html, /<dt>Neto<\/dt><dd>\u2014<\/dd>/);
    assert.match(html, /<dd>Raya<\/dd>/);
  });
});

describe('estado de guardado', () => {
  test('se anuncia con aria-live y no depende del color', () => {
    const html = render(
      <SaveStatusBadge
        status={deriveSaveStatus({
          pendingCount: 4,
          inFlightCount: 0,
          isOnline: false,
          hasPermanentFailure: false,
        })}
      />,
    );
    assert.match(html, /role="status"/);
    assert.match(html, /aria-live="polite"/);
    assert.match(html, /aria-label="[^"]*guardados en el movil/);
    assert.match(html, /4 por enviar/);
  });

  test('cada estado tiene su clase y su etiqueta', () => {
    const combos = [
      { pendingCount: 0, inFlightCount: 0, isOnline: true, hasPermanentFailure: false },
      { pendingCount: 2, inFlightCount: 0, isOnline: true, hasPermanentFailure: false },
      { pendingCount: 0, inFlightCount: 1, isOnline: true, hasPermanentFailure: false },
      { pendingCount: 0, inFlightCount: 0, isOnline: true, hasPermanentFailure: true },
    ];
    for (const combo of combos) {
      const html = render(<SaveStatusBadge status={deriveSaveStatus(combo)} />);
      assert.match(html, /save-status--[a-z]+/);
      assert.match(html, /aria-label="[^"]+"/);
    }
  });
});

describe('clasificacion y revelacion', () => {
  const player = (id: string, name: string, points: number, hcp: number): RankingInput => ({
    competitionPlayerId: id,
    displayName: name,
    color: '#cfe3d4',
    handicapIndexTenths: hcp,
    playingHandicap: 20,
    points,
    numericStrokes: 90,
    adjustedStrokes: 90,
    pickups: 0,
    holesCompleted: 18,
    scorecardStatus: 'FINISHED',
  });

  const rows = buildRanking([
    player('p1', 'Uno', 40, 100),
    player('p2', 'Dos', 38, 110),
    player('p3', 'Tres', 36, 120),
    player('p4', 'Cuatro', 34, 130),
    player('p5', 'Cinco', 32, 140),
  ]);
  const order = revealOrder(rows);

  const revealing = (revealedCount: number): RevealState => ({
    status: 'REVEALING',
    snapshotId: 'snap1',
    snapshotFingerprint: 'abc',
    revealedCount,
    totalGroups: order.length,
    isPaused: false,
    nextActionAvailableAt: 0,
    publishedAt: null,
    updatedById: 'admin',
  });

  test('oculta: el jugador ve el mensaje y NINGUN nombre', () => {
    const html = render(
      <Leaderboard rows={rows} revealOrder={order} state={initialRevealState()} role="PLAYER" />,
    );
    assert.match(html, /Clasificacion pendiente de publicacion/);
    for (const row of rows) {
      assert.equal(html.includes(row.displayName), false, `se filtra ${row.displayName}`);
    }
  });

  test('revelando: el jugador solo ve lo revelado, y el lider NO se filtra', () => {
    const html = render(
      <Leaderboard rows={rows} revealOrder={order} state={revealing(2)} role="PLAYER" />,
    );
    // Se revela de la ultima posicion hacia la primera: 5 y 4.
    assert.match(html, /Cinco/);
    assert.match(html, /Cuatro/);
    assert.equal(html.includes('Uno'), false, 'el ganador no puede aparecer antes de tiempo');
    assert.equal(html.includes('Dos'), false);
    assert.equal(html.includes('Tres'), false);
  });

  test('el administrador ve el provisional completo, marcado como tal', () => {
    const html = render(
      <Leaderboard rows={rows} revealOrder={order} state={revealing(2)} role="ADMIN" />,
    );
    assert.match(html, /Clasificacion provisional/);
    assert.match(html, /Uno/);
  });

  test('publicada: se ven los cinco y el podio lleva su clase', () => {
    const publicada: RevealState = { ...revealing(order.length), status: 'PUBLISHED', publishedAt: 'x' };
    const html = render(
      <Leaderboard rows={rows} revealOrder={order} state={publicada} role="PLAYER" />,
    );
    for (const row of rows) assert.match(html, new RegExp(row.displayName));
    assert.match(html, /podium--1/);
    assert.match(html, /podium--2/);
    assert.match(html, /podium--3/);
  });

  test('la posicion compartida se marca y se lee como compartida', () => {
    const empatados = buildRanking([
      player('a', 'Ana', 36, 200),
      player('b', 'Beto', 36, 200),
    ]);
    const html = render(<LeaderboardCard row={empatados[0]} isRevealed />);
    assert.match(html, /aria-label="Posicion 1 compartida"/);
    assert.match(html, /=1/);
  });

  test('la barra de progreso es decorativa y no se lee', () => {
    const html = render(<LeaderboardCard row={rows[0]} isRevealed />);
    assert.match(html, /leaderboard-card__bar[^>]*aria-hidden="true"/);
  });

  test('una tarjeta no revelada queda oculta al lector de pantalla', () => {
    const html = render(<LeaderboardCard row={rows[0]} isRevealed={false} />);
    assert.match(html, /data-revealed="false"/);
    assert.match(html, /aria-hidden="true"/);
  });

  test('la nota de desempate solo la ve el administrador', () => {
    const conNota = buildRanking([
      { ...player('a', 'Limpia', 36, 200), numericStrokes: 95, adjustedStrokes: 95, pickups: 0 },
      { ...player('b', 'ConRayas', 36, 200), numericStrokes: 88, adjustedStrokes: 109, pickups: 3 },
    ]);
    const fila = conNota.find((r) => r.tieBreakNote !== null);
    assert.ok(fila, 'deberia haber una fila con nota');
    assert.match(render(<LeaderboardCard row={fila} isRevealed showTieNote />), /doble bogey neto/);
    assert.equal(
      render(<LeaderboardCard row={fila} isRevealed />).includes('doble bogey neto'),
      false,
    );
  });

  test('con rayas se muestran los golpes escritos Y los ajustados', () => {
    const conRayas = buildRanking([
      { ...player('b', 'ConRayas', 36, 200), numericStrokes: 88, adjustedStrokes: 109, pickups: 3 },
    ]);
    const html = render(<LeaderboardCard row={conRayas[0]} isRevealed />);
    assert.match(html, /88/);
    assert.match(html, /aj\. 109/);
    assert.match(html, /aria-label="[^"]*88 golpes escritos[^"]*109 golpes ajustados"/);
  });

  test('sin rayas no se ensucia la fila con el ajustado', () => {
    const html = render(<LeaderboardCard row={rows[0]} isRevealed />);
    assert.equal(html.includes('aj.'), false);
    assert.match(html, /aria-label="90 golpes"/);
  });
});
