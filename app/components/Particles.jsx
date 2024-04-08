"use client"
import * as THREE from "three"
import { Canvas, useFrame } from "@react-three/fiber"
import { useRef } from "react"
import { OrbitControls } from "@react-three/drei"


export default function main() {
  return (
    < div className="w-full h-screen fixed top-0 left-0 -z-50">
      <Canvas>
        <ambientLight intensity={2} />
        <Points />
        <OrbitControls autoRotate autoRotateSpeed={0.5} />
      </Canvas>
    </div >
  )
}

function Points() {

  const points = useRef()

  return (
    <points ref={points}>
      <sphereGeometry args={[5, 32]} position={[1, 5, 5]} />
      <pointsMaterial color="#5786F5" size={0.015} sizeAttenuation />
    </points>
  )

}
