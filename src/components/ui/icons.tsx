/**
 * Iconografia propia del sistema "Escudo".
 *
 * Dibujada aqui, en SVG inline: ni libreria ni assets descargados. Catorce
 * glifos no justifican una dependencia que viaja por la cobertura del campo.
 *
 * ---------------------------------------------------------------------------
 * Gramatica
 * ---------------------------------------------------------------------------
 * - Rejilla de 24, trazo de 1,6 px, terminaciones y uniones redondeadas: el
 *   mismo trazo fino del escudo.
 * - `currentColor` en todo: heredan el color del contexto.
 * - Cada icono puede llevar una capa `.icon-fill` (relleno al 0 %). La hoja de
 *   estilos la enciende en el estado activo —la pestaña en la que estas—, asi
 *   que el icono activo se ve "lleno" sin cambiar de dibujo.
 * - Glifos del golf donde el concepto es del golf: bandera en el green para la
 *   tarjeta, marcador de tres alturas para la clasificacion.
 *
 * Son SIEMPRE decorativos (`aria-hidden`). El significado lo lleva el texto
 * que los acompaña.
 */

export interface IconProps {
  size?: number;
  className?: string;
}

function Svg({ size = 20, className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  );
}

/** Capa de relleno: invisible salvo en el estado activo. */
function Fill({ d }: { d: string }) {
  return <path className="icon-fill" d={d} fill="currentColor" fillOpacity={0} stroke="none" />;
}

/** Bandera clavada en el green: la tarjeta del jugador. */
export function IconFlag(props: IconProps) {
  return (
    <Svg {...props}>
      <Fill d="M8 3.5 17.5 7 8 10.5Z" />
      <path d="M8 20.5V3.5l9.5 3.5L8 10.5" />
      <ellipse cx="8" cy="20.5" rx="5" ry="1.4" />
    </Svg>
  );
}

/** Marcador de tres alturas, el podio: clasificacion. */
export function IconTrophy(props: IconProps) {
  return (
    <Svg {...props}>
      <Fill d="M9 7.5h6v13H9Z" />
      <path d="M9 20.5v-13h6v13" />
      <path d="M3.5 20.5v-8H9" />
      <path d="M15 11h5.5v9.5" />
      <path d="M2.5 20.5h19" />
      <path d="m12 3 .8 1.6 1.7.2-1.25 1.2.3 1.7L12 6.9l-1.55.8.3-1.7L9.5 4.8l1.7-.2Z" />
    </Svg>
  );
}

/** Partido: tres jugadores, uno delante. */
export function IconUsers(props: IconProps) {
  return (
    <Svg {...props}>
      <Fill d="M12 4.5a3 3 0 1 1 0 6 3 3 0 0 1 0-6ZM6.5 19.5a5.5 5.5 0 0 1 11 0Z" />
      <circle cx="12" cy="7.5" r="3" />
      <path d="M6.5 19.5a5.5 5.5 0 0 1 11 0" />
      <path d="M5.2 6.6a2.3 2.3 0 0 0 0 4.4" />
      <path d="M18.8 6.6a2.3 2.3 0 0 1 0 4.4" />
      <path d="M2.5 17.5a4 4 0 0 1 2.4-3.6" />
      <path d="M21.5 17.5a4 4 0 0 0-2.4-3.6" />
    </Svg>
  );
}

/** Ajustes del torneo: tres reguladores. */
export function IconSliders(props: IconProps) {
  return (
    <Svg {...props}>
      <Fill d="M8 4.2a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM16 10a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM10 15.8a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z" />
      <path d="M3.5 6.2H6m4 0h10.5" />
      <path d="M3.5 12H14m4 0h2.5" />
      <path d="M3.5 17.8H8m4 0h8.5" />
      <circle cx="8" cy="6.2" r="2" />
      <circle cx="16" cy="12" r="2" />
      <circle cx="10" cy="17.8" r="2" />
    </Svg>
  );
}

/** Borrar. */
export function IconTrash(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 6.5h16" />
      <path d="M9 6.5V4.8c0-.7.5-1.3 1.2-1.3h3.6c.7 0 1.2.6 1.2 1.3v1.7" />
      <path d="M6 6.5l.9 12.6c.1 1 .9 1.9 2 1.9h6.2c1.1 0 1.9-.9 2-1.9L18 6.5" />
      <path d="M10 10.5v6.5M14 10.5v6.5" />
    </Svg>
  );
}

/** Aviso. */
export function IconAlert(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M10.3 4.1 2.9 17.2c-.8 1.3.2 2.8 1.7 2.8h14.8c1.5 0 2.5-1.5 1.7-2.8L13.7 4.1c-.8-1.3-2.6-1.3-3.4 0Z" />
      <path d="M12 9.5v4" />
      <path d="M12 16.8v.1" />
    </Svg>
  );
}

/** Correcto. */
export function IconCheck(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m4.5 12.5 4.8 4.8L19.5 7" />
    </Svg>
  );
}

/** Sin conexion. */
export function IconOffline(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m3 3 18 18" />
      <path d="M8.5 16.4a5 5 0 0 1 4.9-1.3" />
      <path d="M5.2 13a9.6 9.6 0 0 1 3.6-2.2" />
      <path d="M2 9.6a14 14 0 0 1 4-2.6" />
      <path d="M11.3 6.5A14 14 0 0 1 22 9.6" />
      <path d="M15.6 10.6a9.6 9.6 0 0 1 3.2 2.4" />
      <path d="M12 19.6v.1" />
    </Svg>
  );
}

/** Sincronizando. */
export function IconSync(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 11a8 8 0 0 0-14.3-4.5L4 8.5" />
      <path d="M4 4v4.5h4.5" />
      <path d="M4 13a8 8 0 0 0 14.3 4.5L20 15.5" />
      <path d="M20 20v-4.5h-4.5" />
    </Svg>
  );
}

/** Tarjeta bloqueada. */
export function IconLock(props: IconProps) {
  return (
    <Svg {...props}>
      <Fill d="M6.5 10.5h11a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19v-7a1.5 1.5 0 0 1 1.5-1.5Z" />
      <rect x="5" y="10.5" width="14" height="10" rx="1.8" />
      <path d="M8.5 10.5V7.8a3.5 3.5 0 0 1 7 0v2.7" />
      <path d="M12 14.5v2" />
    </Svg>
  );
}

/** Atras. */
export function IconBack(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m14.5 5.5-6.5 6.5 6.5 6.5" />
    </Svg>
  );
}

/** Adelante. */
export function IconForward(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />
    </Svg>
  );
}

/** Cerrar sesion. */
export function IconExit(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14 4.5H7a1.5 1.5 0 0 0-1.5 1.5v12A1.5 1.5 0 0 0 7 19.5h7" />
      <path d="M11 12h9.5" />
      <path d="m17 8.5 3.5 3.5-3.5 3.5" />
    </Svg>
  );
}

/** Tarjeta completa: la cartulina con su rejilla. */
export function IconGrid(props: IconProps) {
  return (
    <Svg {...props}>
      <Fill d="M5 4.5h14A1.5 1.5 0 0 1 20.5 6v3.5h-17V6A1.5 1.5 0 0 1 5 4.5Z" />
      <rect x="3.5" y="4.5" width="17" height="15" rx="1.8" />
      <path d="M3.5 9.5h17M3.5 14.5h17" />
      <path d="M9.5 9.5v10M15 9.5v10" />
    </Svg>
  );
}

/** Hándicap limitado: tope sobre una flecha. */
export function IconCap(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 5h16" />
      <path d="M12 20V9" />
      <path d="m7.5 13.5 4.5-4.5 4.5 4.5" />
    </Svg>
  );
}
