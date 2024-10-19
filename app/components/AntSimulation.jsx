"use client"
import React, { useRef, useEffect, useState } from "react"
import * as THREE from "three"
import { Canvas, useFrame } from "@react-three/fiber"
import { OrbitControls } from "@react-three/drei"

const gridSize = 100
const numAnts = 100
const nestPosition = { x: gridSize / 2, y: gridSize / 2 }
const foodPosition = { x: Math.random() * gridSize, y: Math.random() * gridSize }
const pheromoneDecayRate = 0.01

function createGrid(size) {
  const grid = []
  for (let i = 0; i < size; i++) {
    grid[i] = []
    for (let j = 0; j < size; j++) {
      grid[i][j] = { pheromone: 0, food: false }
    }
  }
  grid[foodPosition.x][foodPosition.y].food = true
  return grid
}

function createAnts(num) {
  const ants = []
  for (let i = 0; i < num; i++) {
    ants.push({
      position: { x: nestPosition.x, y: nestPosition.y },
      carryingFood: false,
      direction: Math.random() * 2 * Math.PI
    })
  }
  return ants
}

function AntSimulation() {
  const [grid, setGrid] = useState(createGrid(gridSize))
  const [ants, setAnts] = useState(createAnts(numAnts))

  useFrame(() => {
    const newGrid = grid.map(row => row.map(cell => ({
      ...cell,
      pheromone: Math.max(0, cell.pheromone - pheromoneDecayRate)
    })))

    const newAnts = ants.map(ant => {
      let { x, y } = ant.position
      if (ant.carryingFood) {
        ant.direction += (Math.random() - 0.5) * 0.1
        x += Math.cos(ant.direction)
        y += Math.sin(ant.direction)
        if (Math.abs(x - nestPosition.x) < 1 && Math.abs(y - nestPosition.y) < 1) {
          ant.carryingFood = false
          ant.direction += Math.PI
        } else {
          newGrid[Math.floor(x)][Math.floor(y)].pheromone += 1
        }
      } else {
        const { pheromone } = newGrid[Math.floor(x)][Math.floor(y)]
        if (pheromone > 0) {
          ant.direction += (Math.random() - 0.5) * 0.1
          x += Math.cos(ant.direction)
          y += Math.sin(ant.direction)
        } else {
          ant.direction += (Math.random() - 0.5) * 0.5
          x += Math.cos(ant.direction)
          y += Math.sin(ant.direction)
        }
        if (newGrid[Math.floor(x)][Math.floor(y)].food) {
          ant.carryingFood = true
          ant.direction += Math.PI
        }
      }
      return { ...ant, position: { x, y } }
    })

    setGrid(newGrid)
    setAnts(newAnts)
  })

  return (
    <Canvas>
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} />
      <gridHelper args={[gridSize, gridSize]} />
      {ants.map((ant, index) => (
        <mesh key={index} position={[ant.position.x, ant.position.y, 0]}>
          <sphereGeometry args={[0.1, 16, 16]} />
          <meshStandardMaterial color={ant.carryingFood ? "red" : "black"} />
        </mesh>
      ))}
      <mesh position={[foodPosition.x, foodPosition.y, 0]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="green" />
      </mesh>
      <OrbitControls />
    </Canvas>
  )
}

export default AntSimulation
