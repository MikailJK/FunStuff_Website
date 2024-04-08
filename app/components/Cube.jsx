"use client"
import { Canvas, useFrame } from "@react-three/fiber"
import { useRef } from "react"
import { OrbitControls } from "@react-three/drei"



export default function main() {
  return (
    < main className="w-full h-screen border-4">
      <Canvas>
        {/* <ambientLight intensity={2} /> */}
        <directionalLight position={[2, 1, 1]} intensity={2} />
        <Cube />
      </Canvas>
    </main >
  )
}

function Cube() {
  const mesh = useRef(null)
  useFrame((state, delta) => {
    mesh.current.rotation.x += delta * 0.2
    mesh.current.rotation.y += delta * 0.2
    mesh.current.rotation.z += delta * 0.2
  })
  return (
    <mesh ref={mesh}>
      <OrbitControls enablePan={false} enableZoom={false} />
      <boxGeometry args={[2, 2, 2]} />
      <meshStandardMaterial color={"blue"} />
    </mesh>
  )
}
