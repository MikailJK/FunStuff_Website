"use client"
import { useReducer, useCallback, useState, useEffect } from 'react';
import { useGrid } from './useGrid.js';
import { CARD_DECK } from './cards.js';
import { REGION_CONFIG, GRID_COLS } from './config.js';
import { MapCanvas } from './MapCanvas.jsx';
import { TileEditor } from './TileEditor.jsx';
import { CardPanel } from './CardPanel.jsx';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function typesFromConstraints(constraints) {
  const types = new Set();
  for (const edge of ['left', 'right', 'top', 'bottom']) {
    for (const seg of constraints?.[edge] ?? []) {
      if (seg.type && seg.type !== 'empty') types.add(seg.type);
    }
  }
  return [...types];
}

// ─── Card deck state ──────────────────────────────────────────────────────────

function weightedDraw(deck) {
  const total = deck.reduce((s, c) => s + c.weight, 0);
  let r = Math.random() * total;
  for (const card of deck) { r -= card.weight; if (r <= 0) return card; }
  return deck[deck.length - 1];
}

const deckInit = { currentCard: null, history: [] };
function deckReducer(state, action) {
  switch (action.type) {
    case 'DRAW': {
      if (state.currentCard) return state;
      return { ...state, currentCard: weightedDraw(CARD_DECK) };
    }
    case 'DISCARD': {
      if (!state.currentCard) return state;
      return { currentCard: null, history: [...state.history.slice(-9), state.currentCard] };
    }
    case 'RESET':
      return deckInit;
    default: return state;
  }
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function JerryMappingApp() {
  const { grid, updateTile, resetGrid, getConstraints, getCandidateTiles } = useGrid();
  const [deckState, deckDispatch] = useReducer(deckReducer, deckInit);
  const [editingTile, setEditingTile] = useState(null);
  const [candidateTiles, setCandidateTiles] = useState([]);

  const { currentCard, history } = deckState;

  const drawCard    = useCallback(() => deckDispatch({ type: 'DRAW' }),    []);
  const discardCard = useCallback(() => deckDispatch({ type: 'DISCARD' }), []);

  useEffect(() => {
    if (currentCard) {
      setCandidateTiles(getCandidateTiles(3));
    } else {
      setCandidateTiles([]);
    }
  }, [currentCard, getCandidateTiles]);

  const handleReset = useCallback(() => {
    resetGrid();
    deckDispatch({ type: 'RESET' });
    setEditingTile(null);
  }, [resetGrid]);

  const handleTileClick = useCallback((col, row) => {
    if (!currentCard) return;
    const isCandidate = candidateTiles.some(t => t.col === col && t.row === row);
    if (!isCandidate) return;
    setEditingTile({ col, row });
  }, [currentCard, candidateTiles]);

  const handleSaveTile = useCallback((col, row, tileData) => {
    const isVoid = currentCard?.allowedTypes.length === 0;
    if (isVoid) {
      updateTile(col, row, { lines: [], regions: [], edgeSegments: null });
    } else {
      updateTile(col, row, tileData);
    }
    setEditingTile(null);
    deckDispatch({ type: 'DISCARD' });
  }, [currentCard, updateTile]);

  const handleCancelEdit = useCallback(() => {
    setEditingTile(null);
  }, []);

  const isEditing = editingTile !== null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <div className="max-w-4xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-end justify-between mb-7">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-100">Jerry Mapping</h1>
            <p className="text-sm text-slate-500 mt-1">
              Draw a card. Select a tile. Draw the world within its constraints.
            </p>
          </div>
          <button
            onClick={handleReset}
            className="text-xs text-slate-500 hover:text-slate-300 px-3 py-1.5 rounded border border-slate-700 hover:border-slate-500 transition-colors"
          >
            Reset Map
          </button>
        </div>

        {isEditing ? (
          /* ── Tile editor view ── */
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-3 mb-1">
              <div
                className="px-3 py-1 rounded text-xs font-bold uppercase tracking-widest text-slate-900"
                style={{ backgroundColor: currentCard?.accent }}
              >
                {currentCard?.name}
              </div>
              <span className="text-sm text-slate-400">
                Editing tile ({editingTile.col}, {editingTile.row})
              </span>
            </div>
            {(() => {
              const constraints = getConstraints(editingTile.col, editingTile.row);
              const cardTypes = currentCard?.allowedTypes ?? [];
              const effectiveAllowedTypes = cardTypes.length === 0
                ? []
                : [...new Set([...cardTypes, ...typesFromConstraints(constraints)])];
              return (
                <TileEditor
                  tile={grid[editingTile.row * GRID_COLS + editingTile.col]}
                  constraints={constraints}
                  allowedTypes={effectiveAllowedTypes}
                  onSave={(tileData) => handleSaveTile(editingTile.col, editingTile.row, tileData)}
                  onCancel={handleCancelEdit}
                />
              );
            })()}
          </div>
        ) : (
          /* ── Map view ── */
          <div className="flex gap-6 items-start">
            <div className="flex-1 min-w-0">
              <MapCanvas
                grid={grid}
                selectedTile={null}
                onTileClick={handleTileClick}
                disabled={candidateTiles.length === 0}
                candidateTiles={candidateTiles}
              />
              {!currentCard && (
                <p className="mt-2 text-xs text-slate-600 text-center">
                  Draw a card, then select one of the highlighted tiles
                </p>
              )}
              {currentCard && candidateTiles.length > 0 && (
                <p className="mt-2 text-xs text-slate-500 text-center">
                  Select a highlighted tile to place{' '}
                  <span className="font-medium" style={{ color: currentCard.accent }}>
                    {currentCard.name}
                  </span>
                </p>
              )}
              {currentCard && candidateTiles.length === 0 && (
                <p className="mt-2 text-xs text-slate-500 text-center">
                  No adjacent empty tiles available
                </p>
              )}
            </div>

            <CardPanel
              currentCard={currentCard}
              history={history}
              onDraw={drawCard}
              onCancel={discardCard}
              hasCard={currentCard !== null}
            />
          </div>
        )}

        {/* Region legend */}
        {!isEditing && (
          <div className="flex flex-wrap gap-4 mt-6 pt-5 border-t border-slate-800">
            {Object.entries(REGION_CONFIG).map(([key, cfg]) => (
              <div key={key} className="flex items-center gap-1.5 text-xs text-slate-500">
                <div
                  className="w-3 h-3 rounded-sm border border-slate-700 flex-shrink-0"
                  style={{ backgroundColor: cfg.color }}
                />
                {cfg.name}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
