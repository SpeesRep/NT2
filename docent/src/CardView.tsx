import type { Group, TCard } from './api';

const LANG_NAMES: Record<string, string> = { fr: 'Frans', en: 'Engels' };

/** A card as the teacher sees it: the Dutch side, then each help language of the group. */
export function CardView({ card, group }: { card: TCard; group: Group }) {
  const dutch = (card.type === 'word' && card.article ? card.article + ' ' : '') + card.nl.replace(/[{}]/g, '');
  return (
    <div class="card-view">
      <div class="nl" lang="nl" dir="auto">
        <strong>{dutch}</strong>
        {card.answer && <span class="answer"> → {card.answer}</span>}
      </div>
      {card.example_nl && (
        <div class="example muted" lang="nl" dir="auto">
          {card.example_nl}
        </div>
      )}
      <dl class="tr">
        {group.languages.map((l) => (
          <div key={l}>
            <dt>{LANG_NAMES[l] ?? l}</dt>
            <dd lang={l} dir="auto">
              {card.translations[l]?.text || <span class="muted">—</span>}
              {card.translations[l]?.example && <span class="muted"> · {card.translations[l].example}</span>}
            </dd>
          </div>
        ))}
      </dl>
      <div class="meta muted small">{card.tags.join(', ')}</div>
    </div>
  );
}
