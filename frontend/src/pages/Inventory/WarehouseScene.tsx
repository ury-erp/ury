import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { BoxEdges, RoundedBox, SceneControls, ShadowGround } from './scenePrimitives';
import { Vector3 } from 'three';
import { Spinner } from '@ury/ui';
import { formatCurrency } from '@ury/core';
import type { StockRow, WarehouseLayout, WarehouseSummary } from '../../services/inventory';
import {
  GOODS_COLOR,
  STAGNANT_COLOR,
  STATUS_COLOR,
  formatQty,
  healthColor,
  healthLabel,
  shortName,
  statusLabel,
  warehouseHealth,
} from './stockStatus';
import { t } from '../../i18n';

/**
 * The warehouses as buildings you can turn around and click into.
 *
 * Campus: every warehouse is a building inside its zone (its parent group).
 * Height follows stock value on a log scale — values here span thousands to
 * billions, and a linear height would leave every building but one flat; the
 * tooltip and the bar chart beside it carry the exact figures. The roof strip
 * is the warehouse's worst stock condition.
 *
 * Interior: one warehouse's racks, a rack per item group, a box per item.
 * Healthy stock is plain cardboard; low stock is amber, a negative balance
 * red, and an item that ran out is an empty red-outlined slot — the gap on
 * the shelf is the thing to notice.
 *
 * One Canvas lives for the whole page and only its contents change between
 * views. Labels and tooltips are plain DOM in this component's own tree, laid
 * over the canvas: labels are moved to their projected 3D points each frame
 * (written straight to style, no re-render), tooltips follow the pointer and
 * stay inside the frame. drei's <Html> was used first; it gives every label
 * its own React root attached to r3f's container, and switching views tore
 * those down out of order ("removeChild ... not a child of this node").
 * Rendering is on demand, so the GPU idles at rest.
 */

// ------------------------------------------------------------------ hover tooltip

type HoverFn = (content: React.ReactNode | null, e?: ThreeEvent<PointerEvent>) => void;

const Row: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex justify-between gap-4 py-0.5">
    <span className="text-gray-500">{label}</span>
    <span className="font-semibold tabular-nums text-gray-900">{value}</span>
  </div>
);

const Swatch: React.FC<{ color: string; label: string }> = ({ color, label }) => (
  <span className="mt-1 inline-flex items-center gap-1.5 font-semibold text-gray-800">
    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
    {label}
  </span>
);

function useHoverHandlers(content: () => React.ReactNode, onHover: HoverFn) {
  useEffect(
    () => () => {
      // Unmounted while pointed at (view switched under the cursor).
      document.body.style.cursor = '';
    },
    [],
  );
  return {
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      document.body.style.cursor = 'pointer';
      onHover(content(), e);
    },
    onPointerMove: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      onHover(undefined, e);
    },
    onPointerOut: () => {
      document.body.style.cursor = '';
      onHover(null);
    },
  };
}

// ------------------------------------------------------------------ campus layout

interface Placed {
  w: WarehouseSummary;
  x: number;
  z: number;
  size: number;
}

interface Zone {
  key: string;
  label: string;
  group: WarehouseSummary | null;
  x: number;
  z: number;
  width: number;
  depth: number;
  buildings: Placed[];
}

const CELL = 3.4;
const ZONE_PAD = 1.2;
const ZONE_GAP = 2.2;
const MAX_ROW_WIDTH = 34;

function buildCampus(warehouses: WarehouseSummary[], rootLabel: string) {
  const byName = new Map(warehouses.map((w) => [w.name, w]));
  const roots = new Set(warehouses.filter((w) => w.is_group && (!w.parent || !byName.has(w.parent))).map((w) => w.name));

  // A leaf belongs to the top-level group above it; leaves straight under the
  // root form the site's own zone.
  const zoneOf = (w: WarehouseSummary): string => {
    let cur = w;
    while (cur.parent && byName.has(cur.parent) && !roots.has(cur.parent)) cur = byName.get(cur.parent)!;
    return cur === w ? '__root__' : cur.name;
  };

  const groups = new Map<string, WarehouseSummary[]>();
  for (const w of warehouses) {
    if (w.is_group) continue;
    const key = w.parent && roots.has(w.parent) ? '__root__' : zoneOf(w);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(w);
  }

  const zones: Zone[] = [];
  for (const [key, members] of groups) {
    // Main warehouse first, then by value: the important building leads.
    members.sort((a, b) => Number(b.is_main) - Number(a.is_main) || b.stock_value - a.stock_value);
    const cols = Math.ceil(Math.sqrt(members.length));
    const rows = Math.ceil(members.length / cols);
    zones.push({
      key,
      label: key === '__root__' ? rootLabel : shortName(byName.get(key)?.label || key),
      group: key === '__root__' ? null : byName.get(key) || null,
      x: 0,
      z: 0,
      width: cols * CELL + ZONE_PAD * 2,
      depth: rows * CELL + ZONE_PAD * 2,
      buildings: members.map((w, i) => ({
        w,
        x: ZONE_PAD + (i % cols) * CELL + CELL / 2,
        z: ZONE_PAD + Math.floor(i / cols) * CELL + CELL / 2,
        size: w.is_main ? 2.7 : 2.1,
      })),
    });
  }
  zones.sort(
    (a, b) =>
      Number(b.buildings.some((p) => p.w.is_main)) - Number(a.buildings.some((p) => p.w.is_main)) ||
      Number(b.key === '__root__') - Number(a.key === '__root__') ||
      b.buildings.length - a.buildings.length,
  );

  // Shelf-pack the zones into rows.
  let x = 0;
  let z = 0;
  let rowDepth = 0;
  let maxX = 0;
  for (const zone of zones) {
    if (x > 0 && x + zone.width > MAX_ROW_WIDTH) {
      x = 0;
      z += rowDepth + ZONE_GAP;
      rowDepth = 0;
    }
    zone.x = x;
    zone.z = z;
    x += zone.width + ZONE_GAP;
    rowDepth = Math.max(rowDepth, zone.depth);
    maxX = Math.max(maxX, zone.x + zone.width);
  }
  const totalDepth = z + rowDepth;
  for (const zone of zones) {
    zone.x -= maxX / 2;
    zone.z -= totalDepth / 2;
  }
  return { zones, span: Math.max(maxX, totalDepth, 8) };
}

// ------------------------------------------------------------------ campus

const Building: React.FC<{
  placed: Placed;
  ox: number;
  oz: number;
  height: number;
  selected: boolean;
  onSelect: (name: string) => void;
  onHover: HoverFn;
}> = ({ placed, ox, oz, height, selected, onSelect, onHover }) => {
  const [hover, setHover] = useState(false);
  const { w, size } = placed;
  const health = warehouseHealth(w);
  const roof = healthColor(health);

  // Pallet stacks inside, one per item up to a 3x3 floor; deterministic heights
  // so the picture does not shuffle between renders.
  const pallets = useMemo(() => {
    const n = Math.min(w.item_count, 9);
    const step = (size - 0.6) / 3;
    return Array.from({ length: n }, (_, i) => ({
      x: -size / 2 + 0.3 + step / 2 + (i % 3) * step,
      z: -size / 2 + 0.3 + step / 2 + Math.floor(i / 3) * step,
      h: Math.max(0.18, (height - 0.35) * (0.45 + ((i * 37) % 50) / 100)),
      s: step * 0.78,
    }));
  }, [w.item_count, size, height]);

  const handlers = useHoverHandlers(
    () => (
      <>
        <p className="mb-1 text-sm font-bold text-gray-900">{shortName(w.label)}</p>
        {w.is_main && <p className="mb-1 text-[11px] font-semibold text-primary">★ {t('dash.inventory.main_warehouse')}</p>}
        <Row label={t('dash.inventory.stock_value')} value={formatCurrency(w.stock_value)} />
        <Row label={t('dash.inventory.items_in_stock')} value={w.item_count} />
        {w.low_count > 0 && <Row label={t('dash.inventory.status_low')} value={w.low_count} />}
        {w.out_count > 0 && <Row label={t('dash.inventory.status_out')} value={w.out_count} />}
        {w.negative_count > 0 && <Row label={t('dash.inventory.status_negative')} value={w.negative_count} />}
        <Swatch color={roof} label={healthLabel(health)} />
        <p className="mt-1 text-[10px] text-gray-400">{t('dash.inventory.click_to_open')}</p>
      </>
    ),
    onHover,
  );

  return (
    <group position={[ox + placed.x, 0, oz + placed.z]}>
      {(selected || hover) && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
          <ringGeometry args={[size * 0.78, size * 0.86, 48]} />
          <meshBasicMaterial color={selected ? '#2a78d6' : '#86b6ef'} />
        </mesh>
      )}

      <group
        onPointerOver={(e) => {
          setHover(true);
          handlers.onPointerOver(e);
        }}
        onPointerMove={handlers.onPointerMove}
        onPointerOut={() => {
          setHover(false);
          handlers.onPointerOut();
        }}
        onClick={(e) => {
          e.stopPropagation();
          onHover(null);
          onSelect(w.name);
        }}
      >
        {/* Floor slab */}
        <mesh position={[0, 0.05, 0]} receiveShadow>
          <boxGeometry args={[size, 0.1, size]} />
          <meshStandardMaterial color="#d6d3cc" />
        </mesh>
        {/* Glass walls so the goods read through */}
        <mesh position={[0, 0.1 + height / 2, 0]}>
          <boxGeometry args={[size, height, size]} />
          <meshStandardMaterial color="#e9eef5" transparent opacity={hover ? 0.32 : 0.22} depthWrite={false} />
          <BoxEdges args={[size, height, size]} color={hover ? '#2a78d6' : '#8b97a8'} />
        </mesh>
        {/* Goods */}
        {pallets.map((p, i) => (
          <mesh key={i} position={[p.x, 0.1 + p.h / 2, p.z]} castShadow>
            <boxGeometry args={[p.s, p.h, p.s]} />
            <meshStandardMaterial color={w.stagnant_count >= w.item_count && w.item_count > 0 ? STAGNANT_COLOR : GOODS_COLOR} />
          </mesh>
        ))}
        {/* Roof strip: the warehouse's worst condition */}
        <RoundedBox args={[size + 0.12, 0.14, size + 0.12]} radius={0.04} position={[0, 0.17 + height, 0]} castShadow>
          <meshStandardMaterial color={roof} emissive={roof} emissiveIntensity={hover ? 0.35 : 0.08} />
        </RoundedBox>
        {/* Door on the camera-facing side */}
        <mesh position={[0, 0.1 + Math.min(0.55, height * 0.45) / 2, size / 2 + 0.005]}>
          <planeGeometry args={[size * 0.32, Math.min(0.55, height * 0.45)]} />
          <meshStandardMaterial color="#475569" />
        </mesh>
      </group>

    </group>
  );
};

const ZoneFloor: React.FC<{ zone: Zone }> = ({ zone }) => (
  <RoundedBox
    args={[zone.width, 0.04, zone.depth]}
    radius={0.2}
    position={[zone.x + zone.width / 2, 0, zone.z + zone.depth / 2]}
    receiveShadow
  >
    <meshStandardMaterial color="#e8edf3" />
  </RoundedBox>
);

function heightScale(warehouses: WarehouseSummary[]) {
  const maxValue = Math.max(...warehouses.filter((w) => !w.is_group).map((w) => w.stock_value), 1);
  return (value: number) => (value > 0 ? 0.6 + 2.6 * (Math.log10(1 + value) / Math.log10(1 + maxValue)) : 0.45);
}

const Campus: React.FC<{
  zones: Zone[];
  heightOf: (value: number) => number;
  selected?: string | null;
  onSelect: (name: string) => void;
  onHover: HoverFn;
}> = ({ zones, heightOf, selected, onSelect, onHover }) => {
  return (
    <>
      {zones.map((zone) => (
        <group key={zone.key}>
          <ZoneFloor zone={zone} />
          {zone.buildings.map((p) => (
            <Building
              key={p.w.name}
              placed={p}
              ox={zone.x}
              oz={zone.z}
              height={heightOf(p.w.stock_value)}
              selected={selected === p.w.name}
              onSelect={onSelect}
              onHover={onHover}
            />
          ))}
        </group>
      ))}
    </>
  );
};

// ------------------------------------------------------------------ interior

const SLOT = 0.62;
const LEVELS = [0.12, 0.92, 1.72];
const RACK_GAP_X = 1.0;
const RACK_GAP_Z = 2.4;
const RACKS_PER_ROW = 3;

const ItemBox: React.FC<{
  item: StockRow;
  position: [number, number, number];
  size: number;
  highlighted: boolean;
  onPick: (code: string) => void;
  onHover: HoverFn;
}> = ({ item, position, size, highlighted, onPick, onHover }) => {
  const [hover, setHover] = useState(false);
  const empty = item.status === 'out';
  const color =
    item.status === 'low' || item.status === 'negative' ? STATUS_COLOR[item.status] : item.stagnant ? STAGNANT_COLOR : GOODS_COLOR;
  const lift = hover || highlighted ? 0.06 : 0;
  const swatch = item.status === 'ok' ? (item.stagnant ? STAGNANT_COLOR : GOODS_COLOR) : STATUS_COLOR[item.status];

  const handlers = useHoverHandlers(
    () => (
      <>
        <p className="mb-1 text-sm font-bold text-gray-900">{item.item_name}</p>
        <Row label={t('dash.inventory.qty')} value={`${formatQty(item.actual_qty)} ${item.stock_uom}`} />
        <Row label={t('dash.inventory.stock_value')} value={formatCurrency(item.stock_value)} />
        {item.reorder_level > 0 && <Row label={t('dash.inventory.reorder_level')} value={formatQty(item.reorder_level)} />}
        <Swatch color={swatch} label={item.stagnant && item.status === 'ok' ? t('dash.inventory.stagnant') : statusLabel(item.status)} />
      </>
    ),
    onHover,
  );

  return (
    <group position={[position[0], position[1] + size / 2 + lift, position[2]]}>
      <mesh
        castShadow={!empty}
        onPointerOver={(e) => {
          setHover(true);
          handlers.onPointerOver(e);
        }}
        onPointerMove={handlers.onPointerMove}
        onPointerOut={() => {
          setHover(false);
          handlers.onPointerOut();
        }}
        onClick={(e) => {
          e.stopPropagation();
          onPick(item.item_code);
        }}
      >
        <boxGeometry args={[size, size, size]} />
        {empty ? (
          <meshBasicMaterial color={STATUS_COLOR.out} transparent opacity={hover ? 0.18 : 0.06} depthWrite={false} />
        ) : (
          <meshStandardMaterial color={color} emissive={highlighted ? '#2a78d6' : '#000000'} emissiveIntensity={highlighted ? 0.35 : 0} />
        )}
        {(empty || hover || highlighted) && <BoxEdges args={[size, size, size]} color={empty ? STATUS_COLOR.out : '#2a78d6'} />}
      </mesh>
    </group>
  );
};

const RACK_TOP = LEVELS[LEVELS.length - 1] + 0.75;

const Rack: React.FC<{
  items: StockRow[];
  x: number;
  z: number;
  width: number;
  maxValue: number;
  highlighted?: string | null;
  onPick: (code: string) => void;
  onHover: HoverFn;
}> = ({ items, x, z, width, maxValue, highlighted, onPick, onHover }) => {
  const perLevel = Math.ceil(items.length / LEVELS.length);
  const postH = RACK_TOP;
  const posts: [number, number][] = [
    [-width / 2, -0.35],
    [width / 2, -0.35],
    [-width / 2, 0.35],
    [width / 2, 0.35],
  ];
  return (
    <group position={[x, 0, z]}>
      {posts.map(([px, pz], i) => (
        <mesh key={i} position={[px, postH / 2, pz]} castShadow>
          <boxGeometry args={[0.06, postH, 0.06]} />
          <meshStandardMaterial color="#475569" />
        </mesh>
      ))}
      {LEVELS.map((y, i) => (
        <mesh key={i} position={[0, y, 0]} receiveShadow castShadow>
          <boxGeometry args={[width + 0.06, 0.05, 0.8]} />
          <meshStandardMaterial color="#94a3b8" />
        </mesh>
      ))}
      {items.map((item, i) => {
        const share = maxValue > 0 ? Math.sqrt(Math.max(item.stock_value, 0) / maxValue) : 0;
        return (
          <ItemBox
            key={item.item_code}
            item={item}
            size={item.status === 'out' ? 0.42 : 0.26 + 0.22 * share}
            position={[-width / 2 + SLOT / 2 + 0.05 + (i % perLevel) * SLOT, LEVELS[Math.floor(i / perLevel)] + 0.025, 0]}
            highlighted={highlighted === item.item_code}
            onPick={onPick}
            onHover={onHover}
          />
        );
      })}
    </group>
  );
};

function interiorPlan(layout: WarehouseLayout) {
  const racks = layout.racks.map((r) => ({ ...r, width: Math.max(1.6, Math.ceil(r.items.length / LEVELS.length) * SLOT + 0.1) }));
  const rowWidth = (row: typeof racks) => row.reduce((s, r) => s + r.width, 0) + (row.length - 1) * RACK_GAP_X;
  const rows: (typeof racks)[] = [];
  for (let i = 0; i < racks.length; i += RACKS_PER_ROW) rows.push(racks.slice(i, i + RACKS_PER_ROW));
  const floorW = Math.max(6, ...rows.map(rowWidth)) + 2;
  const floorD = Math.max(5, rows.length * RACK_GAP_Z + 1.5);
  // Rows centred front-to-back, so the camera's centre is the racks' centre.
  const firstZ = -((rows.length - 1) * RACK_GAP_Z) / 2;
  const placed = rows.flatMap((row, ri) => {
    let cursor = -rowWidth(row) / 2;
    return row.map((rack) => {
      const x = cursor + rack.width / 2;
      cursor += rack.width + RACK_GAP_X;
      return { ...rack, x, z: firstZ + ri * RACK_GAP_Z };
    });
  });
  return { rows, placed, floorW, floorD };
}

const Interior: React.FC<{
  layout: WarehouseLayout;
  plan: ReturnType<typeof interiorPlan>;
  highlighted?: string | null;
  onPick: (code: string) => void;
  onHover: HoverFn;
}> = ({ layout, plan, highlighted, onPick, onHover }) => {
  const maxValue = Math.max(...layout.racks.flatMap((r) => r.items.map((i) => i.stock_value)), 1);
  const { rows, placed, floorW, floorD } = plan;
  return (
    <>
      <RoundedBox args={[floorW, 0.06, floorD]} radius={0.15} position={[0, -0.03, 0]} receiveShadow>
        <meshStandardMaterial color="#e8edf3" />
      </RoundedBox>
      {/* Aisle markings */}
      {rows.slice(1).map((_, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, -((rows.length - 1) * RACK_GAP_Z) / 2 + (i + 0.5) * RACK_GAP_Z]}>
          <planeGeometry args={[floorW - 1, 0.05]} />
          <meshBasicMaterial color="#fab219" />
        </mesh>
      ))}
      {placed.map((rack) => (
        <Rack
          key={rack.item_group}
          items={rack.items}
          x={rack.x}
          z={rack.z}
          width={rack.width}
          maxValue={maxValue}
          highlighted={highlighted}
          onPick={onPick}
          onHover={onHover}
        />
      ))}
    </>
  );
};

// ------------------------------------------------------------------ labels

interface Label {
  id: string;
  position: [number, number, number];
  node: React.ReactNode;
  onClick?: () => void;
}

/** Moves each label's DOM node to its 3D point's place on screen, on every rendered frame. */
const LabelProjector: React.FC<{ labels: Label[]; nodes: React.MutableRefObject<Map<string, HTMLElement>> }> = ({
  labels,
  nodes,
}) => {
  const v = useMemo(() => new Vector3(), []);
  const invalidate = useThree((s) => s.invalidate);
  // New labels need one frame to be placed.
  useEffect(() => invalidate(), [labels, invalidate]);
  useFrame(({ camera, size }) => {
    for (const label of labels) {
      const el = nodes.current.get(label.id);
      if (!el) continue;
      v.set(label.position[0], label.position[1], label.position[2]).project(camera);
      const behind = v.z > 1;
      el.style.transform = `translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px) translate(-50%, -50%)`;
      el.style.visibility = behind ? 'hidden' : 'visible';
    }
  });
  return null;
};

// ------------------------------------------------------------------ camera

/** Frames each view from its own vantage point and makes that the "reset" position. */
const CameraRig: React.FC<{ viewKey: string; distance: number; resetSignal: number }> = ({ viewKey, distance, resetSignal }) => {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as {
    target: { set: (x: number, y: number, z: number) => void };
    update: () => void;
    saveState: () => void;
    reset: () => void;
  } | null;
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    camera.position.set(distance * 0.62, distance * 0.62, distance * 0.78);
    camera.lookAt(0, 0.6, 0);
    if (controls) {
      controls.target.set(0, 0.6, 0);
      controls.update();
      controls.saveState();
    }
    invalidate();
  }, [viewKey, distance, camera, controls, invalidate]);

  useEffect(() => {
    if (resetSignal && controls) {
      controls.reset();
      invalidate();
    }
  }, [resetSignal, controls, invalidate]);

  return null;
};

// ------------------------------------------------------------------ scene

export interface WarehouseSceneProps {
  mode: 'campus' | 'interior';
  warehouses?: WarehouseSummary[];
  rootLabel?: string;
  /** Interior only; null while it loads. */
  layout?: WarehouseLayout | null;
  selected?: string | null;
  highlighted?: string | null;
  resetSignal?: number;
  onSelect?: (name: string) => void;
  onPickItem?: (code: string) => void;
}

const WarehouseScene: React.FC<WarehouseSceneProps> = ({
  mode,
  warehouses = [],
  rootLabel = '',
  layout = null,
  selected,
  highlighted,
  resetSignal = 0,
  onSelect = () => undefined,
  onPickItem = () => undefined,
}) => {
  const frame = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ content: React.ReactNode; x: number; y: number } | null>(null);

  const campus = useMemo(() => buildCampus(warehouses, rootLabel), [warehouses, rootLabel]);
  const heightOf = useMemo(() => heightScale(warehouses), [warehouses]);
  const plan = useMemo(() => (layout ? interiorPlan(layout) : null), [layout]);
  const labelNodes = useRef(new Map<string, HTMLElement>());

  const labels: Label[] = useMemo(() => {
    if (mode === 'campus') {
      return campus.zones.flatMap((zone) => [
        {
          id: `zone:${zone.key}`,
          position: [zone.x + zone.width / 2, 0.05, zone.z + zone.depth + 0.35] as [number, number, number],
          onClick: zone.group ? () => onSelect(zone.group!.name) : undefined,
          node: (
            <>
              {zone.label}
              {zone.group ? ` · ${formatCurrency(zone.group.stock_value)}` : ''}
            </>
          ),
        },
        ...zone.buildings.filter((p) => p.w.is_main || p.w.item_count > 0 || p.w.out_count > 0 || p.w.negative_count > 0).map((p) => ({
          id: `wh:${p.w.name}`,
          position: [zone.x + p.x, heightOf(p.w.stock_value) + 0.55, zone.z + p.z] as [number, number, number],
          node: (
            <span
              className={`block whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-semibold shadow-sm ${
                p.w.is_main ? 'bg-gray-900 text-white' : 'bg-white/90 text-gray-800'
              }`}
            >
              {p.w.is_main && '★ '}
              {shortName(p.w.label)}
            </span>
          ),
        })),
      ]);
    }
    return (plan?.placed || []).map((rack) => ({
      id: `rack:${rack.item_group}`,
      position: [rack.x, RACK_TOP + 0.3, rack.z] as [number, number, number],
      node: (
        <span className="block whitespace-nowrap rounded-md bg-slate-700 px-2 py-0.5 text-[10px] font-bold text-white shadow">
          {rack.item_group} · {rack.items.length}
        </span>
      ),
    }));
  }, [mode, campus, heightOf, plan, onSelect]);
  const distance =
    mode === 'campus' ? Math.max(15, campus.span * 1.12) : plan ? Math.max(9, Math.max(plan.floorW, plan.floorD) * 1.35) : 10;
  const viewKey = mode === 'campus' ? 'campus' : `interior:${layout?.warehouse || ''}`;

  // Pointing at nothing new after a view switch must not leave a stale tooltip.
  useEffect(() => setTip(null), [viewKey]);

  const onHover: HoverFn = useCallback((content, e) => {
    if (content === null) {
      setTip(null);
      return;
    }
    const rect = frame.current?.getBoundingClientRect();
    const x = e && rect ? e.nativeEvent.clientX - rect.left : 0;
    const y = e && rect ? e.nativeEvent.clientY - rect.top : 0;
    setTip((prev) => (content === undefined ? (prev ? { ...prev, x, y } : prev) : { content, x, y }));
  }, []);

  const width = frame.current?.clientWidth || 0;
  const height = frame.current?.clientHeight || 0;
  // Keep the tooltip inside the frame: flip to the other side of the pointer near an edge.
  const tipStyle: React.CSSProperties | undefined = tip
    ? {
        left: tip.x > width - 230 ? undefined : tip.x + 14,
        right: tip.x > width - 230 ? width - tip.x + 14 : undefined,
        top: tip.y > height - 170 ? undefined : tip.y + 14,
        bottom: tip.y > height - 170 ? height - tip.y + 14 : undefined,
      }
    : undefined;

  return (
    <div ref={frame} className="relative h-full w-full" onPointerLeave={() => setTip(null)}>
      <Canvas
        shadows
        frameloop="demand"
        dpr={[1, 2]}
        camera={{ position: [distance * 0.62, distance * 0.62, distance * 0.78], fov: 38, near: 0.1, far: 500 }}
        gl={{ antialias: true }}
      >
        <color attach="background" args={['#f6f7f9']} />
        <ambientLight intensity={0.75} />
        <directionalLight
          position={[12, 18, 10]}
          intensity={1.15}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-camera-left={-30}
          shadow-camera-right={30}
          shadow-camera-top={30}
          shadow-camera-bottom={-30}
        />
        <hemisphereLight args={['#ffffff', '#cbd5e1', 0.35]} />

        {mode === 'campus' ? (
          <Campus zones={campus.zones} heightOf={heightOf} selected={selected} onSelect={onSelect} onHover={onHover} />
        ) : layout && plan ? (
          <Interior layout={layout} plan={plan} highlighted={highlighted} onPick={onPickItem} onHover={onHover} />
        ) : null}
        <LabelProjector labels={labels} nodes={labelNodes} />

        <ShadowGround size={distance * 2 + 10} />
        <SceneControls minDistance={4} maxDistance={distance * 2.2} maxPolarAngle={Math.PI / 2.15} />
        <CameraRig viewKey={viewKey} distance={distance} resetSignal={resetSignal} />
      </Canvas>

      {/* Labels, placed by LabelProjector; hidden until their first frame. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {labels.map((label) => {
          const ref = (el: HTMLElement | null) => {
            if (el) labelNodes.current.set(label.id, el);
            else labelNodes.current.delete(label.id);
          };
          return label.onClick ? (
            <button
              key={label.id}
              ref={ref}
              type="button"
              dir="auto"
              onClick={label.onClick}
              className="pointer-events-auto absolute top-0 whitespace-nowrap rounded-full border border-primary/30 bg-white px-2.5 py-0.5 text-[11px] font-bold text-primary shadow-sm hover:bg-primary hover:text-white"
              style={{ visibility: 'hidden', left: 0 }}
            >
              {label.node}
            </button>
          ) : (
            <div
              key={label.id}
              ref={ref}
              dir="auto"
              className={`absolute top-0 ${label.id.startsWith('zone:') ? 'whitespace-nowrap rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-[11px] font-bold text-gray-600 shadow-sm' : ''}`}
              style={{ visibility: 'hidden', left: 0 }}
            >
              {label.node}
            </div>
          );
        })}
      </div>

      {mode === 'interior' && !layout && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#f6f7f9]/70">
          <Spinner className="w-6 h-6 text-primary" />
        </div>
      )}
      {mode === 'interior' && layout && layout.racks.length === 0 && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-lg bg-white px-4 py-2 text-sm text-gray-500 shadow">{t('dash.inventory.empty_warehouse')}</div>
        </div>
      )}

      {tip && (
        <div
          className="pointer-events-none absolute z-20 min-w-[190px] max-w-[260px] rounded-lg border border-gray-200 bg-white/95 px-3 py-2 text-xs text-gray-700 shadow-lg backdrop-blur"
          style={tipStyle}
        >
          {tip.content}
        </div>
      )}
    </div>
  );
};

export default WarehouseScene;
