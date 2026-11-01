import { Bounds, Center, OrbitControls, useGLTF } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { Suspense } from 'react'

function GeneratedModel({ url }: { url: string }) {
  const { scene } = useGLTF(url)
  return (
    <Bounds fit clip observe margin={1.06}>
      <Center>
        <primitive object={scene} />
      </Center>
    </Bounds>
  )
}

export default function ThreePreview({ modelUrl }: { modelUrl: string }) {
  return (
    <div className="three-canvas" aria-label="可旋转的汉服三维预览">
      <Canvas camera={{ position: [5, 2.6, 7], fov: 35 }} shadows dpr={[1, 1.5]}>
        <color attach="background" args={['#efede6']} />
        <ambientLight intensity={1.4} />
        <directionalLight position={[5, 8, 6]} intensity={2.4} castShadow />
        <directionalLight position={[-5, 3, -4]} intensity={0.6} color="#c9d4cc" />
        <Suspense fallback={null}>
          <GeneratedModel url={modelUrl} />
        </Suspense>
        <OrbitControls makeDefault enablePan={false} minDistance={0.5} maxDistance={50} />
      </Canvas>
      <span className="drag-hint">拖动旋转 · 滚轮缩放</span>
    </div>
  )
}
