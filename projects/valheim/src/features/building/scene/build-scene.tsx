import { Grid, Html, OrbitControls, RoundedBox } from '@react-three/drei'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { ROCK_PREFAB, type BuildingCatalog, type PlacedPiece, type Yaw } from '../../../lib/building/building-catalog.ts'
import { planPlacement, type GhostPlacement, type RayHit } from '../../../lib/building/placement.ts'
import { MATERIAL_PROPERTIES, rgbToCss, supportColor } from '../../../lib/building/support-model.ts'
import type { SimBody, SupportSolution, Vec3 } from '../../../lib/building/support-solver.ts'
import type { BuildTool, CameraPreset } from '../../../store/building-sim-store.ts'
import { MATERIAL_BASE_COLOR, ROCK_COLOR, materialTextures, rockTextureFor } from './textures.ts'

export interface FitRequest {
  token: number
}

interface BuildSceneProps {
  catalog: BuildingCatalog
  scene: PlacedPiece[]
  bodies: Map<string, SimBody>
  solution: SupportSolution
  tool: BuildTool
  yaw: Yaw
  colourAll: boolean
  hoveredId: string | null
  selectedId: string | null
  fit: FitRequest
  cameraPreset?: { preset: CameraPreset; token: number }
  onHover: (id: string | null) => void
  onPlace: (piece: Omit<PlacedPiece, 'id'>) => void
  onRemove: (id: string) => void
  onSelect: (id: string | null) => void
}

const CLICK_SLOP = 5

const readHit = (event: ThreeEvent<PointerEvent>): RayHit => {
  const normal = event.face
    ? event.face.normal.clone().transformDirection(event.object.matrixWorld)
    : new THREE.Vector3(0, 1, 0)
  return { point: { x: event.point.x, y: event.point.y, z: event.point.z }, normal: { x: normal.x, y: normal.y, z: normal.z } }
}

/** Everything 3-D for the Building tab: the sandbox world, pieces, ghost and camera. */
export function BuildScene(props: BuildSceneProps) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ position: [14, 12, 18], fov: 40, near: 0.1, far: 500 }}
      onContextMenu={(event) => event.preventDefault()}
      onPointerMissed={() => props.onSelect(null)}
    >
      <color attach="background" args={['#0a0e14']} />
      <fog attach="fog" args={['#0a0e14', 60, 160]} />
      <hemisphereLight args={['#dce5f0', '#383024', 0.9]} />
      <directionalLight
        position={[22, 34, 16]}
        intensity={2.1}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0003}
        shadow-camera-left={-45}
        shadow-camera-right={45}
        shadow-camera-top={45}
        shadow-camera-bottom={-45}
        shadow-camera-far={140}
      />
      {/* Soft fill light from opposite side */}
      <directionalLight position={[-16, 12, -20]} intensity={0.4} color="#7890a8" />

      <World {...props} />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.12}
        minDistance={2}
        maxDistance={150}
        maxPolarAngle={Math.PI * 0.495}
        mouseButtons={{
          LEFT: -1 as unknown as THREE.MOUSE,
          MIDDLE: THREE.MOUSE.PAN,
          RIGHT: THREE.MOUSE.ROTATE,
        }}
      />
      <CameraRig bodies={props.bodies} fit={props.fit} cameraPreset={props.cameraPreset} />
    </Canvas>
  )
}

function World({
  catalog,
  scene,
  bodies,
  solution,
  tool,
  yaw,
  colourAll,
  hoveredId,
  selectedId,
  onHover,
  onPlace,
  onRemove,
  onSelect,
}: BuildSceneProps) {
  const [hit, setHit] = useState<RayHit | null>(null)
  const pressed = useRef<{ x: number; y: number; button: number } | null>(null)
  const textures = useMemo(() => materialTextures(), [])
  const rockTexture = useMemo(() => rockTextureFor(), [])

  const ghost: GhostPlacement | null = useMemo(() => {
    if (!hit || tool.kind === 'erase') return null
    if (tool.kind === 'rock') return planPlacement(ROCK_PREFAB, yaw, hit, scene, catalog, tool.size)
    return planPlacement(tool.prefabName, yaw, hit, scene, catalog)
  }, [catalog, hit, scene, tool, yaw])

  const surfaceHandlers = useCallback(
    (pieceId: string | null): SurfaceHandlers => ({
      onPointerMove: (event: ThreeEvent<PointerEvent>) => {
        event.stopPropagation()
        setHit(readHit(event))
        onHover(pieceId)
      },
      onPointerOut: (event: ThreeEvent<PointerEvent>) => {
        event.stopPropagation()
        if (pieceId !== null) onHover(null)
      },
      onPointerDown: (event: ThreeEvent<PointerEvent>) => {
        event.stopPropagation()
        pressed.current = { x: event.nativeEvent.clientX, y: event.nativeEvent.clientY, button: event.nativeEvent.button }
      },
      onPointerUp: (event: ThreeEvent<PointerEvent>) => {
        event.stopPropagation()
        const start = pressed.current
        pressed.current = null
        if (!start || start.button !== event.nativeEvent.button) return
        const moved = Math.hypot(event.nativeEvent.clientX - start.x, event.nativeEvent.clientY - start.y)
        if (moved > CLICK_SLOP) return
        if (event.nativeEvent.button === 2) {
          if (pieceId) onRemove(pieceId)
          return
        }
        if (event.nativeEvent.button !== 0) return
        if (tool.kind === 'erase') {
          if (pieceId) onRemove(pieceId)
          return
        }
        const planned =
          tool.kind === 'rock'
            ? planPlacement(ROCK_PREFAB, yaw, readHit(event), scene, catalog, tool.size)
            : planPlacement(tool.prefabName, yaw, readHit(event), scene, catalog)
        if (!planned || !planned.valid) return
        if (tool.kind === 'rock') {
          onPlace({ prefabName: ROCK_PREFAB, x: planned.origin.x, y: planned.origin.y, z: planned.origin.z, yaw, size: tool.size })
        } else {
          onPlace({ prefabName: tool.prefabName, x: planned.origin.x, y: planned.origin.y, z: planned.origin.z, yaw })
        }
        onSelect(null)
      },
    }),
    [catalog, onHover, onPlace, onRemove, onSelect, scene, tool, yaw]
  )

  const collapsedIds = useMemo(() => new Set(solution.collapsed), [solution.collapsed])

  return (
    <group>
      {/* Ground plane */}
      <mesh rotation-x={-Math.PI / 2} receiveShadow {...surfaceHandlers(null)} onPointerOut={() => setHit(null)}>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color="#2d3329" roughness={0.98} />
      </mesh>

      {/* Atmospheric Norse terrain grid */}
      <Grid
        position={[0, 0.005, 0]}
        args={[400, 400]}
        cellSize={1}
        cellThickness={0.6}
        cellColor="#424a3e"
        sectionSize={4}
        sectionThickness={1.1}
        sectionColor="#5f695c"
        fadeDistance={75}
        fadeStrength={1.2}
        infiniteGrid
      />

      {/* Building Pieces */}
      {scene.map((placed) => {
        const body = bodies.get(placed.id)
        if (!body) return null
        const result = solution.bodies.get(placed.id)
        const centre = boxCentre(body)
        const size = boxSize(body)
        const hovered = placed.id === hoveredId
        const selected = placed.id === selectedId
        const collapsing = collapsedIds.has(placed.id)

        if (placed.prefabName === ROCK_PREFAB) {
          return (
            <RoundedBox
              key={placed.id}
              args={[size.x, size.y, size.z]}
              radius={Math.min(0.25, size.y / 4)}
              smoothness={4}
              position={[centre.x, centre.y, centre.z]}
              castShadow
              receiveShadow
              {...surfaceHandlers(placed.id)}
            >
              <meshStandardMaterial
                map={rockTexture}
                color={hovered ? '#756e66' : selected ? '#d6ad3a' : ROCK_COLOR}
                roughness={0.92}
              />
            </RoundedBox>
          )
        }

        const tinted = colourAll || hovered
        const tint = result ? rgbToCss(supportColor(result.support, body.material)) : MATERIAL_BASE_COLOR[body.material]

        return (
          <PieceMesh
            key={placed.id}
            centre={centre}
            size={size}
            texture={textures[body.material]}
            color={tinted ? tint : MATERIAL_BASE_COLOR[body.material]}
            emissive={tinted ? tint : '#000000'}
            emissiveIntensity={tinted ? (hovered ? 0.55 : 0.28) : 0}
            outline={hovered ? '#f4f1e8' : selected ? '#e4be55' : null}
            collapsing={collapsing}
            handlers={surfaceHandlers(placed.id)}
          />
        )
      })}

      {/* Support Floating Tag over Hovered Piece */}
      {hoveredId ? (() => {
        const body = bodies.get(hoveredId)
        const result = solution.bodies.get(hoveredId)
        if (!body || !result || body.kind === 'static') return null
        const centre = boxCentre(body)
        const tint = rgbToCss(supportColor(result.support, body.material))

        return (
          <Html position={[centre.x, body.max.y + 0.45, centre.z]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
            <div className="flex items-center gap-2 whitespace-nowrap rounded-full border border-white/20 bg-black/85 px-3 py-1.5 text-[12px] font-bold tabular-nums text-white shadow-2xl backdrop-blur-md">
              <span className="inline-block size-2.5 rounded-full" style={{ background: tint, boxShadow: `0 0 6px ${tint}` }} />
              <span>{Math.round(result.support)}</span>
              <span className="text-[10px] font-normal text-white/60">/ {MATERIAL_PROPERTIES[body.material].maxSupport}</span>
              {result.collapses ? <span className="text-[11px] font-bold text-[#ff6060]">⚠️ COLLAPSE</span> : null}
            </div>
          </Html>
        )
      })() : null}

      {/* Ghost placement box */}
      {ghost ? <GhostBox ghost={ghost} /> : null}
    </group>
  )
}

interface SurfaceHandlers {
  onPointerMove: (event: ThreeEvent<PointerEvent>) => void
  onPointerOut: (event: ThreeEvent<PointerEvent>) => void
  onPointerDown: (event: ThreeEvent<PointerEvent>) => void
  onPointerUp: (event: ThreeEvent<PointerEvent>) => void
}

interface PieceMeshProps {
  centre: Vec3
  size: Vec3
  texture: THREE.Texture
  color: string
  emissive: string
  emissiveIntensity: number
  outline: string | null
  collapsing: boolean
  handlers: SurfaceHandlers
}

function PieceMesh({ centre, size, texture, color, emissive, emissiveIntensity, outline, collapsing, handlers }: PieceMeshProps) {
  const group = useRef<THREE.Group>(null)
  const material = useRef<THREE.MeshStandardMaterial>(null)
  const map = useMemo(() => {
    const clone = texture.clone()
    clone.repeat.set(Math.max(0.5, Math.max(size.x, size.z) / 2), Math.max(0.5, size.y / 2))
    clone.needsUpdate = true
    return clone
  }, [size.x, size.y, size.z, texture])
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x, size.y, size.z)), [size.x, size.y, size.z])

  // Collapsing pieces pulse with red warning
  useFrame(({ clock }) => {
    if (!collapsing || !group.current || !material.current) return
    const pulse = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 5)
    material.current.opacity = 0.35 + pulse * 0.45
    group.current.rotation.z = Math.sin(clock.elapsedTime * 3) * 0.025
  })

  return (
    <group ref={group} position={[centre.x, centre.y, centre.z]}>
      <mesh castShadow={!collapsing} receiveShadow {...handlers}>
        <boxGeometry args={[size.x, size.y, size.z]} />
        <meshStandardMaterial
          ref={material}
          map={map}
          color={collapsing ? '#ff2222' : color}
          emissive={collapsing ? '#ff2222' : emissive}
          emissiveIntensity={collapsing ? 0.7 : emissiveIntensity}
          roughness={0.82}
          metalness={0.08}
          transparent={collapsing}
          opacity={collapsing ? 0.55 : 1}
        />
      </mesh>
      {outline || collapsing ? (
        <lineSegments geometry={edges} raycast={() => null}>
          <lineBasicMaterial color={collapsing ? '#ff4040' : outline ?? '#ffffff'} transparent opacity={0.95} />
        </lineSegments>
      ) : null}
    </group>
  )
}

function GhostBox({ ghost }: { ghost: GhostPlacement }) {
  const size = { x: ghost.max.x - ghost.min.x, y: ghost.max.y - ghost.min.y, z: ghost.max.z - ghost.min.z }
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x, size.y, size.z)), [size.x, size.y, size.z])
  const colour = ghost.valid ? (ghost.snapped ? '#e4be55' : '#f4f1e8') : '#ff4b4b'

  return (
    <group position={[(ghost.min.x + ghost.max.x) / 2, (ghost.min.y + ghost.max.y) / 2, (ghost.min.z + ghost.max.z) / 2]}>
      <mesh raycast={() => null}>
        <boxGeometry args={[size.x, size.y, size.z]} />
        <meshStandardMaterial
          color={colour}
          emissive={colour}
          emissiveIntensity={0.35}
          transparent
          opacity={ghost.valid ? 0.45 : 0.55}
          depthWrite={false}
        />
      </mesh>
      <lineSegments geometry={edges} raycast={() => null}>
        <lineBasicMaterial color={colour} transparent opacity={0.95} />
      </lineSegments>
    </group>
  )
}

/** Frames the scene or moves camera to preset orientations. */
function CameraRig({
  bodies,
  fit,
  cameraPreset,
}: {
  bodies: Map<string, SimBody>
  fit: FitRequest
  cameraPreset?: { preset: CameraPreset; token: number }
}) {
  const camera = useThree((state) => state.camera)
  const controls = useThree((state) => state.controls) as { target: THREE.Vector3; update: () => void } | null
  const lastFitToken = useRef<number | null>(null)
  const lastPresetToken = useRef<number | null>(null)

  const bounds = useMemo(() => {
    let min = new THREE.Vector3(Infinity, Infinity, Infinity)
    let max = new THREE.Vector3(-Infinity, -Infinity, -Infinity)
    for (const body of bodies.values()) {
      min = min.min(new THREE.Vector3(body.min.x, body.min.y, body.min.z))
      max = max.max(new THREE.Vector3(body.max.x, body.max.y, body.max.z))
    }
    if (!Number.isFinite(min.x)) {
      min = new THREE.Vector3(-4, 0, -4)
      max = new THREE.Vector3(4, 4, 4)
    }
    min.y = Math.min(min.y, 0)
    const centre = min.clone().add(max).multiplyScalar(0.5)
    const radius = Math.max(3, max.clone().sub(min).length() / 2)
    return { centre, radius }
  }, [bodies])

  // Handle Fit / Frame Scene
  useEffect(() => {
    if (!controls || lastFitToken.current === fit.token) return
    lastFitToken.current = fit.token
    const { centre, radius } = bounds
    const perspective = camera as THREE.PerspectiveCamera
    const distance = (radius / Math.tan(THREE.MathUtils.degToRad(perspective.fov) / 2)) * 1.45
    const direction = new THREE.Vector3(1, 0.55, 1.2).normalize()
    const target = centre.clone().add(new THREE.Vector3(0, -radius * 0.12, 0))
    controls.target.copy(target)
    camera.position.copy(target.clone().add(direction.multiplyScalar(distance)))
    controls.update()
  }, [bounds, camera, controls, fit.token])

  // Handle Preset Camera Angles
  useEffect(() => {
    if (!controls || !cameraPreset || lastPresetToken.current === cameraPreset.token) return
    lastPresetToken.current = cameraPreset.token
    const { centre, radius } = bounds
    const perspective = camera as THREE.PerspectiveCamera
    const distance = Math.max(14, (radius / Math.tan(THREE.MathUtils.degToRad(perspective.fov) / 2)) * 1.5)
    const target = centre.clone().add(new THREE.Vector3(0, 0, 0))
    controls.target.copy(target)

    let dir = new THREE.Vector3(1, 0.6, 1.2).normalize()
    if (cameraPreset.preset === 'top') {
      dir = new THREE.Vector3(0.001, 1, 0.001).normalize()
    } else if (cameraPreset.preset === 'front') {
      dir = new THREE.Vector3(0, 0.2, 1).normalize()
    } else if (cameraPreset.preset === 'iso') {
      dir = new THREE.Vector3(1, 0.7, 1).normalize()
    }

    camera.position.copy(target.clone().add(dir.multiplyScalar(distance)))
    controls.update()
  }, [bounds, camera, cameraPreset, controls])

  return null
}

const boxCentre = (body: SimBody): Vec3 => ({
  x: (body.min.x + body.max.x) / 2,
  y: (body.min.y + body.max.y) / 2,
  z: (body.min.z + body.max.z) / 2,
})

const boxSize = (body: SimBody): Vec3 => ({
  x: body.max.x - body.min.x,
  y: body.max.y - body.min.y,
  z: body.max.z - body.min.z,
})
