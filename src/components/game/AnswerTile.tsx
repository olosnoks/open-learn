import { cn } from '../../lib/cn';

/**
 * Kahoot-style answer palette. Order matters: choice i gets ANSWER_COLORS[i].
 * Every colour has a distinct shape, so colour is never the only signal.
 */
export const ANSWER_COLORS = ['red', 'blue', 'yellow', 'green', 'purple', 'orange'] as const;
export type AnswerTileColor = (typeof ANSWER_COLORS)[number];
export const answerColor = (index: number): AnswerTileColor => ANSWER_COLORS[index % ANSWER_COLORS.length];

const SHAPE_NAME: Record<AnswerTileColor, string> = {
  red: 'triangle', blue: 'diamond', yellow: 'circle', green: 'square', purple: 'pentagon', orange: 'hexagon',
};
export const shapeName = (color: AnswerTileColor) => SHAPE_NAME[color];

export const TILE_BG: Record<AnswerTileColor, string> = {
  red: 'bg-answer-red text-white',
  blue: 'bg-answer-blue text-white',
  yellow: 'bg-answer-yellow text-ink',
  green: 'bg-answer-green text-white',
  purple: 'bg-answer-purple text-white',
  orange: 'bg-answer-orange text-white',
};

/** Inline SVG shape for an answer colour. Inherits `currentColor`. */
export function AnswerShape({ color, className }: { color: AnswerTileColor; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={cn('fill-current', className)}>
      {color === 'red' && <path d="M12 2.5 22.5 20.5H1.5Z" />}
      {color === 'blue' && <path d="M12 1.5 22.5 12 12 22.5 1.5 12Z" />}
      {color === 'yellow' && <circle cx="12" cy="12" r="10.5" />}
      {color === 'green' && <rect x="2" y="2" width="20" height="20" rx="2.5" />}
      {color === 'purple' && <path d="M12 1.5 22.3 9 18.4 21.5H5.6L1.7 9Z" />}
      {color === 'orange' && <path d="M7 2.5h10l5 9.5-5 9.5H7L2 12Z" />}
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn('h-5 w-5', className)} fill="none"
      stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12.5 9.5 18 20 6.5" />
    </svg>
  );
}
function CrossIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn('h-5 w-5', className)} fill="none"
      stroke="currentColor" strokeWidth="3.5" strokeLinecap="round">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

/** Reveal state: `correct` glows, `wrong` (player's own miss) shows a cross, `dim` fades the rest. */
export type TileState = 'idle' | 'correct' | 'wrong' | 'dim';

export function AnswerTile({
  color, label, index, disabled, selected, onClick,
  hideLabel = false, size = 'md', state = 'idle', readOnly = false, badge, className,
}: {
  color: AnswerTileColor; label: string; index: number;
  disabled?: boolean; selected?: boolean; onClick?: () => void;
  /** Shapes-only mode (showAnswersOnDevices = false): the label is not rendered or announced. */
  hideLabel?: boolean;
  /** `lg` is the projector size. */
  size?: 'md' | 'lg';
  state?: TileState;
  /** Display-only tile (host screen). Renders a div instead of a button. */
  readOnly?: boolean;
  /** Trailing content, e.g. an answer count during reveal. */
  badge?: React.ReactNode;
  className?: string;
}) {
  const lg = size === 'lg';
  const shapeOnly = hideLabel;
  const name = `Answer ${index + 1}: ${shapeOnly ? `${color} ${SHAPE_NAME[color]}` : label}`;

  const classes = cn(
    'relative flex w-full items-center gap-4 rounded-tile text-left font-bold shadow-tile',
    'transition-[transform,box-shadow,opacity,filter] duration-150',
    lg ? 'min-h-[112px] px-6 py-4 text-2xl lg:min-h-[136px] lg:text-3xl' : 'min-h-[88px] px-4 py-3 text-lg',
    shapeOnly && (lg ? 'min-h-[140px] justify-center' : 'min-h-[120px] justify-center'),
    TILE_BG[color],
    !readOnly && !disabled && 'hover:brightness-110 active:translate-y-[3px] active:shadow-tile-pressed',
    !readOnly && 'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-cream',
    (selected || state === 'correct') && 'shadow-tile-selected',
    state === 'dim' && 'opacity-40 saturate-50',
    state === 'wrong' && 'saturate-50',
    disabled && !selected && state === 'idle' && 'opacity-60',
    className,
  );

  const inner = (
    <>
      <span className={cn(
        'grid shrink-0 place-items-center rounded-xl bg-black/15',
        shapeOnly ? (lg ? 'h-24 w-24' : 'h-20 w-20') : lg ? 'h-16 w-16' : 'h-12 w-12',
      )}>
        <AnswerShape color={color} className={shapeOnly ? (lg ? 'h-14 w-14' : 'h-12 w-12') : lg ? 'h-9 w-9' : 'h-7 w-7'} />
      </span>
      {!shapeOnly && <span className="min-w-0 flex-1 leading-tight [overflow-wrap:anywhere]">{label}</span>}
      {(badge !== undefined || selected || state === 'correct' || state === 'wrong') && (
        <span className={cn('flex shrink-0 items-center gap-2', shapeOnly && 'absolute right-3 top-3')}>
          {badge}
          {(state === 'correct' || (selected && state !== 'wrong')) && (
            <span className={cn('grid place-items-center rounded-full bg-white text-ink', lg ? 'h-10 w-10' : 'h-8 w-8')}>
              <CheckIcon className={lg ? 'h-6 w-6' : undefined} />
              <span className="sr-only">{state === 'correct' ? 'correct' : 'selected'}</span>
            </span>
          )}
          {state === 'wrong' && (
            <span className={cn('grid place-items-center rounded-full bg-white text-ink', lg ? 'h-10 w-10' : 'h-8 w-8')}>
              <CrossIcon className={lg ? 'h-6 w-6' : undefined} />
              <span className="sr-only">incorrect</span>
            </span>
          )}
        </span>
      )}
    </>
  );

  if (readOnly) {
    return <div className={classes} aria-label={name} role="group">{inner}</div>;
  }
  return (
    <button type="button" disabled={disabled} onClick={onClick} aria-label={name} aria-pressed={selected}
      className={classes}>
      {inner}
    </button>
  );
}
