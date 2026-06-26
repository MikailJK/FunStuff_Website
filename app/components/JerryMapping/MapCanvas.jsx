"use client"
import { useRef, useEffect, useCallback } from 'react';
import {
  GRID_COLS, GRID_ROWS, TILE_DISPLAY_SIZE,
  MAP_CANVAS_SIZE,
} from './config.js';
import { renderTileToCanvas } from './tileUtils.js';

export function MapCanvas({ grid, selectedTile, onTileClick, disabled, candidateTiles = [] }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, MAP_CANVAS_SIZE, MAP_CANVAS_SIZE);

    grid.forEach((tile, idx) => {
      const col = idx % GRID_COLS;
      const row = Math.floor(idx / GRID_COLS);
      const x   = col * TILE_DISPLAY_SIZE;
      const y   = row * TILE_DISPLAY_SIZE;

      const oc  = document.createElement('canvas');
      oc.width  = TILE_DISPLAY_SIZE;
      oc.height = TILE_DISPLAY_SIZE;
      renderTileToCanvas(oc.getContext('2d'), tile, TILE_DISPLAY_SIZE, { showLines: false });
      ctx.drawImage(oc, x, y);
    });

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth   = 0.5;
    for (let i = 0; i <= GRID_COLS; i++) {
      ctx.beginPath();
      ctx.moveTo(i * TILE_DISPLAY_SIZE, 0);
      ctx.lineTo(i * TILE_DISPLAY_SIZE, MAP_CANVAS_SIZE);
      ctx.stroke();
    }
    for (let j = 0; j <= GRID_ROWS; j++) {
      ctx.beginPath();
      ctx.moveTo(0, j * TILE_DISPLAY_SIZE);
      ctx.lineTo(MAP_CANVAS_SIZE, j * TILE_DISPLAY_SIZE);
      ctx.stroke();
    }

    // Candidate tile highlights
    candidateTiles.forEach(({ col, row }) => {
      const x = col * TILE_DISPLAY_SIZE;
      const y = row * TILE_DISPLAY_SIZE;
      ctx.fillStyle = 'rgba(255, 210, 30, 0.15)';
      ctx.fillRect(x + 1, y + 1, TILE_DISPLAY_SIZE - 2, TILE_DISPLAY_SIZE - 2);
      ctx.strokeStyle = 'rgba(255, 210, 30, 0.9)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 3]);
      ctx.strokeRect(x + 1, y + 1, TILE_DISPLAY_SIZE - 2, TILE_DISPLAY_SIZE - 2);
      ctx.setLineDash([]);
    });

    // Selected tile highlight
    if (selectedTile) {
      const { col, row } = selectedTile;
      ctx.strokeStyle = '#f0d050';
      ctx.lineWidth   = 2;
      ctx.strokeRect(
        col * TILE_DISPLAY_SIZE + 1,
        row * TILE_DISPLAY_SIZE + 1,
        TILE_DISPLAY_SIZE - 2,
        TILE_DISPLAY_SIZE - 2
      );
    }
  }, [grid, selectedTile, candidateTiles]);

  const handleClick = useCallback((e) => {
    if (disabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect   = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    const col = Math.floor(((e.clientX - rect.left) * scaleX) / TILE_DISPLAY_SIZE);
    const row = Math.floor(((e.clientY - rect.top)  * scaleY) / TILE_DISPLAY_SIZE);
    if (col >= 0 && col < GRID_COLS && row >= 0 && row < GRID_ROWS) {
      onTileClick(col, row);
    }
  }, [disabled, onTileClick]);

  return (
    <canvas
      ref={canvasRef}
      width={MAP_CANVAS_SIZE}
      height={MAP_CANVAS_SIZE}
      onClick={handleClick}
      style={{
        display: 'block',
        width: '100%',
        maxWidth: MAP_CANVAS_SIZE,
        cursor: disabled ? 'default' : 'pointer',
        imageRendering: 'pixelated',
      }}
      className="rounded border border-slate-700"
    />
  );
}
