"use client"
import { TERRAINS } from '../data/terrains.js';
import { STAMP_REGISTRY } from '../data/stamps.js';
import { CARDS_BY_ID, KIND_LABELS } from '../data/cards.js';
import { RULES } from '../engine/rules.js';
import { PATH_KINDS } from '../engine/features.js';
import { PacingBanner } from './PacingBanner.jsx';

const TARGET_TEXT = {
  frontier: 'a new panel at the edge of the map',
  drawn: 'any drawn panel',
  nearVoid: 'a panel near the void',
  hasSettlement: 'a panel with a settlement',
};

const CHARGE_NAMES = {
  ...Object.fromEntries(Object.entries(PATH_KINDS).map(([k, v]) => [k, v.name])),
  label: 'Label', upgrade: 'Upgrade', voidSeed: 'Void',
};

function CardFace({ card }) {
  const requires = (card.requires ?? []).map(spec => (typeof spec === 'string' ? { rule: spec } : spec));
  return (
    <div className="rounded-lg border-2 overflow-hidden shadow-lg shadow-black/30" style={{ borderColor: card.accent }}>
      <div className="px-3 py-1.5 flex justify-between items-center text-slate-900" style={{ backgroundColor: card.accent }}>
        <span className="text-xs font-bold uppercase tracking-widest">{card.name}</span>
        <span className="text-[10px] font-semibold uppercase opacity-70">{KIND_LABELS[card.kind]}</span>
      </div>
      <div className="p-3 bg-slate-800 space-y-3 text-xs">
        <p className="text-slate-400 italic leading-relaxed">{card.flavor}</p>
        {card.target && (
          <p className="text-slate-400"><span className="text-slate-500">Play on </span>{TARGET_TEXT[card.target.where]}</p>
        )}
        {card.palette?.length > 0 && (
          <div className="flex flex-wrap gap-x-2.5 gap-y-1">
            {card.palette.map(t => (
              <span key={t} className="flex items-center gap-1 text-slate-300">
                <span className="w-3 h-3 rounded-sm border border-black/40" style={{ backgroundColor: TERRAINS[t].color }} />
                {TERRAINS[t].name}
              </span>
            ))}
            {card.ink && <span className="text-slate-500">· {card.ink} ink</span>}
          </div>
        )}
        {(card.charges || card.stamps) && (
          <div className="flex flex-wrap gap-1">
            {Object.entries(card.charges ?? {}).map(([k, n]) => (
              <span key={k} className="px-1.5 py-0.5 rounded border border-slate-600 bg-slate-900 text-slate-300">{CHARGE_NAMES[k]} ×{n}</span>
            ))}
            {Object.entries(card.stamps ?? {}).map(([k, n]) => (
              <span key={k} className="px-1.5 py-0.5 rounded border border-slate-600 bg-slate-900 text-slate-300">{STAMP_REGISTRY[k]?.name} ×{n}</span>
            ))}
          </div>
        )}
        {requires.length > 0 && (
          <ul className="space-y-0.5 text-slate-400">
            {requires.map((cfg, i) => <li key={i}>• {RULES[cfg.rule].label(cfg)}</li>)}
          </ul>
        )}
      </div>
    </div>
  );
}

export function CardPanel({ state, card, offers, pacing, onDraw, onDiscard, onResume, voidActive }) {
  const { drawPile, discard } = state.deck;
  const claim = state.active?.claim;

  return (
    <div className="flex flex-col gap-4 w-full">
      {!card ? (
        <>
          <div className="relative flex items-center justify-center" style={{ height: 120 }}>
            {[0, 1, 2].map(i => (
              <div key={i} className="absolute rounded-lg border border-slate-600 bg-gradient-to-br from-slate-700 to-slate-800"
                style={{ width: 150, height: 104, transform: `rotate(${(i - 1) * 5}deg) translateY(${(i - 1) * -3}px)`, zIndex: i }} />
            ))}
            <span className="relative z-10 text-[11px] uppercase tracking-widest text-slate-400">{drawPile.length} cards</span>
          </div>
          <button type="button" onClick={onDraw} disabled={!pacing.ok}
            className="w-full py-3 rounded-lg bg-slate-200 hover:bg-white text-slate-900 font-semibold text-sm tracking-wide transition-colors disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed">
            Draw a card
          </button>
          <PacingBanner pacing={pacing} />
        </>
      ) : (
        <>
          <CardFace card={card} />
          {offers.length > 0 ? (
            <p className="text-xs text-slate-400 text-center">
              {claim ? 'You have a tile in progress.' : `Pick one of the ${offers.length} highlighted tiles.`}
            </p>
          ) : (
            <p className="text-xs text-amber-300 text-center">No tile can take this card right now — discard it.</p>
          )}
          {claim && (
            <button type="button" onClick={onResume}
              className="w-full py-2 text-sm rounded-lg bg-emerald-400 text-slate-900 font-semibold hover:bg-emerald-300">
              Resume editing
            </button>
          )}
          <button type="button" onClick={onDiscard}
            className="w-full py-2 text-xs rounded border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500 transition-colors">
            Discard card
          </button>
        </>
      )}

      <div className="text-[11px] text-slate-500 flex justify-between">
        <span>Turn {state.turn}</span>
        <span>{drawPile.length} in deck · {discard.length} discarded</span>
      </div>
      {voidActive && (
        <p className="text-[11px] text-red-300/80">
          The void stirs in {state.voidClock} turn{state.voidClock === 1 ? '' : 's'}. Walls hold it back.
        </p>
      )}

      {state.history.length > 0 && (
        <div>
          <p className="text-[11px] text-slate-600 uppercase tracking-widest mb-1.5">Recently played</p>
          <div className="space-y-1">
            {[...state.history].reverse().slice(0, 5).map((id, i) => {
              const c = CARDS_BY_ID[id];
              return (
                <div key={i} className="text-xs px-2 py-1 rounded border-l-2 bg-slate-900 text-slate-500" style={{ borderLeftColor: c?.accent }}>
                  {c?.name ?? id}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
