"use client"
import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { SHOW_DEV_TOGGLE, EXPORT_TILE_PX } from '../config.js';
import { TERRAINS, PAINTABLE } from '../data/terrains.js';
import { CARDS, CARDS_BY_ID, DEV_CARD } from '../data/cards.js';
import { toSaveFile } from '../engine/serialize.js';
import { hasVoid } from '../engine/void.js';
import { useGame } from '../hooks/useGame.js';
import { exportMapCanvas } from '../render/mapRenderer.js';
import { MapView } from './MapView.jsx';
import { TileEditor } from './TileEditor.jsx';
import { CardPanel } from './CardPanel.jsx';
import { HowToPlay } from './HowToPlay.jsx';

function download(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const headerBtn = 'text-xs px-3 py-1.5 rounded border transition-colors text-slate-400 border-slate-700 hover:text-slate-200 hover:border-slate-500';

export default function JerryMappingApp() {
  const game = useGame();
  const { state, player, dispatch, pacing } = game;
  const [devMode, setDevMode] = useState(false);
  const [devCardId, setDevCardId] = useState(CARDS[0].id);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState(null);
  const [focusKey, setFocusKey] = useState(null);
  const fileRef = useRef(null);
  const tickCount = useRef(0);

  useEffect(() => {
    if (!message) return;
    const id = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(id);
  }, [message]);

  const card = state?.active ? CARDS_BY_ID[state.active.cardId] : null;
  const offers = state?.active?.offers ?? [];
  const claim = state?.active?.claim ?? null;
  const voidActive = useMemo(() => !!state && Object.values(state.tiles).some(hasVoid), [state]);
  const playerNames = useMemo(() => {
    const names = Object.fromEntries(Object.entries(state?.players ?? {}).map(([id, p]) => [id, p.name]));
    if (player) names[player.id] = `${player.name} (you)`;
    return names;
  }, [state?.players, player]);

  const report = res => { if (!res.ok) setMessage(res.error); return res; };

  const handleDraw = useCallback(forced => {
    if (!pacing.ok) return;
    const res = dispatch('DRAW', forced ? { cardId: forced } : {});
    if (!res.ok) return setMessage(res.error);
    if (!res.state.active) setMessage('Shuffle! The discard pile went back into the deck.');
    else setFocusKey(`${res.state.turn}:${res.state.active.cardId}:${Date.now()}`);
  }, [dispatch, pacing.ok]);

  const handleTileClick = useCallback((x, y) => {
    if (!state?.active || !state.active.offers.some(o => o.x === x && o.y === y)) return;
    if (report(dispatch('CLAIM', { x, y })).ok) setEditing(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, dispatch]);

  const handleSubmit = useCallback(tile => {
    const res = dispatch('SUBMIT', { x: claim.x, y: claim.y, tile, dev: devMode });
    if (res.ok) setEditing(false);
    return res;
  }, [dispatch, claim, devMode]);

  const handleBack = useCallback(() => {
    dispatch('RELEASE');
    setEditing(false);
  }, [dispatch]);

  const handleDiscard = useCallback(() => {
    report(dispatch('DISCARD'));
    setEditing(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  const handleNewMap = () => {
    if (!window.confirm('Start a new map? The current one will be replaced (export it first to keep a copy).')) return;
    game.newMap();
    setEditing(false);
  };

  const exportPng = () => {
    exportMapCanvas(state.tiles, EXPORT_TILE_PX).toBlob(blob => blob && download(`jerry-map-${state.seed}.png`, blob));
  };
  const exportJson = () => {
    download(`jerry-map-${state.seed}.json`, new Blob([JSON.stringify(toSaveFile(game.store))], { type: 'application/json' }));
  };
  const importJson = async e => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!window.confirm('Replace the current map with this file?')) return;
      game.importSave(data);
      setEditing(false);
      setMessage('Map imported.');
    } catch (err) {
      setMessage(`Couldn't import: ${err.message}`);
    }
  };

  if (!state || !player) {
    return <div className="min-h-screen bg-slate-950 text-slate-500 flex items-center justify-center text-sm">Unrolling the map…</div>;
  }

  const isEditing = editing && claim && card;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">

        {/* Header */}
        <div className="flex flex-wrap gap-4 items-end justify-between mb-5">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-100">Jerry Mapping</h1>
            <p className="text-sm text-slate-500 mt-1">
              A map that grows one card at a time — after Jerry Gretzinger&apos;s lifelong map of an imaginary land.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <label className="flex items-center gap-1.5 text-xs text-slate-500">
              Cartographer
              <input
                defaultValue={player.name}
                key={player.id}
                maxLength={24}
                onBlur={e => e.target.value.trim() && e.target.value.trim() !== player.name && game.rename(e.target.value.trim())}
                className="w-28 px-2 py-1 rounded bg-slate-900 border border-slate-700 text-slate-200 focus:outline-none focus:border-slate-500"
              />
            </label>
            <button type="button" onClick={exportPng} className={headerBtn}>Export PNG</button>
            <button type="button" onClick={exportJson} className={headerBtn}>Save file</button>
            <button type="button" onClick={() => fileRef.current?.click()} className={headerBtn}>Load file</button>
            <input ref={fileRef} type="file" accept="application/json,.json" onChange={importJson} className="hidden" />
            <button type="button" onClick={handleNewMap} className={headerBtn}>New map</button>
            {SHOW_DEV_TOGGLE && (
              <button type="button" onClick={() => setDevMode(d => !d)}
                className={`text-xs px-3 py-1.5 rounded border transition-colors ${devMode ? 'text-amber-300 border-amber-700 bg-amber-950/40' : 'text-slate-500 border-slate-700 hover:text-slate-300'}`}>
                Dev {devMode ? 'on' : 'off'}
              </button>
            )}
          </div>
        </div>

        {!isEditing && <HowToPlay />}

        {message && (
          <div className="mb-4 text-xs text-amber-200 bg-amber-950/40 border border-amber-800/60 rounded px-3 py-2">{message}</div>
        )}

        {isEditing ? (
          <TileEditor
            key={`${claim.x},${claim.y},${state.turn},${devMode}`}
            state={state}
            x={claim.x}
            y={claim.y}
            card={devMode ? DEV_CARD : card}
            playedCard={card}
            isDev={devMode}
            onSubmit={handleSubmit}
            onCancel={handleBack}
          />
        ) : (
          <div className="flex flex-col lg:flex-row gap-6 items-start">
            <div className="w-full lg:flex-1 min-w-0">
              <MapView
                state={state}
                offers={offers}
                claim={claim}
                onTileClick={handleTileClick}
                playerNames={playerNames}
                focusKey={focusKey}
              />
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
                {[...PAINTABLE, 'void'].map(t => (
                  <div key={t} className="flex items-center gap-1.5 text-xs text-slate-500">
                    <span className="w-3 h-3 rounded-sm border border-slate-700" style={{ backgroundColor: TERRAINS[t].color }} />
                    {TERRAINS[t].name}
                  </div>
                ))}
              </div>
            </div>

            <aside className="w-full lg:w-72 flex-shrink-0 space-y-4">
              <CardPanel
                state={state}
                card={card}
                offers={offers}
                pacing={pacing}
                onDraw={() => handleDraw(null)}
                onDiscard={handleDiscard}
                onResume={() => setEditing(true)}
                voidActive={voidActive}
              />

              {devMode && (
                <div className="rounded-lg border border-amber-800/60 bg-amber-950/20 p-3 space-y-2 text-xs">
                  <p className="uppercase tracking-widest text-amber-400/80 text-[11px]">Dev tools</p>
                  <div className="flex gap-1.5">
                    <select value={devCardId} onChange={e => setDevCardId(e.target.value)}
                      className="flex-1 min-w-0 bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-slate-200">
                      {CARDS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <button type="button" disabled={!!card} onClick={() => handleDraw(devCardId)}
                      className="px-2 py-1 rounded border border-amber-700 text-amber-300 disabled:opacity-40">Draw</button>
                  </div>
                  <button type="button" onClick={() => report(dispatch('VOID_TICK', { n: ++tickCount.current }))}
                    className="w-full px-2 py-1 rounded border border-slate-700 text-slate-300 hover:border-slate-500">
                    Force a void tick
                  </button>
                  <label className="flex items-center gap-2 text-slate-400">
                    <input type="checkbox" checked={game.pacing.policyName === 'devSimulated'}
                      onChange={e => game.setPolicyName(e.target.checked ? 'devSimulated' : 'unlimited')} />
                    Simulate online pacing (3 cards / 3 min)
                  </label>
                  <p className="text-slate-500">While on, the editor grants every terrain and tool with no limits.</p>
                </div>
              )}
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
