"use client"
import { REGION_CONFIG } from './config.js';
import { STAMP_REGISTRY } from './stamps.js';

export function CardPanel({ currentCard, history, onDraw, onCancel, hasCard }) {
  return (
    <div className="flex flex-col gap-4 w-60 flex-shrink-0">

      {!hasCard ? (
        <>
          {/* Deck stack */}
          <div className="relative flex items-center justify-center" style={{ height: 110 }}>
            {[0, 1, 2].map(i => (
              <div
                key={i}
                className="absolute rounded-lg border border-slate-600 bg-slate-800"
                style={{
                  width: 168, height: 108,
                  transform: `rotate(${(i-1)*5}deg) translateY(${(i-1)*-3}px)`,
                  zIndex: i,
                }}
              />
            ))}
          </div>
          <button
            onClick={onDraw}
            className="w-full py-3 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100 font-semibold text-sm tracking-wide transition-colors border border-slate-600"
          >
            Draw a Card
          </button>
        </>
      ) : (
        <>
          {/* Active card */}
          <div className="rounded-lg border-2 overflow-hidden" style={{ borderColor: currentCard.accent }}>
            <div
              className="px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-slate-900"
              style={{ backgroundColor: currentCard.accent }}
            >
              {currentCard.name}
            </div>
            <div className="p-4 bg-slate-800 space-y-3">
              <p className="text-xs text-slate-400 italic leading-relaxed">{currentCard.flavorText}</p>

              {/* Allowed regions / stamps / void effect */}
              {currentCard.allowedTypes.length > 0 ? (
                <div>
                  <p className="text-xs text-slate-500 mb-1.5">Available regions</p>
                  <div className="flex gap-2 flex-wrap">
                    {currentCard.allowedTypes.map(type => (
                      <div key={type} className="flex items-center gap-1.5 text-xs text-slate-300">
                        <div
                          className="w-3 h-3 rounded-sm border border-slate-600"
                          style={{ backgroundColor: REGION_CONFIG[type]?.color }}
                        />
                        {REGION_CONFIG[type]?.name}
                      </div>
                    ))}
                  </div>
                </div>
              ) : currentCard.allowedMarkers?.length > 0 ? (
                <div>
                  <p className="text-xs text-slate-500 mb-1.5">Settlement stamps — play on a drawn tile</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {currentCard.allowedMarkers.map(id => (
                      <span key={id}
                        className="text-xs px-1.5 py-0.5 rounded border border-slate-600 text-slate-300 bg-slate-900"
                      >
                        {STAMP_REGISTRY[id]?.name ?? id}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-amber-400">Clears the selected tile</p>
              )}
            </div>
          </div>

          <p className="text-xs text-slate-500 text-center">
            Click a tile on the map to edit it
          </p>

          <button
            onClick={onCancel}
            className="w-full py-2 text-xs rounded border border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-500 transition-colors"
          >
            Discard Card
          </button>
        </>
      )}

      {/* History */}
      {history.length > 0 && (
        <div className="mt-1">
          <p className="text-xs text-slate-600 uppercase tracking-widest mb-2">Last played</p>
          <div className="space-y-1">
            {[...history].reverse().slice(0, 5).map((card, i) => (
              <div
                key={i}
                className="text-xs px-2 py-1 rounded border-l-2 bg-slate-900 text-slate-500"
                style={{ borderLeftColor: card.accent }}
              >
                {card.name}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
