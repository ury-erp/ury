import React, { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { BoxGeometry, EdgesGeometry } from 'three';
import { OrbitControls as OrbitControlsImpl } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/**
 * The few scene helpers the warehouse map needs, built on three.js itself.
 *
 * These were @react-three/drei components. drei pulls in camera-controls,
 * whose current release requires Node 22, and the Frappe Cloud bench builds
 * on Node 20 — so installing the app failed. The map used only these four
 * pieces, each a thin wrapper over a three.js class, so they live here now
 * and the app installs on any Node the bench runs.
 */

type Vec3 = [number, number, number];

const noRaycast = () => null;

/** A box with rounded edges; children are its material. */
export const RoundedBox: React.FC<{
  args: Vec3;
  radius?: number;
  smoothness?: number;
  position?: Vec3;
  castShadow?: boolean;
  receiveShadow?: boolean;
  children?: React.ReactNode;
}> = ({ args, radius = 0.05, smoothness = 4, children, ...props }) => {
  const [w, h, d] = args;
  const geometry = useMemo(() => {
    // three's geometry misbehaves when the radius exceeds half the thinnest side.
    const r = Math.max(0, Math.min(radius, Math.min(w, h, d) / 2 - 1e-4));
    return new RoundedBoxGeometry(w, h, d, smoothness, r);
  }, [w, h, d, radius, smoothness]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} {...props}>
      {children}
    </mesh>
  );
};

/** Outline of a box; placed inside the mesh it outlines. Never intercepts the pointer. */
export const BoxEdges: React.FC<{ args: Vec3; color: string }> = ({ args, color }) => {
  const [w, h, d] = args;
  const geometry = useMemo(() => {
    const box = new BoxGeometry(w, h, d);
    const edges = new EdgesGeometry(box);
    box.dispose();
    return edges;
  }, [w, h, d]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments geometry={geometry} raycast={noRaycast}>
      <lineBasicMaterial color={color} />
    </lineSegments>
  );
};

/** A see-through ground that only shows the shadows cast on it. */
export const ShadowGround: React.FC<{ size: number; opacity?: number }> = ({ size, opacity = 0.2 }) => (
  <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.012, 0]} receiveShadow raycast={noRaycast}>
    <planeGeometry args={[size, size]} />
    <shadowMaterial transparent opacity={opacity} />
  </mesh>
);

/**
 * Orbit controls registered as the scene's default controls (read back with
 * useThree((s) => s.controls)). Rendering is on demand, so every change —
 * including the damping glide after a drag — asks for the next frame.
 */
export const SceneControls: React.FC<{
  minDistance: number;
  maxDistance: number;
  maxPolarAngle: number;
  dampingFactor?: number;
}> = ({ minDistance, maxDistance, maxPolarAngle, dampingFactor = 0.12 }) => {
  const camera = useThree((s) => s.camera);
  const domElement = useThree((s) => s.gl.domElement);
  const invalidate = useThree((s) => s.invalidate);
  const set = useThree((s) => s.set);

  const controls = useMemo(() => new OrbitControlsImpl(camera, domElement), [camera, domElement]);

  useEffect(() => {
    const onChange = () => invalidate();
    controls.addEventListener('change', onChange);
    set({ controls });
    return () => {
      controls.removeEventListener('change', onChange);
      set({ controls: null });
      controls.dispose();
    };
  }, [controls, invalidate, set]);

  useEffect(() => {
    controls.enableDamping = true;
    controls.dampingFactor = dampingFactor;
    controls.minDistance = minDistance;
    controls.maxDistance = maxDistance;
    controls.maxPolarAngle = maxPolarAngle;
    controls.update();
    invalidate();
  }, [controls, minDistance, maxDistance, maxPolarAngle, dampingFactor, invalidate]);

  useFrame(() => controls.update(), -1);
  return null;
};
