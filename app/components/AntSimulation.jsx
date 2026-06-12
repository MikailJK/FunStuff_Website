"use client"
import React, { useRef, useEffect, useState } from "react"

const GRID_SIZE = 600
const NUM_ANTS = 10000
const NEST = { x: GRID_SIZE / 2, y: GRID_SIZE / 2 }
const FOOD = { x: GRID_SIZE / 4, y: GRID_SIZE / 4 }

const EDGE_MARGIN = 2
const FOOD_RADIUS = 8
const NEST_RADIUS = 8

const DEFAULT_CONFIG = {
  speed: 0.5,
  maxTurn: 15,
  wander: 20,
  sensorDist: 10,
  sensorAngle: 25,
  pheromoneDecay: 0.1,
}

function initFoodMap() {
  const m = new Uint8Array(GRID_SIZE * GRID_SIZE)
  for (let dx = -FOOD_RADIUS; dx <= FOOD_RADIUS; dx++)
    for (let dy = -FOOD_RADIUS; dy <= FOOD_RADIUS; dy++)
      if (dx * dx + dy * dy <= FOOD_RADIUS * FOOD_RADIUS)
        m[(FOOD.y + dy) * GRID_SIZE + (FOOD.x + dx)] = 1
  return m
}

function makeAnts() {
  return Array.from({ length: NUM_ANTS }, () => ({
    x: EDGE_MARGIN + Math.random() * (GRID_SIZE - EDGE_MARGIN * 2),
    y: EDGE_MARGIN + Math.random() * (GRID_SIZE - EDGE_MARGIN * 2),
    carryingFood: false,
    direction: Math.random() * 2 * Math.PI,
  }))
}

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val))
}

function bounce(ant, nx, ny) {
  let { direction } = ant
  if (nx <= EDGE_MARGIN || nx >= GRID_SIZE - 1 - EDGE_MARGIN)
    direction = Math.PI - direction
  if (ny <= EDGE_MARGIN || ny >= GRID_SIZE - 1 - EDGE_MARGIN)
    direction = -direction
  return {
    x: clamp(nx, EDGE_MARGIN, GRID_SIZE - 1 - EDGE_MARGIN),
    y: clamp(ny, EDGE_MARGIN, GRID_SIZE - 1 - EDGE_MARGIN),
    direction,
  }
}

function samplePheromone(pheromone, x, y, angle, dist) {
  const sx = clamp(Math.floor(x + Math.cos(angle) * dist), 0, GRID_SIZE - 1)
  const sy = clamp(Math.floor(y + Math.sin(angle) * dist), 0, GRID_SIZE - 1)
  return pheromone[sy * GRID_SIZE + sx]
}

export default function AntSimulation() {
  const canvasRef = useRef(null)
  const pheromoneRef = useRef(new Float32Array(GRID_SIZE * GRID_SIZE))
  const foodMapRef = useRef(initFoodMap())
  const activeCellsRef = useRef(new Set())
  const antsRef = useRef(makeAnts())
  const rafRef = useRef(null)
  const configRef = useRef(DEFAULT_CONFIG)

  const [config, setConfig] = useState(DEFAULT_CONFIG)
  const [freeMode, setFreeMode] = useState(true)
  const freeModeRef = useRef(true)

  function updateConfig(key, value) {
    const next = { ...configRef.current, [key]: value }
    configRef.current = next
    setConfig(next)
  }

  function toggleFreeMode() {
    const next = !freeModeRef.current
    freeModeRef.current = next
    setFreeMode(next)
    for (const ant of antsRef.current) ant.carryingFood = false
    pheromoneRef.current.fill(0)
    activeCellsRef.current.clear()
  }

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext("2d")
    const W = canvas.width
    const H = canvas.height

    const imageData = ctx.createImageData(W, H)
    const buf = imageData.data
    // Uint32 view for fast per-pixel writes; pixel layout LE: 0xAABBGGRR
    const buf32 = new Uint32Array(buf.buffer)
    const BG = 0xff1a1a1a

    function step() {
      const pheromone = pheromoneRef.current
      const foodMap = foodMapRef.current
      const activeCells = activeCellsRef.current
      const ants = antsRef.current
      const { speed, maxTurn, wander, sensorDist, sensorAngle, pheromoneDecay } = configRef.current
      const maxTurnRad = maxTurn * Math.PI / 180
      const wanderRad = wander * Math.PI / 180
      const sensorRad = sensorAngle * Math.PI / 180

      // decay only cells that have pheromone
      for (const idx of activeCells) {
        const v = pheromone[idx] - pheromoneDecay
        if (v <= 0) { pheromone[idx] = 0; activeCells.delete(idx) }
        else pheromone[idx] = v
      }

      // update ants
      const free = freeModeRef.current
      for (const ant of ants) {
        let { x, y } = ant

        if (!free && ant.carryingFood) {
          ant.direction += (Math.random() - 0.5) * maxTurnRad * 0.3
          const b = bounce(ant, x + Math.cos(ant.direction) * speed, y + Math.sin(ant.direction) * speed)
          x = b.x; y = b.y; ant.direction = b.direction
          if (Math.abs(x - NEST.x) < NEST_RADIUS && Math.abs(y - NEST.y) < NEST_RADIUS) {
            ant.carryingFood = false
            ant.direction += Math.PI
          } else {
            const idx = Math.floor(y) * GRID_SIZE + Math.floor(x)
            if (pheromone[idx] < 10){
                pheromone[idx] += 1
            }
            activeCells.add(idx)
          }
        } else {
          const pCenter = samplePheromone(pheromone, x, y, ant.direction, sensorDist)
          const pLeft   = samplePheromone(pheromone, x, y, ant.direction - sensorRad, sensorDist)
          const pRight  = samplePheromone(pheromone, x, y, ant.direction + sensorRad, sensorDist)

          if (pCenter > 0 || pLeft > 0 || pRight > 0) {
            const prevDir = ant.direction
            if (pLeft > pCenter && pLeft > pRight)
              ant.direction -= maxTurnRad * 0.4
            else if (pRight > pCenter && pRight > pLeft)
              ant.direction += maxTurnRad * 0.4
            ant.direction += (Math.random() - 0.5) * wanderRad
            const delta = ant.direction - prevDir
            ant.direction = prevDir + clamp(delta, -maxTurnRad, maxTurnRad)
          } else {
            ant.direction += (Math.random() - 0.5) * maxTurnRad
          }

          const b = bounce(ant, x + Math.cos(ant.direction) * speed, y + Math.sin(ant.direction) * speed)
          x = b.x; y = b.y; ant.direction = b.direction

          if (free) {
            const idx = Math.floor(y) * GRID_SIZE + Math.floor(x)
            if (pheromone[idx] < 10){
                pheromone[idx] += 1
            }
            activeCells.add(idx)
          } else if (foodMap[Math.floor(y) * GRID_SIZE + Math.floor(x)]) {
            ant.carryingFood = true
            ant.direction += Math.PI
          }
        }

        ant.x = x
        ant.y = y
      }

      // fill background in one native call
      buf32.fill(BG)

      // write pheromone pixels blended over background
      for (const idx of activeCells) {
        const a = Math.min(1, pheromone[idx] / 5)
        const inv = 1 - a
        const r = (0x1a * inv + 100 * a) | 0
        const g = (0x1a * inv + 200 * a) | 0
        const b = (0x1a * inv + 100 * a) | 0
        buf32[idx] = 0xff000000 | (b << 16) | (g << 8) | r
      }

      // write ant pixels
      for (const ant of ants) {
        const px = clamp(Math.floor(ant.x), 0, GRID_SIZE - 1)
        const py = clamp(Math.floor(ant.y), 0, GRID_SIZE - 1)
        buf32[py * GRID_SIZE + px] = ant.carryingFood ? 0xff0000ff : 0xffffffff
      }

      ctx.putImageData(imageData, 0, 0)

      if (!freeModeRef.current) {
        ctx.fillStyle = "lime"
        ctx.fillRect(FOOD.x - FOOD_RADIUS, FOOD.y - FOOD_RADIUS, FOOD_RADIUS * 2, FOOD_RADIUS * 2)
        ctx.fillStyle = "saddlebrown"
        ctx.fillRect(NEST.x - NEST_RADIUS, NEST.y - NEST_RADIUS, NEST_RADIUS * 2, NEST_RADIUS * 2)
      }

      rafRef.current = requestAnimationFrame(step)
    }

    rafRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  const sliders = [
    { key: "speed",   label: "Speed",           min: 0.2, max: 3,  step: 0.1, unit: "×" },
    { key: "maxTurn", label: "Max Turn",         min: 5,   max: 90, step: 1,   unit: "°" },
    { key: "wander",  label: "Wander (on trail)", min: 0,   max: 45, step: 1,   unit: "°" },
    { key: "sensorDist",  label: "Sensor Distance",   min: 1,   max: 15,  step: 1,   unit: " cells" },
    { key: "sensorAngle",    label: "Sensor Angle",      min: 5,     max: 90,   step: 1,     unit: "°" },
    { key: "pheromoneDecay", label: "Pheromone Decay",   min: 0.01, max: 1, step: 0.01, unit: "" },
  ]

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      <canvas
        ref={canvasRef}
        width={600}
        height={600}
        style={{
          display: "block",
          background: "#1a1a1a",
          width: "100%",
          maxWidth: 600,
          aspectRatio: "1 / 1",
        }}
      />
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "12px 24px",
        background: "#222",
        padding: 16,
        borderRadius: 8,
        width: "100%",
        maxWidth: 600,
        boxSizing: "border-box",
      }}>
        {sliders.map(({ key, label, min, max, step, unit }) => (
          <label key={key} style={{ display: "flex", flexDirection: "column", gap: 4, color: "#ccc", fontSize: 13 }}>
            <span>{label}: <strong style={{ color: "#fff" }}>{config[key]}{unit}</strong></span>
            <input
              type="range"
              min={min} max={max} step={step}
              value={config[key]}
              onChange={e => updateConfig(key, parseFloat(e.target.value))}
              style={{ width: "100%" }}
            />
          </label>
        ))}
      </div>
    </div>
  )
}
