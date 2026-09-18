/**
 * Primitivas del sistema visual.
 *
 * Todo lo que se repite en mas de una pantalla vive aqui, y nada de esto decide
 * nada deportivo: son superficies, jerarquia y estados. La regla es que una
 * pantalla no vuelva a escribir un boton verde a mano, porque en cuanto hay dos
 * botones verdes escritos a mano acaban teniendo alturas distintas.
 *
 * Son componentes de servidor: sin `'use client'`, sin estado y sin efectos. Los
 * que necesitan interaccion viven en `components/client/`.
 */

import type { ReactNode } from 'react';

import { IconAlert, IconCheck, IconOffline } from './icons';

/* ===========================================================================
   Botones
   ======================================================================== */

export type ButtonTone = 'primary' | 'secondary' | 'ghost' | 'premium' | 'danger';

const TONE_CLASS: Record<ButtonTone, string> = {
  primary: 'button--primary',
  secondary: 'button--secondary',
  ghost: 'button--ghost',
  premium: 'button--premium',
  danger: 'button--danger',
};

export interface ButtonLinkProps {
  href: string;
  tone?: ButtonTone;
  size?: 'sm' | 'md' | 'lg';
  block?: boolean;
  children: ReactNode;
  'aria-label'?: string;
}

/**
 * Enlace con aspecto de boton.
 *
 * Es un `<a>` de verdad y no un `<button>` con un `router.push` dentro: una
 * navegacion tiene que poder abrirse en otra pestana, copiarse y funcionar
 * aunque el JavaScript no haya cargado todavia, que en el campo pasa.
 */
export function ButtonLink({
  href,
  tone = 'primary',
  size = 'md',
  block = false,
  children,
  ...rest
}: ButtonLinkProps) {
  const classes = [
    'button',
    TONE_CLASS[tone],
    size === 'lg' ? 'button--lg' : '',
    size === 'sm' ? 'button--sm' : '',
    block ? 'button--block' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <a className={classes} href={href} {...rest}>
      {children}
    </a>
  );
}

/** Clases de boton, para los componentes de cliente que necesitan `onClick`. */
export function buttonClass(
  tone: ButtonTone = 'primary',
  options: { size?: 'sm' | 'md' | 'lg'; block?: boolean } = {},
): string {
  return [
    'button',
    TONE_CLASS[tone],
    options.size === 'lg' ? 'button--lg' : '',
    options.size === 'sm' ? 'button--sm' : '',
    options.block ? 'button--block' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

/* ===========================================================================
   Insignias y chips
   ======================================================================== */

export type BadgeTone = 'neutral' | 'green' | 'gold' | 'warning' | 'danger' | 'onGreen';

export interface StatusBadgeProps {
  tone?: BadgeTone;
  icon?: ReactNode;
  children: ReactNode;
}

export function StatusBadge({ tone = 'neutral', icon, children }: StatusBadgeProps) {
  return (
    <span className={`badge badge--${tone}`}>
      {icon}
      {children}
    </span>
  );
}

/**
 * Estado de la tarjeta, traducido.
 *
 * Los estados viajan en ingles por la base de datos y no se muestran asi a un
 * jugador. `NOT_STARTED` no significa nada para nadie; "Sin comenzar", si.
 */
const CARD_STATUS_LABEL: Record<string, { label: string; tone: BadgeTone }> = {
  NOT_STARTED: { label: 'Sin comenzar', tone: 'neutral' },
  IN_PLAY: { label: 'En juego', tone: 'green' },
  FINISHED: { label: 'Finalizada', tone: 'gold' },
  REVIEWED: { label: 'Revisada', tone: 'gold' },
  LOCKED: { label: 'Bloqueada', tone: 'warning' },
};

export function CardStatusBadge({ status }: { status: string }) {
  const entry = CARD_STATUS_LABEL[status] ?? { label: status, tone: 'neutral' as BadgeTone };
  return <StatusBadge tone={entry.tone}>{entry.label}</StatusBadge>;
}

export interface DataChipProps {
  label: string;
  value: ReactNode;
  onGreen?: boolean;
  /** Etiqueta accesible completa, cuando el valor abreviado no se explica solo. */
  ariaLabel?: string;
}

/** Etiqueta arriba, cifra abajo. El bloque mas repetido de la aplicacion. */
export function DataChip({ label, value, onGreen = false, ariaLabel }: DataChipProps) {
  return (
    <span
      className={`chip${onGreen ? ' chip--onGreen' : ''}`}
      aria-label={ariaLabel}
      title={ariaLabel}
    >
      <span className="chip__label">{label}</span>
      <span className="chip__value data">{value}</span>
    </span>
  );
}

export interface StatTileProps {
  label: string;
  value: ReactNode;
  accent?: boolean;
  ariaLabel?: string;
}

export function StatTile({ label, value, accent = false, ariaLabel }: StatTileProps) {
  return (
    <div className={`stat-tile${accent ? ' stat-tile--accent' : ''}`} aria-label={ariaLabel}>
      <span className="stat-tile__value data">{value}</span>
      <span className="stat-tile__label">{label}</span>
    </div>
  );
}

/* ===========================================================================
   Barra de progreso
   ======================================================================== */

export interface ProgressBarProps {
  /** 0..100 */
  percent: number;
  color?: string;
  /** Sin etiqueta la barra es decorativa y se oculta al lector de pantalla. */
  ariaLabel?: string;
}

export function ProgressBar({ percent, color, ariaLabel }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));

  if (ariaLabel === undefined) {
    return (
      <span className="progress" aria-hidden="true">
        <span
          className="progress__fill"
          style={{ width: `${clamped}%`, ...(color ? { backgroundColor: color } : {}) }}
        />
      </span>
    );
  }

  return (
    <span
      className="progress"
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel}
    >
      <span
        className="progress__fill"
        style={{ width: `${clamped}%`, ...(color ? { backgroundColor: color } : {}) }}
      />
    </span>
  );
}

/* ===========================================================================
   Avisos y estados
   ======================================================================== */

export type AlertTone = 'warning' | 'danger' | 'success' | 'info';

export interface AlertProps {
  tone?: AlertTone;
  /** `alert` interrumpe al lector de pantalla; `status` no. */
  role?: 'alert' | 'status' | 'note';
  children: ReactNode;
}

/**
 * Aviso en linea.
 *
 * Siempre con icono: la seccion 28 prohibe que el color sea el unico portador
 * de informacion, y un recuadro amarillo sin icono es exactamente eso.
 */
export function Alert({ tone = 'warning', role = 'status', children }: AlertProps) {
  const icon =
    tone === 'success' ? (
      <IconCheck size={18} className="alert__icon" />
    ) : (
      <IconAlert size={18} className="alert__icon" />
    );

  return (
    <p className={`alert${tone === 'warning' ? '' : ` alert--${tone}`}`} role={role}>
      {icon}
      <span>{children}</span>
    </p>
  );
}

export interface StateBlockProps {
  title: string;
  children: ReactNode;
  icon?: ReactNode;
  /** Accion disponible. Si no existe, NO se inventa una. */
  action?: ReactNode;
  variant?: 'empty' | 'error';
}

/**
 * Estado vacio o de error.
 *
 * Titulo, explicacion y como maximo una accion. La regla que sostiene este
 * componente es la de la seccion 26: no se inventan acciones que no existen. Un
 * "Reintentar" que no reintenta nada es peor que no poner nada.
 */
export function StateBlock({
  title,
  children,
  icon,
  action,
  variant = 'empty',
}: StateBlockProps) {
  return (
    <div
      className={`state-block${variant === 'error' ? ' state-block--error' : ''}`}
      role={variant === 'error' ? 'alert' : 'status'}
    >
      {icon ? <span className="state-block__icon">{icon}</span> : null}
      <p className="state-block__title">{title}</p>
      <div className="state-block__body">{children}</div>
      {action}
    </div>
  );
}

/**
 * Banda de sin conexion.
 *
 * Visible pero pequena: durante la vuelta no puede robar la pantalla al hoyo que
 * el jugador esta apuntando.
 */
export function OfflineBanner({ pendingCount = 0 }: { pendingCount?: number }) {
  return (
    <p className="offline-banner" role="status">
      <IconOffline size={18} />
      <span>
        Sin conexion. Apunta igual: se envia solo al recuperar cobertura
        {pendingCount > 0 ? ` (${pendingCount} por enviar)` : ''}.
      </span>
    </p>
  );
}

/* ===========================================================================
   Formularios
   ======================================================================== */

export interface FormFieldProps {
  id: string;
  label: string;
  help?: ReactNode;
  error?: string | null;
  numeric?: boolean;
  children: ReactNode;
}

/**
 * Campo de formulario: etiqueta visible, texto de ayuda y error junto al campo.
 *
 * La etiqueta es visible siempre, nunca un placeholder: un placeholder
 * desaparece al escribir y con el desaparece la unica pista de que se estaba
 * rellenando.
 */
export function FormField({
  id,
  label,
  help,
  error = null,
  numeric = false,
  children,
}: FormFieldProps) {
  const classes = [
    'field',
    numeric ? 'field--numeric' : '',
    error ? 'field--invalid' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes}>
      <label htmlFor={id}>{label}</label>
      {children}
      {help ? (
        <p className="field__help" id={`${id}-help`}>
          {help}
        </p>
      ) : null}
      {error ? (
        <p className="field__error" id={`${id}-error`} role="alert">
          <IconAlert size={16} />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

/* ===========================================================================
   Secciones
   ======================================================================== */

export interface SectionProps {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  /** Etiqueta accesible cuando el titulo visible no basta. */
  ariaLabel?: string;
}

/** Bloque del panel de administracion: cabecera, descripcion y contenido. */
export function AdminSection({
  title,
  description,
  action,
  children,
  ariaLabel,
}: SectionProps) {
  return (
    <section className="admin-section" aria-label={ariaLabel ?? title}>
      <header className="admin-section__header">
        <div className="button-row" style={{ justifyContent: 'space-between' }}>
          <h2>{title}</h2>
          {action}
        </div>
        {description ? <p className="muted">{description}</p> : null}
      </header>
      {children}
    </section>
  );
}
