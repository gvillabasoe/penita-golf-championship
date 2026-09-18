/**
 * Iconografia propia.
 *
 * SVG inline y dibujado aqui, no una libreria y no assets descargados: la
 * seccion 8 prohibe copiar iconografia protegida, y una dependencia de iconos
 * para catorce glifos es peso que viaja por la cobertura del campo.
 *
 * Todos comparten trazo de 1,75 px, esquinas redondeadas y `currentColor`, asi
 * que heredan el color del contexto y funcionan igual sobre marfil que sobre
 * verde profundo.
 *
 * Son SIEMPRE decorativos: `aria-hidden`. El significado lo lleva el texto que
 * los acompana, nunca el icono. Un icono no se lee en voz alta.
 */

export interface IconProps {
  size?: number;
  className?: string;
}

function Svg({
  size = 20,
  className,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
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

/** Bandera de hoyo: la tarjeta del jugador. */
export function IconFlag(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 21V4" />
      <path d="M6 4.5c3.5-1.8 6.5 1.4 10-.4v7c-3.5 1.8-6.5-1.4-10 .4z" />
    </Svg>
  );
}

/** Trofeo: clasificacion. */
export function IconTrophy(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8 4h8v5a4 4 0 0 1-8 0z" />
      <path d="M8 5H5.5a2.5 2.5 0 0 0 2.5 4" />
      <path d="M16 5h2.5a2.5 2.5 0 0 1-2.5 4" />
      <path d="M12 13v4" />
      <path d="M9 20h6" />
      <path d="M10 20c0-1.5.7-2.5 2-3 1.3.5 2 1.5 2 3" />
    </Svg>
  );
}

/** Grupo de jugadores: ver partido. */
export function IconUsers(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.5a3 3 0 0 1 0 5.8" />
      <path d="M17.5 14.5A5.5 5.5 0 0 1 20.5 20" />
    </Svg>
  );
}

/** Reglaje: panel de administracion. */
export function IconSliders(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 6h14" />
      <path d="M5 12h14" />
      <path d="M5 18h14" />
      <circle cx="9" cy="6" r="2" />
      <circle cx="15" cy="12" r="2" />
      <circle cx="8" cy="18" r="2" />
    </Svg>
  );
}

/** Papelera: borrar el resultado de un hoyo. */
export function IconTrash(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </Svg>
  );
}

/** Aviso. */
export function IconAlert(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 4l9 16H3z" />
      <path d="M12 10v4" />
      <path d="M12 17.2v.1" />
    </Svg>
  );
}

/** Correcto. */
export function IconCheck(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.5 12.5l5 5 10-11" />
    </Svg>
  );
}

/** Sin conexion. */
export function IconOffline(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 4l18 16" />
      <path d="M5.5 10.5A7.5 7.5 0 0 1 9 8.4" />
      <path d="M14.8 8.6a7.5 7.5 0 0 1 3.7 1.9" />
      <path d="M8.3 14a4.3 4.3 0 0 1 2-1.1" />
      <path d="M12 18.2v.1" />
    </Svg>
  );
}

/** Sincronizando. */
export function IconSync(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 12a8 8 0 0 1-13.6 5.7" />
      <path d="M4 12a8 8 0 0 1 13.6-5.7" />
      <path d="M17.5 3.5v3.2h-3.2" />
      <path d="M6.5 20.5v-3.2h3.2" />
    </Svg>
  );
}

/** Candado: tarjeta bloqueada. */
export function IconLock(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </Svg>
  );
}

/** Flecha atras. */
export function IconBack(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14.5 5.5L8 12l6.5 6.5" />
    </Svg>
  );
}

/** Flecha adelante. */
export function IconForward(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9.5 5.5L16 12l-6.5 6.5" />
    </Svg>
  );
}

/** Salir de la sesion. */
export function IconExit(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14 5.5H6.5v13H14" />
      <path d="M12 12h8" />
      <path d="M17 9l3 3-3 3" />
    </Svg>
  );
}

/** Tarjeta / scorecard completa. */
export function IconGrid(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path d="M3.5 9.5h17" />
      <path d="M3.5 14.5h17" />
      <path d="M9 9.5v10" />
    </Svg>
  );
}

/** Hándicap limitado. */
export function IconCap(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 8h16" />
      <path d="M7 12l5 5 5-5" />
    </Svg>
  );
}
