<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch, nextTick } from 'vue';
import { getImageUrl, type Recipe } from '../services/api';
import type { UITypeConfig } from '../services/uiTypeMapping';
import { useSound } from '../services/sound.service';
import { buildInputSlots, buildOutputSlots, type ResolvedSlot } from '../composables/useRecipeSlots';
import RecipeItemTooltip from './RecipeItemTooltip.vue';
import AnimatedItemIcon from './AnimatedItemIcon.vue';

interface Props {
  recipe: Recipe;
  uiConfig?: UITypeConfig;
}

interface Emits {
  (e: 'item-click', itemId: string): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();
const { playClick } = useSound();

const inputs = ref<ResolvedSlot[]>([]);
const outputs = ref<ResolvedSlot[]>([]);

// Dynamic Astrolabe rotation speeds for the portal visual elements
const outerRotationSpeed = ref(60);
const innerRotationSpeed = ref(45);

// === Particle System Coordinates ===
const inputCoords = ref<{ x: number; y: number }[]>([]);
const outputCoords = ref<{ x: number; y: number }[]>([]);
const portalCoord = ref<{ x: number; y: number }>({ x: 0, y: 0 });

// Interactive slot hover feedback tracking
const hoveredSlot = ref<{ type: 'input' | 'output'; index: number } | null>(null);

// === Mana Sparkle Canvas Particle System ===
const bgCanvas = ref<HTMLCanvasElement | null>(null);
const uiRoot = ref<HTMLElement | null>(null);
let animFrameId = 0;
let resizeObs: ResizeObserver | null = null;

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  decay: number;
  color: string;
}

interface SlotSpark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  decay: number;
  color: string;
  originX: number;
  originY: number;
  type: 'input' | 'output';
  slotIndex: number;
}

interface VortexParticle {
  id: number;
  type: 'input' | 'output';
  slotIndex: number;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  startFrame: number;
  endFrame: number;
  turns: number;
  color: string;
  size: number;
  alpha: number;
  seed: number;
  arrived: boolean;
}

interface IdleMist {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  decay: number;
  color: string;
  maxLife: number;
  life: number;
}

interface DriftParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  decay: number;
  color: string;
  rotation: number;
  rotSpeed: number;
  type: 'leaf' | 'petal' | 'spore' | 'rune';
  wiggleSeed: number;
  wiggleSpeed: number;
}

interface PortalRipple {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
  speed: number;
  color: string;
}

const SPARKS_LIMIT = 26;
let sparks: Spark[] = [];
let slotSparks: SlotSpark[] = [];
let vortexParticles: VortexParticle[] = [];
let idleMistParticles: IdleMist[] = [];
let driftParticles: DriftParticle[] = [];
let ripples: PortalRipple[] = [];
let frameCount = 0;
let lastResonanceFrame = 0;
let particleIdCounter = 0;
const portalFlashAlpha = ref(0);

const RGB_CYAN = '94, 234, 212';
const RGB_GREEN = '52, 211, 153';
const RGB_GOLD = '251, 191, 36';
const RGB_EMERALD = '16, 185, 129';

let cW = 0;
let cH = 0;

// Norse/Elven ancient runes for the orbiting portal ring
const RUNES = ['ᚠ', 'ᚢ', 'ᚦ', 'ᚨ', 'ᚱ', 'ᚲ', 'ᚷ', 'ᚹ', 'ᚺ', 'ᚾ', 'ᛁ', 'ᛃ', 'ᛇ', 'ᛈ', 'ᛉ', 'ᛊ'];

// Ancient nature colors: Moss green, Forest emerald, Mystic cyan, Amber wood, Lichen pale
const COLORS = [
  'rgba(94, 234, 212, ',   // Mystic Cyan
  'rgba(16, 185, 129, ',   // Forest Emerald
  'rgba(46, 117, 89, ',    // Moss Green
  'rgba(217, 119, 6, ',    // Warm Wood Amber
  'rgba(251, 191, 36, ',   // Ancient Gold
];

const initSparks = () => {
  sparks = [];
  for (let i = 0; i < SPARKS_LIMIT; i++) {
    sparks.push(createSpark(true));
  }
};

const createSpark = (randomY = false): Spark => {
  const colorPrefix = COLORS[Math.floor(Math.random() * COLORS.length)];
  return {
    x: Math.random() * cW,
    y: Math.random() * cH, // Spawn randomly all over the canvas (not just bottom)
    vx: (Math.random() - 0.5) * 0.10, // Very slow multidirectional drift
    vy: (Math.random() - 0.5) * 0.10,
    radius: 0.6 + Math.random() * 1.2,
    alpha: 0.12 + Math.random() * 0.38,
    decay: 0.0004 + Math.random() * 0.0008, // Long-lived drift particles
    color: colorPrefix,
  };
};

const spawnDriftParticle = (randomPos = false, startX?: number, startY?: number) => {
  const types = ['spore', 'leaf', 'petal', 'rune'] as const;
  const type = types[Math.floor(Math.random() * types.length)];
  
  let color = '';
  if (type === 'spore') color = Math.random() < 0.5 ? 'rgba(251, 191, 36, ' : 'rgba(217, 119, 6, ';
  else if (type === 'leaf') color = Math.random() < 0.5 ? 'rgba(16, 185, 129, ' : 'rgba(46, 117, 89, ';
  else if (type === 'petal') color = 'rgba(52, 211, 153, ';
  else color = 'rgba(94, 234, 212, '; // Cyan runes

  let x = 0;
  let y = 0;

  if (startX !== undefined && startY !== undefined) {
    x = startX;
    y = startY;
  } else if (randomPos) {
    x = Math.random() * cW;
    y = Math.random() * cH;
  } else {
    // Spawn along borders
    const border = Math.floor(Math.random() * 4);
    if (border === 0) { // Top
      x = Math.random() * cW;
      y = -15;
    } else if (border === 1) { // Bottom
      x = Math.random() * cW;
      y = cH + 15;
    } else if (border === 2) { // Left
      x = -15;
      y = Math.random() * cH;
    } else { // Right
      x = cW + 15;
      y = Math.random() * cH;
    }
  }

  driftParticles.push({
    x,
    y,
    vx: (Math.random() - 0.5) * 0.25, // Extremely slow drift speed
    vy: (Math.random() - 0.5) * 0.25,
    radius: type === 'rune' ? 6.0 : 1.2 + Math.random() * 1.8,
    alpha: 0.35 + Math.random() * 0.45,
    decay: 0.0001 + Math.random() * 0.0003, // Very long lived so they wander around
    color,
    rotation: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 0.015,
    type,
    wiggleSeed: Math.random() * 100,
    wiggleSpeed: 0.005 + Math.random() * 0.01,
  });
};

const drawManaSparkle = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, alpha: number, color: string) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.quadraticCurveTo(0, 0, size, 0);
  ctx.quadraticCurveTo(0, 0, 0, size);
  ctx.quadraticCurveTo(0, 0, -size, 0);
  ctx.quadraticCurveTo(0, 0, 0, -size);
  ctx.closePath();
  ctx.fillStyle = `${color}${alpha})`;
  ctx.fill();

  // Core white flare
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.35, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
  ctx.fill();
  ctx.restore();
};

const getBezierPoint = (
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  t: number
) => {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;
  return {
    x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
    y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y,
  };
};

const drawLeaf = (ctx: CanvasRenderingContext2D, s: DriftParticle) => {
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(s.rotation);
  ctx.beginPath();
  ctx.moveTo(0, -s.radius * 1.8);
  ctx.quadraticCurveTo(s.radius * 0.9, 0, 0, s.radius * 1.8);
  ctx.quadraticCurveTo(-s.radius * 0.9, 0, 0, -s.radius * 1.8);
  ctx.closePath();
  ctx.fillStyle = `${s.color}${s.alpha})`;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0, -s.radius * 1.3);
  ctx.lineTo(0, s.radius * 1.3);
  ctx.strokeStyle = `rgba(167, 243, 208, ${s.alpha * 0.6})`;
  ctx.lineWidth = 0.5;
  ctx.stroke();
  ctx.restore();
};

const drawPetal = (ctx: CanvasRenderingContext2D, s: DriftParticle) => {
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(s.rotation);
  ctx.beginPath();
  ctx.moveTo(0, -s.radius * 1.5);
  ctx.bezierCurveTo(s.radius * 1.2, -s.radius * 0.8, s.radius * 0.8, s.radius * 1.5, 0, s.radius * 1.5);
  ctx.bezierCurveTo(-s.radius * 0.8, s.radius * 1.5, -s.radius * 1.2, -s.radius * 0.8, 0, -s.radius * 1.5);
  ctx.closePath();
  ctx.fillStyle = `${s.color}${s.alpha})`;
  ctx.fill();
  ctx.restore();
};

const drawSpore = (ctx: CanvasRenderingContext2D, s: DriftParticle) => {
  drawManaSparkle(ctx, s.x, s.y, s.radius * 1.5, s.alpha, s.color);
};

const drawDriftRune = (ctx: CanvasRenderingContext2D, s: DriftParticle) => {
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(s.rotation);
  ctx.font = '8px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowBlur = 3;
  ctx.shadowColor = `${s.color}0.85)`;
  ctx.fillStyle = `${s.color}${s.alpha})`;
  
  const runeChar = RUNES[Math.floor(s.wiggleSeed) % RUNES.length];
  ctx.fillText(runeChar, 0, 0);
  ctx.restore();
};

const drawWindingVine = (ctx: CanvasRenderingContext2D, startY: number, endY: number, xBase: number, side: 'left' | 'right') => {
  ctx.save();
  ctx.beginPath();
  const segments = 40;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const y = startY + t * (endY - startY);
    // Sine wave oscillation for vine winding
    const osc = Math.sin(y * 0.08 + frameCount * 0.02) * 4.5;
    const x = xBase + (side === 'left' ? osc : -osc);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = 'rgba(16, 185, 129, 0.7)'; // Ancient green
  ctx.lineWidth = 1.1;
  ctx.stroke();

  // Draw leaves and runes along the vine
  const numNodes = 7;
  ctx.font = '8px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 1; i < numNodes; i++) {
    const t = i / numNodes;
    const y = startY + t * (endY - startY);
    const osc = Math.sin(y * 0.08 + frameCount * 0.02) * 4.5;
    const x = xBase + (side === 'left' ? osc : -osc);
    
    if (i % 2 === 0) {
      // Draw tiny botanical leaves branching off
      ctx.beginPath();
      ctx.ellipse(x + (side === 'left' ? 4 : -4), y, 3, 1.5, (side === 'left' ? 1 : -1) * Math.PI / 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(52, 211, 153, 0.65)';
      ctx.fill();
    } else {
      // Draw tiny glowing green/cyan runes
      const rune = RUNES[(i + Math.floor(frameCount * 0.01)) % RUNES.length];
      ctx.fillStyle = 'rgba(94, 234, 212, 0.85)';
      ctx.fillText(rune, x + (side === 'left' ? -6 : 6), y);
    }
  }
  ctx.restore();
};

const drawTopArcVine = (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) => {
  ctx.save();
  ctx.beginPath();
  const segments = 50;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const theta = Math.PI + t * Math.PI; // from left to right arc
    const osc = Math.sin(theta * 8 + frameCount * 0.02) * 3.5;
    const x = cx + Math.cos(theta) * (r + osc);
    const y = cy + Math.sin(theta) * (r + osc);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = 'rgba(16, 185, 129, 0.7)';
  ctx.lineWidth = 1.1;
  ctx.stroke();

  // Nodes for leaves/runes
  const numNodes = 8;
  ctx.font = '8px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 1; i < numNodes; i++) {
    const t = i / numNodes;
    const theta = Math.PI + t * Math.PI;
    const osc = Math.sin(theta * 8 + frameCount * 0.02) * 3.5;
    const x = cx + Math.cos(theta) * (r + osc);
    const y = cy + Math.sin(theta) * (r + osc);

    if (i % 2 === 0) {
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(theta) * 4, y + Math.sin(theta) * 4, 3, 1.5, theta + Math.PI / 4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(52, 211, 153, 0.65)';
      ctx.fill();
    } else {
      const rune = RUNES[(i + 4 + Math.floor(frameCount * 0.01)) % RUNES.length];
      ctx.fillStyle = 'rgba(94, 234, 212, 0.85)';
      ctx.fillText(rune, x + Math.cos(theta) * 8, y + Math.sin(theta) * 8);
    }
  }
  ctx.restore();
};

const drawGeometricVortex = (ctx: CanvasRenderingContext2D, cx: number, cy: number, maxRadius: number) => {
  ctx.save();
  ctx.lineWidth = 0.55;
  ctx.shadowBlur = 2;
  
  // Hypotrochoid math for overlapping curves
  const R = maxRadius;
  const r = R * 0.6;
  const d = R * 0.5;
  const segments = 180;
  const rotation = frameCount * 0.005;

  ctx.beginPath();
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 10;
    const angle = theta + rotation;

    const px = (R - r) * Math.cos(angle) + d * Math.cos(((R - r) / r) * angle);
    const py = (R - r) * Math.sin(angle) - d * Math.sin(((R - r) / r) * angle);

    const sx = cx + px * 0.85;
    const sy = cy + py * 1.25;

    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  }
  ctx.strokeStyle = 'rgba(94, 234, 212, 0.4)'; // Shimmering teal lines
  ctx.shadowColor = 'rgba(94, 234, 212, 0.35)';
  ctx.stroke();

  // Reverse rotating golden spirograph
  const R2 = maxRadius * 0.75;
  const r2 = R2 * 0.5;
  const d2 = R2 * 0.7;
  const rotation2 = -frameCount * 0.007;

  ctx.beginPath();
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 8;
    const angle = theta + rotation2;

    const px = (R2 - r2) * Math.cos(angle) + d2 * Math.cos(((R2 - r2) / r2) * angle);
    const py = (R2 - r2) * Math.sin(angle) - d2 * Math.sin(((R2 - r2) / r2) * angle);

    const sx = cx + px * 0.85;
    const sy = cy + py * 1.25;

    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  }
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.3)'; // Shimmering gold lines
  ctx.shadowColor = 'rgba(251, 191, 36, 0.25)';
  ctx.stroke();

  ctx.restore();
};

const drawGeometricSeal = (ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) => {
  ctx.save();
  ctx.lineWidth = 0.5;
  const numVertices = 8;
  const rotation = frameCount * 0.003;
  ctx.strokeStyle = 'rgba(16, 185, 129, 0.22)'; // Ethereal green lines
  
  const vertices: { x: number; y: number }[] = [];
  for (let i = 0; i < numVertices; i++) {
    const angle = rotation + (i / numVertices) * Math.PI * 2;
    vertices.push({
      x: cx + Math.cos(angle) * size * 0.85,
      y: cy + Math.sin(angle) * size * 1.25,
    });
  }
  
  for (let i = 0; i < numVertices; i++) {
    for (let j = i + 1; j < numVertices; j++) {
      ctx.beginPath();
      ctx.moveTo(vertices[i].x, vertices[i].y);
      ctx.lineTo(vertices[j].x, vertices[j].y);
      ctx.stroke();
    }
  }
  ctx.restore();
};

const drawGeometricGateFrame = (ctx: CanvasRenderingContext2D, cx: number, bottomY: number, w: number, h: number) => {
  const topY = bottomY - h;
  const arcCenterY = topY + w / 2;
  const r = w / 2;

  ctx.save();
  ctx.shadowBlur = 3;
  ctx.lineWidth = 0.85;

  const green = 'rgba(16, 185, 129, ';
  const cyan = 'rgba(94, 234, 212, ';
  const gold = 'rgba(251, 191, 36, ';

  // 1. Concentric Nested Arches (3 layers, thin vector style)
  const scales = [1.0, 0.9, 0.8];
  scales.forEach((scale, idx) => {
    const sw = w * scale;
    const sh = h * scale;
    const sBottomY = bottomY;
    const sTopY = sBottomY - sh;
    const sArcCenterY = sTopY + sw / 2;
    const sr = sw / 2;

    ctx.beginPath();
    ctx.moveTo(cx - sr, sBottomY);
    ctx.lineTo(cx - sr, sArcCenterY);
    ctx.arc(cx, sArcCenterY, sr, Math.PI, 0, false);
    ctx.lineTo(cx + sr, sBottomY);
    
    ctx.strokeStyle = idx === 0 ? `${cyan}0.55)` : (idx === 1 ? `${green}0.45)` : `${gold}0.35)`);
    ctx.shadowColor = idx === 0 ? 'rgba(94, 234, 212, 0.4)' : 'rgba(16, 185, 129, 0.3)';
    ctx.stroke();
  });

  // 2. Parabolic String-Art Envelope Mesh
  const divisions = 14;
  ctx.strokeStyle = `${green}0.22)`;
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= divisions; i++) {
    const t = i / divisions;
    const y1 = bottomY - t * (bottomY - arcCenterY);
    const xLeft = cx - t * (w / 2);
    const xRight = cx + t * (w / 2);
    
    // Left mesh line
    ctx.beginPath();
    ctx.moveTo(cx - w / 2, y1);
    ctx.lineTo(xLeft, bottomY);
    ctx.stroke();

    // Right mesh line
    ctx.beginPath();
    ctx.moveTo(cx + w / 2, y1);
    ctx.lineTo(xRight, bottomY);
    ctx.stroke();
  }

  // 3. Mathematical tick marks (ticks along the outer arch curve)
  ctx.strokeStyle = `${gold}0.45)`;
  ctx.lineWidth = 0.8;
  const numTicks = 32;
  for (let i = 0; i <= numTicks; i++) {
    const angle = Math.PI + (i / numTicks) * Math.PI;
    const xStart = cx + Math.cos(angle) * r;
    const yStart = arcCenterY + Math.sin(angle) * r;
    const xEnd = cx + Math.cos(angle) * (r + 4);
    const yEnd = arcCenterY + Math.sin(angle) * (r + 4);

    ctx.beginPath();
    ctx.moveTo(xStart, yStart);
    ctx.lineTo(xEnd, yEnd);
    ctx.stroke();
  }

  // 4. Concentric coordinate target circles (radar-like grid)
  ctx.strokeStyle = `${cyan}0.08)`;
  ctx.lineWidth = 0.5;
  for (let rad = 20; rad <= 120; rad += 25) {
    ctx.beginPath();
    ctx.arc(cx, arcCenterY, rad, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 5. Center crosshair ticks
  ctx.strokeStyle = `${gold}0.35)`;
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(cx - 6, arcCenterY);
  ctx.lineTo(cx + 6, arcCenterY);
  ctx.moveTo(cx, arcCenterY - 6);
  ctx.lineTo(cx, arcCenterY + 6);
  ctx.stroke();

  ctx.restore();
};

// --- ELVEN GATE RIFT: SWIRLING PHYLLOTAXIS PORTAL INSIDE GEOMETRIC ART ARCH ---
const drawPhyllotaxisPortal = (ctx: CanvasRenderingContext2D, portalCenter: { x: number; y: number }) => {
  const w = 76;
  const h = 120;
  const bottomY = portalCenter.y + 60; // relative to the portal-core bottom
  const topY = bottomY - h;
  const arcCenterY = topY + w / 2;
  const cx = portalCenter.x;
  const cy = bottomY - 65;

  // Clip the interior vortex effects within the arch boundary (no solid background colors)
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx - w / 2, bottomY);
  ctx.lineTo(cx - w / 2, arcCenterY);
  ctx.arc(cx, arcCenterY, w / 2, Math.PI, 0, false);
  ctx.lineTo(cx + w / 2, bottomY);
  ctx.closePath();
  ctx.clip();

  // 1. Draw the Rotating Complete Octagonal Graph (Geometric Star Seal)
  drawGeometricSeal(ctx, cx, cy, 32);

  // 2. Draw the Concentric Intersecting Spirograph (Hypotrochoid curves)
  drawGeometricVortex(ctx, cx, cy, 38);

  // 3. Sparse, tiny mana sparkles inside (no thick fill)
  const numPoints = 14;
  const timeOffset = frameCount * 0.01;
  const goldenAngle = 137.5 * (Math.PI / 180);
  for (let i = 0; i < numPoints; i++) {
    const theta = i * goldenAngle + timeOffset * 1.2;
    const r = 2.5 * Math.sqrt(i) * (1.0 + Math.sin(frameCount * 0.015 - i * 0.15) * 0.08);

    const px = cx + Math.cos(theta) * r * 0.8;
    const py = cy + Math.sin(theta) * r * 1.2;

    const alpha = (1 - (i / numPoints)) * 0.65;
    const size = 0.8 + (1 - (i / numPoints)) * 1.2;

    drawManaSparkle(ctx, px, py, size, alpha, 'rgba(94, 234, 212, ');
  }

  // 4. Central mathematical origin dot
  drawManaSparkle(ctx, cx, cy, 2.5, 0.85, 'rgba(255, 255, 255, ');

  ctx.restore();

  // 5. Draw the High-Math Geometric Vector Arch Frame
  drawGeometricGateFrame(ctx, cx, bottomY, w, h);

  // 6. Draw Winding Green Runic Vines around the archway columns & top arc
  drawWindingVine(ctx, arcCenterY, bottomY, cx - w / 2, 'left');
  drawWindingVine(ctx, arcCenterY, bottomY, cx + w / 2, 'right');
  drawTopArcVine(ctx, cx, arcCenterY, w / 2);
};

const updateSlotPositions = () => {
  const root = uiRoot.value;
  if (!root) return;
  const rect = root.getBoundingClientRect();

  // Find all inputs
  const inputEls = root.querySelectorAll('.slot-input');
  const inputsArr: { x: number; y: number }[] = [];
  inputEls.forEach(el => {
    const r = el.getBoundingClientRect();
    inputsArr.push({
      x: r.left - rect.left + r.width / 2,
      y: r.top - rect.top + r.height / 2,
    });
  });
  inputCoords.value = inputsArr;

  // Find all outputs
  const outputEls = root.querySelectorAll('.slot-output');
  const outputsArr: { x: number; y: number }[] = [];
  outputEls.forEach(el => {
    const r = el.getBoundingClientRect();
    outputsArr.push({
      x: r.left - rect.left + r.width / 2,
      y: r.top - rect.top + r.height / 2,
    });
  });
  outputCoords.value = outputsArr;

  // Find portal center
  const portalEl = root.querySelector('.portal-core');
  if (portalEl) {
    const r = portalEl.getBoundingClientRect();
    portalCoord.value = {
      x: r.left - rect.left + r.width / 2,
      y: r.top - rect.top + r.height / 2,
    };
  }
};

// === Soft Volumetric Mist Puff ===
const drawMistPuff = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  alpha: number,
  color: string
) => {
  ctx.save();
  const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
  grad.addColorStop(0, `rgba(${color}, ${alpha})`);
  grad.addColorStop(0.3, `rgba(${color}, ${alpha * 0.4})`);
  grad.addColorStop(1, `rgba(${color}, 0)`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

// === Grand Rotating Central Runic Seal ===
const drawGrandRunicSeal = (ctx: CanvasRenderingContext2D, cx: number, cy: number) => {
  ctx.save();
  
  // 1. Outer runic ring
  const outerR = 52;
  ctx.strokeStyle = 'rgba(94, 234, 212, 0.22)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
  ctx.stroke();
  
  ctx.font = '8px monospace';
  ctx.fillStyle = 'rgba(94, 234, 212, 0.6)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const outerRot = frameCount * 0.004;
  const outerCount = 12;
  for (let i = 0; i < outerCount; i++) {
    const angle = outerRot + (i / outerCount) * Math.PI * 2;
    const rx = cx + Math.cos(angle) * outerR;
    const ry = cy + Math.sin(angle) * outerR;
    const rune = RUNES[(i + Math.floor(frameCount * 0.002)) % RUNES.length];
    ctx.save();
    ctx.translate(rx, ry);
    ctx.rotate(angle + Math.PI / 2);
    ctx.fillText(rune, 0, 0);
    ctx.restore();
  }
  
  // 2. Inner rotating star (Octagram Star Wireframe)
  const starR = 36;
  const numPts = 8;
  const starRot = -frameCount * 0.005;
  const starVertices: { x: number; y: number }[] = [];
  for (let i = 0; i < numPts; i++) {
    const angle = starRot + (i / numPts) * Math.PI * 2;
    starVertices.push({
      x: cx + Math.cos(angle) * starR,
      y: cy + Math.sin(angle) * starR,
    });
  }
  ctx.strokeStyle = 'rgba(16, 185, 129, 0.24)';
  ctx.lineWidth = 0.5;
  for (let i = 0; i < numPts; i++) {
    for (let j = i + 1; j < numPts; j++) {
      // Connect vertices to draw octagram chords (skipping adjacent to form a star)
      if ((j - i) % 2 !== 0) {
        ctx.beginPath();
        ctx.moveTo(starVertices[i].x, starVertices[i].y);
        ctx.lineTo(starVertices[j].x, starVertices[j].y);
        ctx.stroke();
      }
    }
  }
  
  // 3. Inner gold runic ring
  const innerR = 20;
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.18)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
  ctx.stroke();
  
  ctx.font = '7px monospace';
  ctx.fillStyle = 'rgba(251, 191, 36, 0.5)';
  const innerRot = frameCount * 0.008;
  const innerCount = 6;
  for (let i = 0; i < innerCount; i++) {
    const angle = innerRot + (i / innerCount) * Math.PI * 2;
    const rx = cx + Math.cos(angle) * innerR;
    const ry = cy + Math.sin(angle) * innerR;
    const rune = RUNES[i % RUNES.length];
    ctx.save();
    ctx.translate(rx, ry);
    ctx.rotate(angle + Math.PI / 2);
    ctx.fillText(rune, 0, 0);
    ctx.restore();
  }
  
  // 4. Central magical spark seed
  drawManaSparkle(ctx, cx, cy, 3.0, 0.85, 'rgba(255, 255, 255, ');
  
  ctx.restore();
};


const drawManaAura = () => {
  const canvas = bgCanvas.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, cW, cH);
  frameCount++;

  const centerX = cW / 2;
  const centerY = cH / 2;

  // Find interactive mouse hover coordinate
  let attractTarget: { x: number; y: number } | null = null;
  if (hoveredSlot.value) {
    if (hoveredSlot.value.type === 'input' && hoveredSlot.value.index < inputCoords.value.length) {
      attractTarget = inputCoords.value[hoveredSlot.value.index];
    } else if (hoveredSlot.value.type === 'output' && hoveredSlot.value.index < outputCoords.value.length) {
      attractTarget = outputCoords.value[hoveredSlot.value.index];
    }
  }

  // 2. Update and draw background sparks (spores drifting randomly in 3D space)
  for (let i = 0; i < sparks.length; i++) {
    const s = sparks[i];
    s.x += s.vx;
    s.y += s.vy;
    s.alpha -= s.decay;

    // Gentle Brownian drift velocity shift
    s.vx += (Math.random() - 0.5) * 0.006;
    s.vy += (Math.random() - 0.5) * 0.006;
    s.vx = Math.max(-0.25, Math.min(0.25, s.vx));
    s.vy = Math.max(-0.25, Math.min(0.25, s.vy));

    if (attractTarget) {
      const adx = attractTarget.x - s.x;
      const ady = attractTarget.y - s.y;
      const adist = Math.sqrt(adx * adx + ady * ady);
      if (adist < 120) {
        s.vx += (adx / adist) * 0.014;
        s.vy += (ady / adist) * 0.014;
      }
    }

    if (s.alpha <= 0 || s.y < -10 || s.y > cH + 10 || s.x < -10 || s.x > cW + 10) {
      sparks[i] = createSpark(true);
      continue;
    }

    const twinkle = s.radius * (0.85 + Math.sin(frameCount * 0.05 + s.x) * 0.15);
    drawManaSparkle(ctx, s.x, s.y, twinkle, s.alpha, s.color);
  }

  // 3. Emit and update Idle Slot Mist & Slot Sparkles
  if (frameCount % 4 === 0) {
    // Inputs (Cyan/Green idle mist)
    inputCoords.value.forEach((p0) => {
      if (Math.random() < 0.15) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.15 + Math.random() * 0.25;
        const color = Math.random() < 0.5 ? RGB_CYAN : RGB_GREEN;
        idleMistParticles.push({
          x: p0.x + (Math.random() - 0.5) * 6,
          y: p0.y + (Math.random() - 0.5) * 6,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          radius: 12 + Math.random() * 8,
          alpha: 0.35 + Math.random() * 0.2,
          decay: 0.008 + Math.random() * 0.006,
          color,
          maxLife: 60 + Math.random() * 40,
          life: 0,
        });
      }
    });

    // Outputs (Gold idle mist)
    outputCoords.value.forEach((p0) => {
      if (Math.random() < 0.15) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.15 + Math.random() * 0.25;
        idleMistParticles.push({
          x: p0.x + (Math.random() - 0.5) * 6,
          y: p0.y + (Math.random() - 0.5) * 6,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          radius: 12 + Math.random() * 8,
          alpha: 0.35 + Math.random() * 0.2,
          decay: 0.008 + Math.random() * 0.006,
          color: RGB_GOLD,
          maxLife: 60 + Math.random() * 40,
          life: 0,
        });
      }
    });
  }

  // Draw and update idle mist particles
  for (let i = idleMistParticles.length - 1; i >= 0; i--) {
    const m = idleMistParticles[i];
    m.x += m.vx;
    m.y += m.vy;
    m.vx *= 0.96;
    m.vy *= 0.96;
    m.life++;
    const progress = m.life / m.maxLife;
    const currentAlpha = m.alpha * (1 - progress);

    if (progress >= 1 || currentAlpha <= 0) {
      idleMistParticles.splice(i, 1);
      continue;
    }

    drawMistPuff(ctx, m.x, m.y, m.radius * (1 + progress * 0.3), currentAlpha, m.color);
  }

  // Slot Sparkles (ambient sparkles around active input/output slots)
  if (frameCount % 3 === 0) {
    inputCoords.value.forEach((p0, idx) => {
      if (Math.random() < 0.12) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.2 + Math.random() * 0.3;
        slotSparks.push({
          x: p0.x,
          y: p0.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          radius: 0.6 + Math.random() * 0.8,
          alpha: 0.75 + Math.random() * 0.2,
          decay: 0.012 + Math.random() * 0.008,
          color: 'rgba(94, 234, 212, ',
          originX: p0.x,
          originY: p0.y,
          type: 'input',
          slotIndex: idx,
        });
      }
    });

    outputCoords.value.forEach((p0, idx) => {
      if (Math.random() < 0.12) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.2 + Math.random() * 0.3;
        slotSparks.push({
          x: p0.x,
          y: p0.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          radius: 0.6 + Math.random() * 0.8,
          alpha: 0.75 + Math.random() * 0.2,
          decay: 0.012 + Math.random() * 0.008,
          color: 'rgba(251, 191, 36, ',
          originX: p0.x,
          originY: p0.y,
          type: 'output',
          slotIndex: idx,
        });
      }
    });
  }

  // Update and draw slot sparkles
  for (let i = slotSparks.length - 1; i >= 0; i--) {
    const s = slotSparks[i];
    s.x += s.vx;
    s.y += s.vy;
    s.alpha -= s.decay;

    const dx = s.x - s.originX;
    const dy = s.y - s.originY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (s.alpha <= 0 || dist > 45) {
      slotSparks.splice(i, 1);
      continue;
    }

    const twinkle = s.radius * (0.8 + Math.sin(frameCount * 0.08 + s.x) * 0.2);
    drawManaSparkle(ctx, s.x, s.y, twinkle, s.alpha, s.color);
  }

  // 4. Update and draw vortex particles (Output expulsion synthesis flows)
  for (let i = vortexParticles.length - 1; i >= 0; i--) {
    const p = vortexParticles[i];

    if (frameCount < p.startFrame) {
      continue;
    }

    const totalFrames = p.endFrame - p.startFrame;
    const elapsed = frameCount - p.startFrame;
    const t = Math.max(0, Math.min(1, elapsed / totalFrames));

    let x = 0;
    let y = 0;

    // Spiraling OUTWARDS: portal center -> target output slot
    const dx = p.targetX - p.startX;
    const dy = p.targetY - p.startY;
    const R_target = Math.sqrt(dx * dx + dy * dy);
    const theta_target = Math.atan2(dy, dx);

    // Distance pushes out with decelerating ease-out curve
    const easeOutT = t * (2 - t);
    const r = R_target * easeOutT;
    // Angle wraps so it aligns perfectly on arrival
    const theta = theta_target - p.turns * Math.PI * 2 * (1 - t);

    x = p.startX + r * Math.cos(theta);
    y = p.startY + r * Math.sin(theta);

    // Interpolate alpha
    let alpha = 1.0;
    if (t < 0.2) {
      alpha = t / 0.2; // fade in
    } else if (t > 0.8) {
      alpha = (1 - t) / 0.2; // fade out
    }
    p.alpha = alpha;

    // Draw the mist puff
    drawMistPuff(ctx, x, y, p.size * (1 - t * 0.3), p.alpha * 0.75, p.color);

    // Core sharp sparkle inside the puff
    drawManaSparkle(ctx, x, y, p.size * 0.35 * (1 - t * 0.2), p.alpha, `rgba(${p.color}, `);

    // If reached destination, trigger burst effects
    if (t >= 1) {
      if (!p.arrived) {
        p.arrived = true;
        if (p.type === 'output') {
          // Spark explosion at output slot
          ripples.push({
            x: p.targetX,
            y: p.targetY,
            radius: 3,
            maxRadius: 18,
            alpha: 0.95,
            speed: 0.9,
            color: 'rgba(251, 191, 36, ',
          });

          const numExplode = 6;
          for (let e = 0; e < numExplode; e++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 0.8 + Math.random() * 1.6;
            sparks.push({
              x: p.targetX,
              y: p.targetY,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              radius: 0.6 + Math.random() * 1.2,
              alpha: 1.0,
              decay: 0.02 + Math.random() * 0.015,
              color: 'rgba(251, 191, 36, ',
            });
          }
        }
      }
      vortexParticles.splice(i, 1);
    }
  }

  // Draw expanding resonance shockwaves (ripples)
  for (let i = ripples.length - 1; i >= 0; i--) {
    const r = ripples[i];
    r.radius += r.speed;
    r.alpha -= r.speed / r.maxRadius;
    if (r.alpha <= 0) {
      ripples.splice(i, 1);
      continue;
    }

    ctx.save();
    ctx.lineWidth = 0.8;
    ctx.shadowBlur = 6;
    ctx.shadowColor = `${r.color}0.6)`;

    // Layer 1: Solid expansion ring
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
    ctx.strokeStyle = `${r.color}${r.alpha * 0.75})`;
    ctx.stroke();

    // Layer 2: Dashed frequency ring
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.radius * 1.25, 0, Math.PI * 2);
    ctx.strokeStyle = `${r.color}${r.alpha * 0.35})`;
    ctx.setLineDash([6, 8]);
    ctx.stroke();

    // Layer 3: Rotating rune ticks along the ring
    const numRuneTicks = 8;
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = `${r.color}${r.alpha * 0.65})`;
    for (let rt = 0; rt < numRuneTicks; rt++) {
      const angle = (rt / numRuneTicks) * Math.PI * 2 + frameCount * 0.012;
      const rx = r.x + Math.cos(angle) * r.radius * 1.1;
      const ry = r.y + Math.sin(angle) * r.radius * 1.1;
      const runeChar = RUNES[(rt + Math.floor(r.radius * 0.08)) % RUNES.length];
      ctx.fillText(runeChar, rx, ry);
    }

    ctx.restore();
  }

  // Draw central portal flash if active
  if (portalFlashAlpha.value > 0 && portalCoord.value.x > 0) {
    ctx.save();
    const flashGrad = ctx.createRadialGradient(
      portalCoord.value.x,
      portalCoord.value.y,
      0,
      portalCoord.value.x,
      portalCoord.value.y,
      95
    );
    flashGrad.addColorStop(0, `rgba(255, 255, 255, ${portalFlashAlpha.value * 0.95})`);
    flashGrad.addColorStop(0.3, `rgba(94, 234, 212, ${portalFlashAlpha.value * 0.75})`);
    flashGrad.addColorStop(1, 'rgba(94, 234, 212, 0)');
    ctx.fillStyle = flashGrad;
    ctx.beginPath();
    ctx.arc(portalCoord.value.x, portalCoord.value.y, 95, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    portalFlashAlpha.value -= 0.035; // decay portal flash
  }

  // 5. Draw Floating Holographic Ring of Ancient Runes (wrap the gate)
  if (portalCoord.value.x > 0) {
    ctx.save();
    ctx.translate(portalCoord.value.x, portalCoord.value.y);

    ctx.beginPath();
    ctx.arc(0, 0, 160, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(94, 234, 212, 0.03)';
    ctx.lineWidth = 0.6;
    ctx.stroke();

    ctx.font = '10px "Lucida Console", Monaco, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const numRunes = RUNES.length;
    const angleStep = (Math.PI * 2) / numRunes;
    const orbitRotation = -frameCount * 0.003;

    for (let i = 0; i < numRunes; i++) {
      const angle = i * angleStep + orbitRotation;
      const rx = Math.cos(angle) * 160;
      const ry = Math.sin(angle) * 160;

      const alpha = 0.25 + Math.sin(frameCount * 0.03 + i) * 0.25;
      const color = i % 2 === 0 ? 'rgba(94, 234, 212, ' : 'rgba(16, 185, 129, ';

      ctx.fillStyle = `${color}${alpha * 0.75})`;
      ctx.shadowColor = `${color}0.75)`;
      ctx.shadowBlur = 3;
      ctx.fillText(RUNES[i], rx, ry);
    }
    ctx.restore();
  }

  // 6. Draw Swirling Fermat's Spiral Portal Rift & Geometric Frame
  if (portalCoord.value.x > 0) {
    drawPhyllotaxisPortal(ctx, portalCoord.value);
  }

  // 7. Draw Grand Runic Seal in center
  if (portalCoord.value.x > 0) {
    drawGrandRunicSeal(ctx, portalCoord.value.x, portalCoord.value.y);
  }

  // 8. Restock background slow-moving wandering drift particles (limit to 24)
  const DRIFT_LIMIT = 24;
  while (driftParticles.length < DRIFT_LIMIT) {
    spawnDriftParticle(frameCount < 5); // first 5 frames: spawn anywhere on canvas; afterwards spawn along borders
  }

  // Occasionally spawn a wandering particle from one of the active input slots
  if (frameCount % 75 === 0 && inputCoords.value.length > 0 && driftParticles.length < 32) {
    const slotIdx = Math.floor(Math.random() * inputCoords.value.length);
    const p0 = inputCoords.value[slotIdx];
    spawnDriftParticle(false, p0.x, p0.y);
  }

  // 9. Update and draw wandering drift particles
  for (let i = driftParticles.length - 1; i >= 0; i--) {
    const s = driftParticles[i];

    // Slow Brownian random-walk drift velocities
    s.vx += (Math.random() - 0.5) * 0.008;
    s.vy += (Math.random() - 0.5) * 0.008;

    // Cap speed to make it "慢慢的就行" (very slow)
    const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
    const maxSpeed = 0.22;
    if (speed > maxSpeed) {
      s.vx = (s.vx / speed) * maxSpeed;
      s.vy = (s.vy / speed) * maxSpeed;
    }

    s.x += s.vx;
    s.y += s.vy;
    s.rotation += s.rotSpeed;
    s.alpha -= s.decay;

    // Hover attraction to slots
    if (attractTarget) {
      const adx = attractTarget.x - s.x;
      const ady = attractTarget.y - s.y;
      const adist = Math.sqrt(adx * adx + ady * ady);
      if (adist < 120) {
        s.vx += (adx / adist) * 0.012;
        s.vy += (ady / adist) * 0.012;
      }
    }

    // Portal gravity attraction (gentle pull when close to gate)
    if (portalCoord.value.x > 0) {
      const pdx = portalCoord.value.x - s.x;
      const pdy = portalCoord.value.y - s.y;
      const pdist = Math.sqrt(pdx * pdx + pdy * pdy);

      if (pdist < 150) {
        const pull = (1 - pdist / 150) * 0.008;
        s.vx += (pdx / pdist) * pull;
        s.vy += (pdy / pdist) * pull;
      }

      // Check collision with the middle gate
      if (pdist < 26) {
        driftParticles.splice(i, 1); // absorb particle

        const now = frameCount;
        // Check cooldown to avoid visual noise/clutter
        if (now - lastResonanceFrame > 110) {
          lastResonanceFrame = now;
          portalFlashAlpha.value = 1.0; // Flash the gate center

          // Trigger concentric runic ripples (expanding circles)
          ripples.push({
            x: portalCoord.value.x,
            y: portalCoord.value.y,
            radius: 8,
            maxRadius: 95,
            alpha: 1.0,
            speed: 1.8,
            color: s.color.startsWith('rgba(251') || s.color.startsWith('rgba(217') ? 'rgba(251, 191, 36, ' : 'rgba(94, 234, 212, ',
          });

          ripples.push({
            x: portalCoord.value.x,
            y: portalCoord.value.y,
            radius: 4,
            maxRadius: 70,
            alpha: 0.8,
            speed: 1.3,
            color: 'rgba(16, 185, 129, ',
          });

          // Trigger output slot expulsion spiral vortex flows
          if (outputCoords.value.length > 0) {
            outputCoords.value.forEach((targetSlot, oIdx) => {
              const numOut = 2;
              for (let o = 0; o < numOut; o++) {
                const startOffset = o * 6;
                vortexParticles.push({
                  id: particleIdCounter++,
                  type: 'output',
                  slotIndex: oIdx,
                  startX: portalCoord.value.x,
                  startY: portalCoord.value.y,
                  targetX: targetSlot.x,
                  targetY: targetSlot.y,
                  startFrame: now + startOffset,
                  endFrame: now + 50,
                  turns: (oIdx % 2 === 0 ? 1.5 : -1.5) * (0.8 + Math.random() * 0.6),
                  color: RGB_GOLD,
                  size: 6 + Math.random() * 5,
                  alpha: 1.0,
                  seed: Math.random() * 100,
                  arrived: false,
                });
              }
            });
          }

          // Sparks burst in the particle's original ancient color
          const numExplode = 10;
          for (let e = 0; e < numExplode; e++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1.0 + Math.random() * 2.0;
            sparks.push({
              x: portalCoord.value.x,
              y: portalCoord.value.y,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              radius: 0.7 + Math.random() * 1.3,
              alpha: 1.0,
              decay: 0.016 + Math.random() * 0.01,
              color: s.color,
            });
          }
        } else {
          // Cooldown puff (subtle touch response)
          const numExplode = 4;
          for (let e = 0; e < numExplode; e++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 0.5 + Math.random() * 0.8;
            sparks.push({
              x: portalCoord.value.x,
              y: portalCoord.value.y,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              radius: 0.5 + Math.random() * 0.7,
              alpha: 0.75,
              decay: 0.025 + Math.random() * 0.015,
              color: s.color,
            });
          }
        }
        continue;
      }
    }

    if (s.alpha <= 0 || s.y < -25 || s.y > cH + 25 || s.x < -25 || s.x > cW + 25) {
      driftParticles.splice(i, 1);
      continue;
    }

    if (s.type === 'leaf') {
      drawLeaf(ctx, s);
    } else if (s.type === 'petal') {
      drawPetal(ctx, s);
    } else if (s.type === 'spore') {
      drawSpore(ctx, s);
    } else if (s.type === 'rune') {
      drawDriftRune(ctx, s);
    }
  }

  animFrameId = requestAnimationFrame(drawManaAura);
};

const handleCanvasResize = () => {
  const canvas = bgCanvas.value;
  const el = uiRoot.value;
  if (!el || !canvas) return;
  const rect = el.getBoundingClientRect();
  cW = rect.width;
  cH = rect.height;
  canvas.width = cW;
  canvas.height = cH;
  if (sparks.length === 0) initSparks();
  updateSlotPositions();
};

async function initElven() {
  inputs.value = (await buildInputSlots(props.recipe)).slice(0, 12);
  outputs.value = await buildOutputSlots(props.recipe, 6);

  vortexParticles = [];
  idleMistParticles = [];
  slotSparks = [];
  driftParticles = [];
  ripples = [];
  sparks = [];
}

function slotGridStyle(count: number) {
  const safeCount = Math.max(1, count || 1);
  const columns = safeCount <= 1 ? 1 : safeCount <= 4 ? 2 : 3;
  return {
    gridTemplateColumns: `repeat(${columns}, 58px)`,
  };
}
function onItemClick(itemId: string) {
  playClick();
  emit('item-click', itemId);
}

function imageError(event: Event) {
  (event.target as HTMLImageElement).src = '/placeholder.png';
}

watch(
  () => props.recipe,
  async () => {
    await initElven();
    await nextTick();
    updateSlotPositions();
  },
  { deep: true, immediate: true },
);

onMounted(() => {
  handleCanvasResize();
  resizeObs = new ResizeObserver(handleCanvasResize);
  if (uiRoot.value) resizeObs.observe(uiRoot.value);
  animFrameId = requestAnimationFrame(drawManaAura);
  setTimeout(updateSlotPositions, 100);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(animFrameId);
  if (resizeObs) resizeObs.disconnect();
});
</script>

<template>
  <div class="elven-ui botania-elven-trade-ui" ref="uiRoot">
    <!-- Premium Backdrop (No Grid lines) -->
    <div class="portal-backdrop" aria-hidden="true" />
    <canvas ref="bgCanvas" class="mana-canvas" aria-hidden="true" />

    <div class="ambient-glow" aria-hidden="true">
      <span class="glow-orb orb-cyan" />
      <span class="glow-orb orb-emerald" />
    </div>

    <!-- LEFT: BORDERLESS INPUTS (OFFER) -->
    <section class="trade-bank offer-bank" aria-label="Elven Trade Offers">
      <div class="label title-cyan">OFFER</div>
      <div class="slot-grid" :style="slotGridStyle(inputs.length)">
        <div v-for="(slot, index) in inputs" :key="slot.itemId" class="glass-slot-wrapper">
          <RecipeItemTooltip :item-id="slot.itemId" :count="slot.count">
            <button
              class="glass-slot slot-input magnetic-hover"
              type="button"
              @click.stop="onItemClick(slot.itemId)"
              @mouseenter="hoveredSlot = { type: 'input', index }"
              @mouseleave="hoveredSlot = null"
            >
              <!-- Bobbing Item Icon -->
              <AnimatedItemIcon
                :item-id="slot.itemId"
                :render-asset-ref="slot.renderAssetRef || null"
                :image-file-name="slot.imageFileName || null"
                :size="42"
                class="item-icon"
                :style="{ animation: `float-bob 4.5s ease-in-out infinite`, animationDelay: `${index * 0.35}s` }"
              />
              <!-- Pulsing Shadow under item -->
              <div class="slot-shadow-glow" :style="{ animation: `shadow-pulse 4.5s ease-in-out infinite`, animationDelay: `${index * 0.35}s` }" />
            </button>
          </RecipeItemTooltip>
          <span v-if="slot.count > 1" class="slot-count">x{{ slot.count }}</span>
        </div>
      </div>
    </section>

    <!-- MIDDLE: ELVEN GATEWAYS PORTAL (Geometric Line Gate) -->
    <section class="portal" aria-label="Elven Gate Exchange Portal">
      <div class="portal-arc arc-a" :style="{ animationDuration: `${outerRotationSpeed}s` }" />
      <div class="portal-arc arc-b" :style="{ animationDuration: `${innerRotationSpeed}s` }" />
      
      <div class="portal-core">
        <div class="portal-glow" />
      </div>
      <div class="portal-label">ELVEN GATE EXCHANGE</div>
    </section>

    <!-- RIGHT: BORDERLESS OUTPUTS (RETURN) -->
    <section class="trade-bank output-bank" aria-label="Elven Trade Returns">
      <div class="label title-gold">RETURN</div>
      <div class="slot-grid" :style="slotGridStyle(outputs.length)">
        <div v-for="(slot, index) in outputs" :key="slot.itemId" class="glass-slot-wrapper">
          <RecipeItemTooltip :item-id="slot.itemId" :count="slot.count">
            <button
              class="glass-slot slot-output slot-gold magnetic-hover"
              type="button"
              @click.stop="onItemClick(slot.itemId)"
              @mouseenter="hoveredSlot = { type: 'output', index }"
              @mouseleave="hoveredSlot = null"
            >
              <!-- Bobbing Item Icon -->
              <AnimatedItemIcon
                :item-id="slot.itemId"
                :render-asset-ref="slot.renderAssetRef || null"
                :image-file-name="slot.imageFileName || null"
                :size="42"
                class="item-icon"
                :style="{ animation: `float-bob 4.5s ease-in-out infinite`, animationDelay: `${(index + inputs.length) * 0.35}s` }"
              />
              <!-- Pulsing Shadow under item -->
              <div class="slot-shadow-glow" :style="{ animation: `shadow-pulse 4.5s ease-in-out infinite`, animationDelay: `${(index + inputs.length) * 0.35}s` }" />
            </button>
          </RecipeItemTooltip>
          <span v-if="slot.count > 1" class="slot-count count-gold">x{{ slot.count }}</span>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.elven-ui {
  --cyan-glow: 103, 232, 249;
  --emerald-glow: 16, 185, 129;
  --gold-glow: 251, 191, 36;
  --pink-glow: 244, 114, 182;
  --ui-bg-gradient: linear-gradient(180deg, #050f0e 0%, #010406 100%);

  position: relative;
  width: 100%;
  height: 100%;
  max-width: none;
  min-height: 420px;
  box-sizing: border-box;
  background: var(--ui-bg-gradient);
  border: 1px solid rgba(94, 234, 212, 0.18);
  border-radius: 28px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.03),
    0 24px 56px rgba(0, 0, 0, 0.5),
    0 0 30px rgba(94, 234, 212, 0.04);
  padding: 20px 16px 72px 16px;
  display: grid;
  grid-template-columns: minmax(180px, 0.82fr) minmax(260px, 1.5fr) minmax(180px, 0.82fr);
  gap: clamp(10px, 1.4vw, 22px);
  align-items: stretch;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif;
  isolation: isolate;
  overflow: hidden;
}

/* Background & Canvas */
.portal-backdrop {
  position: absolute;
  inset: 0;
  border-radius: 28px;
  background: radial-gradient(circle at center, rgba(12, 60, 78, 0.12) 0%, transparent 80%);
  z-index: 1;
  pointer-events: none;
}

.mana-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 20;
  pointer-events: none;
}

.ambient-glow {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  overflow: hidden;
}

.glow-orb {
  position: absolute;
  border-radius: 50%;
  opacity: 0.35;
  will-change: transform, opacity;
  animation: drift-orb 15s ease-in-out infinite alternate;
}

.orb-cyan {
  width: 320px;
  height: 320px;
  left: 10%;
  top: 15%;
  background: radial-gradient(circle, rgba(var(--cyan-glow), 0.08) 0%, transparent 65%);
}

.orb-emerald {
  width: 270px;
  height: 270px;
  right: 10%;
  bottom: 12%;
  background: radial-gradient(circle, rgba(var(--emerald-glow), 0.08) 0%, transparent 65%);
  animation-delay: -5s;
}

.trade-bank, .portal {
  position: relative;
  z-index: 10;
}

.trade-bank {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 16px 10px;
}

.label {
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.2em;
}

.title-cyan {
  color: #67e8f9;
  text-shadow: 0 0 12px rgba(103, 232, 249, 0.4);
}

.title-gold {
  color: #fbbf24;
  text-shadow: 0 0 12px rgba(251, 191, 36, 0.4);
}

.slot-grid {
  display: grid;
  gap: 10px;
  justify-content: center;
  align-content: center;
}

.glass-slot-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.glass-slot {
  width: 58px;
  height: 58px;
  border-radius: 50%;
  background: transparent;
  border: none;
  box-shadow: none;
  display: flex;
  align-items: center;
  justify-content: center;
  outline: none;
  cursor: pointer;
  position: relative;
  transition: transform 0.4s ease;
}

/* Soft borderless radial glow on hover */
.glass-slot::before {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(103, 232, 249, 0.18) 0%, transparent 70%);
  opacity: 0;
  transition: opacity 0.35s ease;
  z-index: -1;
}

.glass-slot:hover::before {
  opacity: 1;
}

.slot-gold::before {
  background: radial-gradient(circle, rgba(251, 191, 36, 0.18) 0%, transparent 70%);
}

.item-icon {
  image-rendering: pixelated;
  filter: drop-shadow(0 4px 6px rgba(0,0,0,0.55));
  will-change: transform;
}

.magnetic-hover {
  transition: transform 0.45s cubic-bezier(0.18, 0.89, 0.32, 1.28);
}

.glass-slot:hover .item-icon {
  transform: translateY(-2px) scale(1.05);
}

/* Synced Floating Item & Shadow System */
@keyframes float-bob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-5px); }
}

.slot-shadow-glow {
  position: absolute;
  bottom: 6px;
  left: 50%;
  transform: translateX(-50%) scale(1);
  width: 22px;
  height: 5px;
  background: radial-gradient(circle, rgba(103, 232, 249, 0.4) 0%, transparent 80%);
  border-radius: 50%;
  pointer-events: none;
  z-index: -1;
  will-change: transform, opacity;
}
.slot-gold .slot-shadow-glow {
  background: radial-gradient(circle, rgba(251, 191, 36, 0.4) 0%, transparent 80%);
}

@keyframes shadow-pulse {
  0%, 100% {
    transform: translateX(-50%) scale(1.1);
    opacity: 0.85;
  }
  50% {
    transform: translateX(-50%) scale(0.7);
    opacity: 0.35;
  }
}

.slot-count {
  position: absolute;
  right: -4px;
  bottom: -4px;
  background: rgba(2, 8, 10, 0.95);
  border: 1px solid rgba(103, 232, 249, 0.24);
  border-radius: 6px;
  padding: 1px 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 10px;
  font-weight: 700;
  color: #e2e8f0;
  pointer-events: none;
  box-shadow: 0 4px 8px rgba(0,0,0,0.3);
}

.count-gold {
  border-color: rgba(251, 191, 36, 0.35);
  color: #fef08a;
}

/* Middle Portal Gate */
.portal {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 280px;
  min-width: 0;
  position: relative;
}

.portal-arc {
  position: absolute;
  border-radius: 50%;
  border: 0.8px solid rgba(103, 232, 249, 0.26);
  border-left-color: transparent;
  border-right-color: transparent;
  pointer-events: none;
  mix-blend-mode: screen;
  filter: drop-shadow(0 0 10px rgba(103, 232, 249, 0.15));
}

.arc-a {
  width: 350px;
  height: 350px;
  animation: spin-portal-arc 40s linear infinite;
}

.arc-b {
  width: 280px;
  height: 280px;
  border-color: rgba(244, 114, 182, 0.16);
  border-left-color: transparent;
  border-right-color: transparent;
  animation: spin-portal-arc 30s linear infinite reverse;
}

@keyframes spin-portal-arc {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.portal-core {
  position: relative;
  z-index: 2;
  width: 108px;
  height: 162px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
  background: transparent;
}

.portal-glow {
  position: absolute;
  width: 180px;
  height: 220px;
  border-radius: 50%;
  background: radial-gradient(ellipse, rgba(94, 234, 212, 0.12) 0%, rgba(16, 185, 129, 0.03) 50%, transparent 72%);
  animation: portal-breathe 6s ease-in-out infinite alternate;
  pointer-events: none;
}

@keyframes portal-breathe {
  0% { opacity: 0.65; transform: scale(0.96); }
  100% { opacity: 0.95; transform: scale(1.04); }
}

.portal-label {
  position: absolute;
  bottom: 12px;
  color: #e5fbff;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.16em;
  text-align: center;
  text-shadow: 0 1px 4px rgba(0,0,0,0.5);
}

@keyframes drift-orb {
  from { transform: translate3d(0, 0, 0) scale(0.95); opacity: 0.28; }
  to { transform: translate3d(8px, -12px, 0) scale(1.05); opacity: 0.42; }
}

/* Responsive columns scaling for narrow viewports */
@media (max-width: 640px) {
  .elven-ui {
    grid-template-columns: 1fr;
    min-height: auto;
    padding-bottom: 24px;
  }
  
  .trade-bank {
    padding: 12px;
  }

  .slot-grid {
    grid-template-columns: repeat(6, 58px);
  }

  .portal {
    margin: 24px 0;
  }
}
</style>
