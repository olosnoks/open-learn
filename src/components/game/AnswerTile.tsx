import { cn } from '../../lib/cn';

const TILE_STYLES = {
  red:    'bg-answer-red text-cream',
  blue:   'bg-answer-blue text-cream',
  yellow: 'bg-answer-yellow text-ink',
  green:  'bg-answer-green text-cream',
} as const;

export type AnswerTileColor = keyof typeof TILE_STYLES;

export function AnswerTile({
  color, label, index, disabled, selected, onClick,
}: {
  color: AnswerTileColor; label: string; index: number;
  disabled?: boolean; selected?: boolean; onClick?: () => void;
}) {
  return (
    <button
      type="button" disabled={disabled} onClick={onClick}
      aria-label={`Answer ${index + 1}: ${label}`} aria-pressed={selected}
      className={cn(
        'flex min-h-[96px] w-full items-center gap-4 rounded-tile p-4 text-left text-lg font-bold shadow-tile transition',
        'active:translate-y-[2px] active:shadow-tile-pressed',
        'focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-ink',
        TILE_STYLES[color],
        selected && 'ring-4 ring-brand-700 ring-offset-2 ring-offset-cream',
        disabled && !selected && 'opacity-60'
      )}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-black/20 text-sm">{index + 1}</span>
      <span className="min-w-0 [overflow-wrap:anywhere]">{label}</span>
    </button>
  );
}
