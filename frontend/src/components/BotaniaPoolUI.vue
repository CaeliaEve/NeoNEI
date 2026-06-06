<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch, nextTick } from 'vue';
import type { Recipe } from '../services/api';
import type { UITypeConfig } from '../services/uiTypeMapping';
import { useSound } from '../services/sound.service';
import { buildInputSlots, buildOutputSlots, type ResolvedSlot } from '../composables/useRecipeSlots';
import { readPositiveIntegerMeta } from '../composables/ritualFamilyMetadata';
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
const manaCost = ref<number | null>(null);

// Standard Botania pool holds 1,000,000 mana
const POOL_CAPACITY = 1000000;

const manaText = computed(() => {
  if (manaCost.value !== null) {
    return `${manaCost.value.toLocaleString()} MANA`;
  }
  return 'MANA INFUSION';
});

const manaPercentage = computed(() => {
  if (manaCost.value === null) return 0;
  return Math.min(manaCost.value / POOL_CAPACITY, 1);
});

// Circular Progress Bar details (scaled down for compact layout)
const progressRadius = 80;
const circumference = 2 * Math.PI * progressRadius;
const strokeDashoffset = computed(() => {
  return circumference * (1 - manaPercentage.value);
});

// Dynamic Astrolabe rotation speeds based on mana amount (Full pool = faster rotation)
const sealRotationSpeed = computed(() => {
  return 120 - manaPercentage.value * 80;
});
const middleRotationSpeed = computed(() => {
  return 90 - manaPercentage.value * 60;
});
const innerRotationSpeed = computed(() => {
  return 72 - manaPercentage.value * 48;
});

// === Particle System Coordinates ===
const inputCoords = ref<{ x: number; y: number }[]>([]);
const outputCoords = ref<{ x: number; y: number }[]>([]);
const poolCoord = ref<{ x: number; y: number }>({ x: 0, y: 0 });

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

interface StreamParticle {
  type: 'input' | 'output';
  slotIndex: number;
  t: number;
  speed: number;
  size: number;
  color: string;
  seed: number;
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
  type: 'leaf' | 'petal' | 'spore';
  wiggleSeed: number;
  wiggleSpeed: number;
}

interface PoolRipple {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
  speed: number;
  color: string;
}

const SPARKS_LIMIT = 28;
const CONNECTION_DIST = 65;
let sparks: Spark[] = [];
let streamParticles: StreamParticle[] = [];
let driftParticles: DriftParticle[] = [];
let ripples: PoolRipple[] = [];
let frameCount = 0;

let cW = 0;
let cH = 0;

// Norse/Elven ancient runes for the orbiting ring
const RUNES = ['ᚠ', 'ᚢ', 'ᚦ', 'ᚨ', 'ᚱ', 'ᚲ', 'ᚷ', 'ᚹ', 'ᚺ', 'ᚾ', 'ᛁ', 'ᛃ', 'ᛇ', 'ᛈ', 'ᛉ', 'ᛊ'];

// Nature magic colors: Teal, Emerald green, Mint cyan, Golden yellow
const COLORS = [
  'rgba(94, 234, 212, ',   // Teal
  'rgba(52, 211, 153, ',   // Emerald
  'rgba(103, 232, 249, ',  // Mint
  'rgba(251, 191, 36, ',   // Gold
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
    y: randomY ? Math.random() * cH : cH + 10,
    vx: (Math.random() - 0.5) * 0.28,
    vy: -(0.2 + Math.random() * 0.38),
    radius: 0.8 + Math.random() * 1.5,
    alpha: 0.15 + Math.random() * 0.45,
    decay: 0.0006 + Math.random() * 0.0012,
    color: colorPrefix,
  };
};

const spawnDriftParticle = () => {
  const types = ['spore', 'leaf', 'petal'] as const;
  const type = types[Math.floor(Math.random() * types.length)];
  let color = '';
  if (type === 'spore') color = 'rgba(251, 191, 36, ';
  else if (type === 'leaf') color = 'rgba(16, 185, 129, ';
  else color = 'rgba(244, 114, 182, '; // Pixie pink

  driftParticles.push({
    x: poolCoord.value.x + (Math.random() - 0.5) * 40,
    y: poolCoord.value.y + (Math.random() - 0.5) * 12,
    vx: (Math.random() - 0.5) * 0.32,
    vy: -(0.35 + Math.random() * 0.45),
    radius: 1.0 + Math.random() * 1.6,
    alpha: 0.4 + Math.random() * 0.4,
    decay: 0.001 + Math.random() * 0.0015,
    color,
    rotation: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 0.03,
    type,
    wiggleSeed: Math.random() * 100,
    wiggleSpeed: 0.01 + Math.random() * 0.012,
  });
};

const getBezierPoint = (
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  t: number
) => {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x,
    y: mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y,
  };
};

// --- ICONIC BOTANIA 4-POINT TWINKLING SPARKLE ---
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

// --- ELVEN LEAF VECTOR DRAWING ---
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

  // Leaf vein highlight
  ctx.beginPath();
  ctx.moveTo(0, -s.radius * 1.3);
  ctx.lineTo(0, s.radius * 1.3);
  ctx.strokeStyle = `rgba(167, 243, 208, ${s.alpha * 0.65})`;
  ctx.lineWidth = 0.5;
  ctx.stroke();
  ctx.restore();
};

// --- PIXIE PETAL TEARDROP ---
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

// --- SPARKLE SPORE ---
const drawSpore = (ctx: CanvasRenderingContext2D, s: DriftParticle) => {
  drawManaSparkle(ctx, s.x, s.y, s.radius * 1.5, s.alpha, s.color);
};

// --- SACRED GEOMETRY: PHYLLOTAXIS (GOLDEN RATIO) SPIRAL ---
const drawPhyllotaxisSpiral = (ctx: CanvasRenderingContext2D, center: { x: number; y: number }) => {
  const numPoints = 30;
  const goldenAngle = 137.5 * (Math.PI / 180);
  const timeOffset = frameCount * 0.012;

  // Draw Fermat's spiral particles
  for (let i = 0; i < numPoints; i++) {
    const theta = i * goldenAngle + timeOffset;
    // Scale distance down slightly to match smaller pool
    const r = 4.0 * Math.sqrt(i) * (1.05 + Math.sin(frameCount * 0.02 - i * 0.15) * 0.08);

    // Flat isometric perspective squash (width: r, height: r * 0.45)
    const px = center.x + Math.cos(theta) * r;
    const py = center.y + Math.sin(theta) * r * 0.45;

    const ageFactor = i / numPoints;
    const alpha = (1 - ageFactor) * 0.65 * (0.85 + Math.sin(frameCount * 0.04 + i) * 0.15);
    const size = 1.2 + (1 - ageFactor) * 1.8;

    const color = i % 2 === 0 ? 'rgba(94, 234, 212, ' : 'rgba(52, 211, 153, ';
    drawManaSparkle(ctx, px, py, size, alpha, color);
  }

  // Central high-intensity Yggdrasil core spark representing concentrated mana heart
  drawManaSparkle(ctx, center.x, center.y, 4, 0.95, 'rgba(255, 255, 255, ');
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

  // Find pool center
  const poolEl = root.querySelector('.pool-sprite');
  if (poolEl) {
    const r = poolEl.getBoundingClientRect();
    poolCoord.value = {
      x: r.left - rect.left + r.width / 2,
      y: r.top - rect.top + r.height / 2,
    };
  } else {
    poolCoord.value = { x: cW / 2, y: cH / 2 };
  }
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

  // 1. Draw Constellation Ley-Line Connections
  for (let i = 0; i < sparks.length; i++) {
    for (let j = i + 1; j < sparks.length; j++) {
      const a = sparks[i];
      const b = sparks[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < CONNECTION_DIST) {
        const alpha = (1 - dist / CONNECTION_DIST) * 0.08 * Math.min(a.alpha, b.alpha);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = `rgba(52, 211, 153, ${alpha})`;
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }
  }

  // 2. Update and draw background sparks (as twinkling 4-point stars)
  for (let i = 0; i < sparks.length; i++) {
    const s = sparks[i];
    s.x += s.vx;
    s.y += s.vy;
    s.alpha -= s.decay;

    // Attraction to central pool
    const dx = centerX - s.x;
    const dy = centerY - s.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 95) {
      s.vx += (dx / dist) * 0.002;
      s.vy += (dy / dist) * 0.002;
    }

    // Hover attraction: pull sparkles gently toward hovered slot
    if (attractTarget) {
      const adx = attractTarget.x - s.x;
      const ady = attractTarget.y - s.y;
      const adist = Math.sqrt(adx * adx + ady * ady);
      if (adist < 120) {
        s.vx += (adx / adist) * 0.012;
        s.vy += (ady / adist) * 0.012;
      }
    }

    if (s.alpha <= 0 || s.y < -10 || s.x < -10 || s.x > cW + 10) {
      sparks[i] = createSpark(false);
      continue;
    }

    const twinkle = s.radius * (0.82 + Math.sin(frameCount * 0.06 + s.x) * 0.18);
    drawManaSparkle(ctx, s.x, s.y, twinkle, s.alpha, s.color);
  }

  // 3. Update and draw water surface ripples
  for (let i = ripples.length - 1; i >= 0; i--) {
    const r = ripples[i];
    r.radius += r.speed;
    r.alpha -= r.speed / r.maxRadius;
    if (r.alpha <= 0) {
      ripples.splice(i, 1);
      continue;
    }
    ctx.beginPath();
    ctx.ellipse(r.x, r.y, r.radius, r.radius * 0.45, 0, 0, Math.PI * 2);
    ctx.strokeStyle = `${r.color}${r.alpha})`;
    ctx.lineWidth = 0.85;
    ctx.stroke();
  }

  // 4. Draw Floating Holographic Ring of Ancient Runes (3D Orbit Perspective)
  if (poolCoord.value.x > 0) {
    ctx.save();
    ctx.translate(poolCoord.value.x, poolCoord.value.y - 1);
    
    // Draw the orbit boundary path line (scaled down for compact layout)
    ctx.beginPath();
    ctx.ellipse(0, 0, 80, 33, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(94, 234, 212, 0.04)';
    ctx.lineWidth = 0.6;
    ctx.stroke();

    ctx.font = '10px "Lucida Console", Monaco, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const numRunes = RUNES.length;
    const angleStep = (Math.PI * 2) / numRunes;
    const orbitRotation = frameCount * 0.004;

    for (let i = 0; i < numRunes; i++) {
      const angle = i * angleStep + orbitRotation;
      const rx = Math.cos(angle) * 80;
      const ry = Math.sin(angle) * 33;

      // Depth fade: ry > 0 is front, ry < 0 is back
      const depthFactor = (ry + 33) / 66; 
      const alpha = 0.12 + depthFactor * 0.58;

      // Color shift: runes in the front shift toward warm mint, back runes are cyan
      const rColor = depthFactor > 0.7 
        ? 'rgba(167, 243, 208, ' 
        : 'rgba(94, 234, 212, ';

      ctx.fillStyle = `${rColor}${alpha * 0.7})`;
      ctx.shadowColor = 'rgba(94, 234, 212, 0.7)';
      ctx.shadowBlur = 3;
      ctx.fillText(RUNES[i], rx, ry);
    }
    ctx.restore();
  }

  // 5. Draw Fermat's Spiral inside Pool
  if (poolCoord.value.x > 0) {
    drawPhyllotaxisSpiral(ctx, poolCoord.value);
  }

  // 6. Spawn stream particles from inputs -> pool
  if (frameCount % 24 === 0 && inputCoords.value.length > 0) {
    const slotIndex = Math.floor(Math.random() * inputCoords.value.length);
    streamParticles.push({
      type: 'input',
      slotIndex,
      t: 0,
      speed: 0.005 + Math.random() * 0.004,
      size: 1.5 + Math.random() * 1.2,
      color: 'rgba(94, 234, 212, ', // Teal
      seed: Math.random() * 100,
    });
  }

  // 7. Update and draw Bezier stream particles (shooting stars with trail)
  for (let i = streamParticles.length - 1; i >= 0; i--) {
    const s = streamParticles[i];
    s.t += s.speed;

    let p0, p3;
    if (s.type === 'input') {
      if (s.slotIndex >= inputCoords.value.length) {
        streamParticles.splice(i, 1);
        continue;
      }
      p0 = inputCoords.value[s.slotIndex];
      p3 = poolCoord.value;
    } else {
      if (s.slotIndex >= outputCoords.value.length) {
        streamParticles.splice(i, 1);
        continue;
      }
      p0 = poolCoord.value;
      p3 = outputCoords.value[s.slotIndex];
    }

    if (!p0 || !p3) {
      streamParticles.splice(i, 1);
      continue;
    }

    const p1 = { x: p0.x + (p3.x - p0.x) * 0.4, y: Math.min(p0.y, p3.y) - 45 };
    const p2 = { x: p0.x + (p3.x - p0.x) * 0.6, y: Math.min(p0.y, p3.y) - 45 };

    const pt = getBezierPoint(p0, p1, p2, p3, s.t);
    const wiggle = Math.sin(s.t * 22 + s.seed) * 4 * (1 - Math.pow(2 * s.t - 1, 2));
    const angle = Math.atan2(p3.y - p0.y, p3.x - p0.x) + Math.PI / 2;
    const x = pt.x + Math.cos(angle) * wiggle;
    const y = pt.y + Math.sin(angle) * wiggle;

    // Draw main particle
    const streamSize = s.size * (0.85 + Math.sin(frameCount * 0.12 + s.seed) * 0.15);
    drawManaSparkle(ctx, x, y, streamSize, 0.95, s.color);

    // Draw trailing sparkles
    for (let tOffset = 1; tOffset <= 3; tOffset++) {
      const prevT = Math.max(0, s.t - tOffset * 0.015);
      const prevPt = getBezierPoint(p0, p1, p2, p3, prevT);
      const prevWiggle = Math.sin(prevT * 22 + s.seed) * 4 * (1 - Math.pow(2 * prevT - 1, 2));
      const prevX = prevPt.x + Math.cos(angle) * prevWiggle;
      const prevY = prevPt.y + Math.sin(angle) * prevWiggle;
      const trailAlpha = 0.9 * (1 - tOffset * 0.28);
      const trailSize = streamSize * (1 - tOffset * 0.22);
      drawManaSparkle(ctx, prevX, prevY, trailSize, trailAlpha, s.color);
    }

    if (s.t >= 1) {
      if (s.type === 'input') {
        ripples.push({
          x: poolCoord.value.x + (Math.random() - 0.5) * 16,
          y: poolCoord.value.y + (Math.random() - 0.5) * 8,
          radius: 3,
          maxRadius: 22 + Math.random() * 10,
          alpha: 0.85,
          speed: 0.6 + Math.random() * 0.4,
          color: 'rgba(94, 234, 212, ',
        });

        // Spawn elven leaves/petals rising up
        const numDrifts = 2 + Math.floor(Math.random() * 2);
        for (let d = 0; d < numDrifts; d++) {
          spawnDriftParticle();
        }

        // Output stream particle
        if (outputCoords.value.length > 0) {
          const outIndex = Math.floor(Math.random() * outputCoords.value.length);
          streamParticles.push({
            type: 'output',
            slotIndex: outIndex,
            t: 0,
            speed: 0.006 + Math.random() * 0.004,
            size: 1.6 + Math.random() * 1.2,
            color: 'rgba(251, 191, 36, ', // Gold
            seed: Math.random() * 100,
          });
        }
      }
      streamParticles.splice(i, 1);
    }
  }

  // 8. Ambient drifting leaves and Pixie petals
  if (Math.random() < 0.035) {
    spawnDriftParticle();
  }

  // 9. Update and draw drift particles
  for (let i = driftParticles.length - 1; i >= 0; i--) {
    const s = driftParticles[i];
    s.y += s.vy;
    s.x += s.vx + Math.sin(s.y * s.wiggleSpeed + s.wiggleSeed) * 0.25;
    s.rotation += s.rotSpeed;
    s.alpha -= s.decay;

    // Hover attraction: pull sparks and spores gently toward hovered slot
    if (attractTarget) {
      const adx = attractTarget.x - s.x;
      const ady = attractTarget.y - s.y;
      const adist = Math.sqrt(adx * adx + ady * ady);
      if (adist < 120) {
        s.vx += (adx / adist) * 0.016;
        s.vy += (ady / adist) * 0.016;
      }
    }

    if (s.alpha <= 0 || s.y < -20 || s.x < -20 || s.x > cW + 20) {
      driftParticles.splice(i, 1);
      continue;
    }

    if (s.type === 'leaf') {
      drawLeaf(ctx, s);
    } else if (s.type === 'petal') {
      drawPetal(ctx, s);
    } else {
      drawSpore(ctx, s);
    }
  }

  animFrameId = requestAnimationFrame(drawManaAura);
};

const handleCanvasResize = () => {
  const el = uiRoot.value;
  const canvas = bgCanvas.value;
  if (!el || !canvas) return;
  const rect = el.getBoundingClientRect();
  cW = rect.width;
  cH = rect.height;
  canvas.width = cW;
  canvas.height = cH;
  if (sparks.length === 0) initSparks();
  updateSlotPositions();
};

async function initPool() {
  inputs.value = (await buildInputSlots(props.recipe)).slice(0, 8);
  outputs.value = await buildOutputSlots(props.recipe, 3);
  manaCost.value = readPositiveIntegerMeta(props.recipe, ['manaCost', 'mana', 'requiredMana', 'manaUsage', 'cost']);

  streamParticles = [];
  driftParticles = [];
  ripples = [];
}

function onItemClick(itemId: string) {
  playClick();
  emit('item-click', itemId);
}

watch(
  () => props.recipe,
  async () => {
    await initPool();
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
  <div class="mana-pool-ui" ref="uiRoot">
    <!-- Premium Backdrop -->
    <div class="pool-backdrop" aria-hidden="true" />
    <canvas ref="bgCanvas" class="mana-canvas" aria-hidden="true" />

    <div class="ambient-glow" aria-hidden="true">
      <span class="glow-orb orb-teal" />
      <span class="glow-orb orb-emerald" />
    </div>

    <!-- CELESTIAL ELVEN ALTAR LAYOUT -->
    <div class="altar-deck">
      
      <!-- LEFT: BORDERLESS INPUTS -->
      <section class="floating-panel panel-inputs" aria-label="Input Ingredients">
        <div class="panel-header">INPUT INGREDIENTS</div>
        <div class="slot-container" :class="{ 'grid-layout': inputs.length > 1 }">
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
                  :size="48"
                  class="item-icon"
                  :style="{ animation: `float-bob 4.5s ease-in-out infinite`, animationDelay: `${index * 0.45}s` }"
                />
                <!-- Pulsing Shadow under item -->
                <div class="slot-shadow-glow" :style="{ animation: `shadow-pulse 4.5s ease-in-out infinite`, animationDelay: `${index * 0.45}s` }" />
              </button>
            </RecipeItemTooltip>
            <span v-if="slot.count > 1" class="slot-count">x{{ slot.count }}</span>
          </div>
        </div>
      </section>

      <!-- MIDDLE: SPREADER CONDUIT & POOL ALTAR -->
      <div class="center-stage">
        
        <!-- SPREADER CONDUIT: Nested Rotating Focus Rings -->
        <div class="armillary-conduit" aria-hidden="true">
          <!-- Focal Thread -->
          <div class="focal-thread"></div>
          <!-- Conduit Tunnel -->
          <div class="armillary-tunnel">
            <div class="armillary-ring r-outer">
              <svg viewBox="0 0 100 100" class="ring-svg">
                <circle cx="50" cy="50" r="48" class="ring-track thin" />
                <circle cx="50" cy="50" r="42" class="ring-marks primary" stroke-dasharray="1 12" />
              </svg>
            </div>
            <div class="armillary-ring r-core">
              <svg viewBox="0 0 100 100" class="ring-svg">
                <circle cx="50" cy="50" r="46" class="ring-track thin secondary" stroke-dasharray="4 4" />
                <circle cx="50" cy="50" r="38" class="ring-track primary" />
              </svg>
            </div>
            <div class="armillary-ring r-inner">
              <svg viewBox="0 0 100 100" class="ring-svg">
                <circle cx="50" cy="50" r="48" class="ring-track thin" />
                <path d="M50,2 L50,8 M50,92 L50,98 M2,50 L8,50 M92,50 L98,50" class="ring-pointers primary" />
              </svg>
            </div>
          </div>
          <!-- Traveling pulse -->
          <div class="celestial-pulse"></div>
        </div>

        <!-- THE POOL BASIN ALTAR -->
        <section class="pool-core" aria-label="Mana Pool Core">
          <!-- SVG Botanical Elven Vine Astrolabe (Organic lines & leaf shapes) -->
          <div class="floral-seal-container" aria-hidden="true">
            <svg class="floral-seal-svg" viewBox="0 0 200 200">
              <defs>
                <filter id="seal-glow" x="-30%" y="-30%" width="160%" height="160%">
                  <feGaussianBlur stdDeviation="0.8" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
                <linearGradient id="seal-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#2dd4bf" stop-opacity="0.4" />
                  <stop offset="50%" stop-color="#10b981" stop-opacity="0.25" />
                  <stop offset="100%" stop-color="#fbbf24" stop-opacity="0.05" />
                </linearGradient>
              </defs>
              
              <!-- OUTER VINES: Winding organic branches (rotating clockwise) -->
              <g class="seal-ring-outer" :style="{ animationDuration: `${sealRotationSpeed}s` }">
                <!-- Base vines: static background lines -->
                <path d="M100,12 C125,12 170,30 188,100" fill="none" stroke="#2dd4bf" stroke-width="0.6" stroke-linecap="round" opacity="0.25" />
                <path d="M188,100 C188,125 170,170 100,188" fill="none" stroke="#2dd4bf" stroke-width="0.6" stroke-linecap="round" opacity="0.25" />
                <path d="M100,188 C75,188 30,170 12,100" fill="none" stroke="#2dd4bf" stroke-width="0.6" stroke-linecap="round" opacity="0.25" />
                <path d="M12,100 C12,75 30,30 100,12" fill="none" stroke="#2dd4bf" stroke-width="0.6" stroke-linecap="round" opacity="0.25" />

                <!-- Active vines: flowing animated mana pulses -->
                <path d="M100,12 C125,12 170,30 188,100" fill="none" stroke="#10b981" stroke-width="0.9" stroke-linecap="round" filter="url(#seal-glow)" class="seal-vine" />
                <path d="M188,100 C188,125 170,170 100,188" fill="none" stroke="#10b981" stroke-width="0.9" stroke-linecap="round" filter="url(#seal-glow)" class="seal-vine" style="animation-delay: -3s;" />
                <path d="M100,188 C75,188 30,170 12,100" fill="none" stroke="#10b981" stroke-width="0.9" stroke-linecap="round" filter="url(#seal-glow)" class="seal-vine" style="animation-delay: -6s;" />
                <path d="M12,100 C12,75 30,30 100,12" fill="none" stroke="#10b981" stroke-width="0.9" stroke-linecap="round" filter="url(#seal-glow)" class="seal-vine" style="animation-delay: -9s;" />
                
                <!-- Organic leaves attached along the outer vines -->
                <path d="M150,22 C162,18 168,26 156,34 C148,40 144,30 150,22 Z" fill="#10b981" class="seal-leaf" />
                <path d="M178,58 C188,58 190,68 178,74 C170,78 170,68 178,58 Z" fill="#10b981" class="seal-leaf" style="animation-delay: -0.8s;" />
                <path d="M174,136 C184,142 178,152 168,144 C160,138 166,130 174,136 Z" fill="#10b981" class="seal-leaf" style="animation-delay: -1.6s;" />
                <path d="M142,174 C146,186 136,188 130,176 C126,166 134,166 142,174 Z" fill="#10b981" class="seal-leaf" style="animation-delay: -2.4s;" />
                <path d="M58,178 C46,182 40,174 52,166 C60,160 64,170 58,178 Z" fill="#10b981" class="seal-leaf" style="animation-delay: -3.2s;" />
                <path d="M22,142 C12,142 10,132 22,126 C30,122 30,132 22,142 Z" fill="#10b981" class="seal-leaf" style="animation-delay: -4.0s;" />
                <path d="M26,64 C16,58 22,48 32,56 C40,62 34,70 26,64 Z" fill="#10b981" class="seal-leaf" style="animation-delay: -4.8s;" />
                <path d="M58,26 C54,14 64,12 70,24 C74,34 66,34 58,26 Z" fill="#10b981" class="seal-leaf" style="animation-delay: -5.6s;" />
              </g>

              <!-- MIDDLE RING: Concentric leaf-vein dotted ring (rotating counter-clockwise) -->
              <g class="seal-ring-middle" :style="{ animationDuration: `${middleRotationSpeed}s` }">
                <circle cx="100" cy="100" r="74" class="seal-line line-dotted-middle" stroke-dasharray="2 10" stroke-linecap="round" />
                <circle cx="100" cy="100" r="70" class="seal-line line-faint" />
                <!-- Small leaf buds pointing inwards -->
                <path d="M100,30 C106,34 104,40 98,38 C94,36 96,32 100,30 Z" fill="#34d399" class="seal-leaf-bud" />
                <path d="M170,100 C166,106 160,104 162,98 C164,94 168,96 170,100 Z" fill="#34d399" class="seal-leaf-bud" style="animation-delay: -0.9s;" />
                <path d="M100,170 C94,166 96,160 102,162 C106,164 104,168 100,170 Z" fill="#34d399" class="seal-leaf-bud" style="animation-delay: -1.8s;" />
                <path d="M30,100 C34,94 40,96 38,102 C36,106 32,104 30,100 Z" fill="#34d399" class="seal-leaf-bud" style="animation-delay: -2.7s;" />
              </g>

              <!-- INNER RING: Rotating floral center -->
              <g class="seal-ring-inner" :style="{ animationDuration: `${innerRotationSpeed}s` }">
                <circle cx="100" cy="100" r="58" class="seal-line line-floral" stroke-dasharray="12 8" />
                <!-- Petals -->
                <path d="M100,45 C112,62 112,78 100,100 C88,78 88,62 100,45 Z" class="seal-petal" />
                <path d="M100,155 C112,138 112,122 100,100 C88,122 88,138 100,155 Z" class="seal-petal" style="animation-delay: -1.2s;" />
                <path d="M45,100 C62,112 78,112 100,100 C78,88 62,88 45,100 Z" class="seal-petal" style="animation-delay: -2.4s;" />
                <path d="M155,100 C138,112 122,112 100,100 C122,88 138,88 155,100 Z" class="seal-petal" style="animation-delay: -3.6s;" />
              </g>
            </svg>
          </div>

          <!-- Pool Basin Plate -->
          <div class="pool-altar-plate">
            <!-- Pool Basin Image Frame -->
            <div class="pool-basin-frame">
              <AnimatedItemIcon
                item-id="i~Botania~pool~0"
                :size="72"
                class="pool-sprite"
              />
              
              <!-- Volumetric liquid surface waves directly on top of the sprite center -->
              <div class="liquid-surface-container">
                <div class="liquid-wave wave-1" />
                <div class="liquid-wave wave-2" />
                <div class="liquid-wave wave-3" />
                <div class="pool-core-light" />
              </div>
            </div>

            <!-- Circular progress ring -->
            <svg class="mana-cost-ring" viewBox="0 0 200 200" v-if="manaCost !== null">
              <circle
                cx="100"
                cy="100"
                :r="progressRadius"
                class="progress-track"
              />
              <circle
                cx="100"
                cy="100"
                :r="progressRadius"
                class="progress-bar"
                :stroke-dasharray="circumference"
                :stroke-dashoffset="strokeDashoffset"
              />
            </svg>
          </div>

          <!-- Mana Text Readout -->
          <div class="mana-readout-panel">
            <div class="mana-glow-text">{{ manaText }}</div>
          </div>
        </section>

      </div>

      <!-- RIGHT: BORDERLESS OUTPUTS -->
      <section class="floating-panel panel-outputs" aria-label="Transformation Output">
        <div class="panel-header title-gold">TRANSFORMATION</div>
        <div class="slot-container" :class="{ 'grid-layout': outputs.length > 1 }">
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
                  :size="56"
                  class="item-icon output-icon"
                  :style="{ animation: `float-bob 4.5s ease-in-out infinite`, animationDelay: `${(index + inputs.length) * 0.45}s` }"
                />
                <!-- Pulsing Shadow under item -->
                <div class="slot-shadow-glow" :style="{ animation: `shadow-pulse 4.5s ease-in-out infinite`, animationDelay: `${(index + inputs.length) * 0.45}s` }" />
              </button>
            </RecipeItemTooltip>
            <span v-if="slot.count > 1" class="slot-count count-gold">x{{ slot.count }}</span>
          </div>
        </div>
      </section>

    </div>

    <!-- BOTTOM: IN-GAME HUD MANA BAR -->
    <div class="mana-hud-overlay">
      <div class="hud-label-wrapper">
        <span class="hud-label">MANA CASCADING STATS</span>
        <span class="hud-digital-readout" v-if="manaCost !== null">
          {{ manaCost.toLocaleString() }} / 1,000,000
        </span>
      </div>
      <div class="botania-hud-bar">
        <span class="hud-bracket bracket-left">☘</span>
        <div class="hud-progress-track">
          <div class="hud-progress-fill" :style="{ width: `${manaPercentage * 100}%` }" />
        </div>
        <span class="hud-bracket bracket-right">★</span>
      </div>
    </div>

  </div>
</template>

<style scoped>
.mana-pool-ui {
  --teal-glow: 45, 212, 191;
  --emerald-glow: 16, 185, 129;
  --gold-glow: 251, 191, 36;
  --ui-bg-gradient: linear-gradient(180deg, #050f0e 0%, #010406 100%);

  position: relative;
  width: 100%;
  max-width: 960px; /* Sized down slightly from 1080px to fit standard recipe views */
  min-height: 380px; /* Reduced min-height from 520px to prevent vertical cutting off on homepage modals */
  background: var(--ui-bg-gradient);
  border: 1px solid rgba(94, 234, 212, 0.15);
  border-radius: 28px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.03),
    0 24px 56px rgba(0, 0, 0, 0.5);
  padding: 20px 16px 72px 16px; /* Compact padding bottom (72px down from 100px) to prevent layout overflow */
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif;
  isolation: isolate;
}

/* Background & Canvas */
.pool-backdrop {
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
  z-index: 20; /* Draw high-fidelity sparkles & runic orbits on top of elements */
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
  opacity: 0.38;
  will-change: transform, opacity;
  animation: drift-orb 15s ease-in-out infinite alternate;
}

.orb-teal {
  width: 320px;
  height: 320px;
  left: 20%;
  top: 15%;
  background: radial-gradient(circle, rgba(var(--teal-glow), 0.07) 0%, transparent 65%);
}

.orb-emerald {
  width: 270px;
  height: 270px;
  right: 20%;
  bottom: 12%;
  background: radial-gradient(circle, rgba(var(--emerald-glow), 0.06) 0%, transparent 65%);
  animation-delay: -5s;
}

/* Altar Deck (Borderless Floating Layout) */
.altar-deck {
  position: relative;
  z-index: 10;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 36px;
}

/* Borderless Floating Panels */
.floating-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  padding: 16px 20px;
  border-radius: 24px;
  background: transparent;
  border: none;
  box-shadow: none;
  transition: transform 0.4s ease;
}

.panel-header {
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.2em;
  color: #5eead4;
  text-shadow: 0 0 12px rgba(94, 234, 212, 0.35);
}

.title-gold {
  color: #fbbf24;
  text-shadow: 0 0 12px rgba(251, 191, 36, 0.35);
}

/* Borderless slots */
.slot-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.slot-container.grid-layout {
  display: grid;
  grid-template-columns: repeat(2, 68px);
  gap: 12px;
}

.glass-slot-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.glass-slot {
  width: 68px;
  height: 68px;
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

/* Soft, borderless radial glow behind items on hover */
.glass-slot::before {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(94, 234, 212, 0.18) 0%, transparent 70%);
  opacity: 0;
  transition: opacity 0.35s ease;
  z-index: -1;
}

.glass-slot:hover::before {
  opacity: 1;
}

.slot-gold:hover::before {
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
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-5px);
  }
}

.slot-shadow-glow {
  position: absolute;
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%) scale(1);
  width: 24px;
  height: 6px;
  background: radial-gradient(circle, rgba(94, 234, 212, 0.4) 0%, transparent 80%);
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
  border: 1px solid rgba(94, 234, 212, 0.24);
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

/* Center Stage & Core Altar */
.center-stage {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 280px; /* Reduced from 320px for tight layouts */
}

.pool-core {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

/* Concentric SVG Astrolabe (Sized down to 360px from 460px to fit perfectly within the 380px container height) */
.floral-seal-container {
  position: absolute;
  width: 360px;
  height: 360px;
  z-index: -1;
  pointer-events: none;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.85;
  filter:
    drop-shadow(0 0 20px rgba(94, 234, 212, 0.14))
    drop-shadow(0 0 10px rgba(16, 185, 129, 0.06));
}

.floral-seal-svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}

.seal-line {
  fill: none;
  stroke: rgba(94, 234, 212, 0.25);
  stroke-width: 0.85px;
  filter: url(#seal-glow);
}

.line-solid {
  stroke-width: 0.85px;
  stroke: rgba(94, 234, 212, 0.25);
}

.line-dotted-middle {
  stroke: rgba(16, 185, 129, 0.25);
  stroke-width: 0.6px;
  filter: url(#seal-glow);
}

.line-faint {
  stroke: rgba(94, 234, 212, 0.08);
  stroke-width: 0.35px;
}

.line-floral {
  stroke: rgba(94, 234, 212, 0.3);
  stroke-width: 0.5px;
}

.seal-ring-outer {
  transform-origin: 100px 100px;
  animation: seal-rotate 120s linear infinite;
}

.seal-ring-middle {
  transform-origin: 100px 100px;
  animation: seal-rotate 90s linear infinite reverse;
}

.seal-ring-inner {
  transform-origin: 100px 100px;
  animation: seal-rotate 72s linear infinite;
}

@keyframes seal-rotate {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* Base Vine Mana Flow Animation */
.seal-vine {
  stroke-dasharray: 60 180;
  animation: flow-mana 12s linear infinite;
}

@keyframes flow-mana {
  0% {
    stroke-dashoffset: 240;
  }
  100% {
    stroke-dashoffset: 0;
  }
}

.seal-leaf {
  opacity: 0.75;
  transition: fill 0.3s ease, filter 0.3s ease;
  animation: pulse-leaf 4s ease-in-out infinite alternate;
  filter: drop-shadow(0 0 2px rgba(16, 185, 129, 0.3));
}

@keyframes pulse-leaf {
  0% {
    opacity: 0.65;
    fill: #10b981;
    filter: drop-shadow(0 0 2px rgba(16, 185, 129, 0.3));
  }
  50% {
    fill: #34d399;
    filter: drop-shadow(0 0 6px rgba(52, 211, 153, 0.8));
  }
  100% {
    opacity: 0.95;
    fill: #2dd4bf;
    filter: drop-shadow(0 0 4px rgba(45, 212, 191, 0.6));
  }
}

.seal-leaf-bud {
  opacity: 0.75;
  animation: pulse-leaf-bud 3.5s ease-in-out infinite alternate;
}

@keyframes pulse-leaf-bud {
  0% {
    fill: #34d399;
    opacity: 0.6;
  }
  100% {
    fill: #fbbf24;
    opacity: 0.95;
  }
}

.seal-petal {
  fill: none;
  stroke: rgba(94, 234, 212, 0.2);
  stroke-width: 0.6px;
  filter: url(#seal-glow);
  animation: pulse-petal 5s ease-in-out infinite alternate;
  transform-origin: 100px 100px;
}

@keyframes pulse-petal {
  0% {
    stroke: rgba(94, 234, 212, 0.15);
    transform: scale(0.97);
  }
  100% {
    stroke: rgba(251, 191, 36, 0.45);
    transform: scale(1.03);
  }
}

/* Armillary Conduit Spreader Tube */
.armillary-conduit {
  position: absolute;
  width: 320px;
  height: 90px;
  display: flex;
  align-items: center;
  justify-content: center;
  perspective: 700px;
  z-index: 1;
  pointer-events: none;
}

.focal-thread {
  position: absolute;
  width: 150%;
  height: 1.5px;
  background: linear-gradient(90deg, transparent, rgba(94, 234, 212, 0.2), rgba(52, 211, 153, 0.55), transparent);
  box-shadow: 0 0 12px rgba(52, 211, 153, 0.6);
  opacity: 0.8;
}

.armillary-tunnel {
  position: absolute;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: space-evenly;
  transform-style: preserve-3d;
}

.armillary-ring {
  position: relative;
  transform-style: preserve-3d;
  transform: rotateY(70deg);
  filter: drop-shadow(0 0 12px rgba(94, 234, 212, 0.2));
}

.ring-svg {
  width: 100%;
  height: 100%;
  fill: none;
  overflow: visible;
  stroke-linecap: round;
}

.ring-track {
  stroke: rgba(148, 163, 184, 0.2);
  stroke-width: 0.8px;
}
.ring-track.thin {
  stroke-width: 0.4px;
}
.ring-track.primary {
  stroke: rgba(94, 234, 212, 0.6);
}
.ring-track.secondary {
  stroke: rgba(52, 211, 153, 0.4);
}
.ring-marks {
  stroke: rgba(94, 234, 212, 0.8);
  stroke-width: 0.8px;
}
.ring-pointers {
  stroke: rgba(94, 234, 212, 0.9);
  stroke-width: 1.2px;
}

.r-outer { width: 70px; height: 70px; animation: spin-lens 22s linear infinite; }
.r-core { width: 85px; height: 85px; margin-left: -20px; margin-right: -20px; animation: spin-core 16s linear infinite reverse; }
.r-inner { width: 60px; height: 60px; animation: spin-focus 18s linear infinite; }

@keyframes spin-lens { 0% { transform: rotateY(70deg) rotateZ(0deg); } 100% { transform: rotateY(70deg) rotateZ(360deg); } }
@keyframes spin-core { 0% { transform: rotateY(75deg) rotateZ(360deg); } 100% { transform: rotateY(75deg) rotateZ(0deg); } }
@keyframes spin-focus { 0% { transform: rotateY(65deg) rotateZ(0deg) rotateX(10deg); } 100% { transform: rotateY(65deg) rotateZ(360deg) rotateX(10deg); } }

.celestial-pulse {
  position: absolute;
  left: -80px;
  width: 20px;
  height: 2px;
  background: #fff;
  border-radius: 50%;
  box-shadow: 
    0 0 16px 4px rgba(255,255,255,0.8),
    0 0 32px 12px rgba(94, 234, 212, 0.8);
  animation: celestial-transit 3.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  opacity: 0;
}

@keyframes celestial-transit {
  0% { transform: translateX(0) scaleX(0.2); opacity: 0; }
  25% { opacity: 1; transform: translateX(120px) scaleX(1.2); }
  75% { opacity: 1; transform: translateX(360px) scaleX(1.5); }
  100% { transform: translateX(480px) scaleX(0.2); opacity: 0; }
}

/* Altar Basin Plate (Scaled down slightly to fit beautifully) */
.pool-altar-plate {
  position: relative;
  width: 200px;
  height: 200px;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pool-basin-frame {
  position: relative;
  z-index: 15;
  width: 110px;
  height: 110px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle at center, rgba(12, 74, 96, 0.15) 0%, transparent 70%);
}

.pool-sprite {
  width: 80px;
  height: 80px;
  object-fit: contain;
  image-rendering: pixelated;
  filter: drop-shadow(0 6px 14px rgba(0, 0, 0, 0.55)) drop-shadow(0 0 16px rgba(94, 234, 212, 0.25));
  transition: transform 0.4s ease;
}

.pool-altar-plate:hover .pool-sprite {
  transform: translateY(-2px) scale(1.03);
}

/* Volumetric Liquid Surface on top of the sprite center (Sized down for 80px sprite) */
.liquid-surface-container {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%) translateY(-1px);
  width: 50px;
  height: 26px;
  border-radius: 50%;
  z-index: 16;
  pointer-events: none;
  overflow: hidden;
  opacity: 0.72;
  mix-blend-mode: screen;
}

.liquid-wave {
  position: absolute;
  border-radius: 40%;
  background: radial-gradient(circle, rgba(94, 234, 212, 0.26) 0%, rgba(52, 211, 153, 0.1) 60%, transparent 80%);
  will-change: transform;
}

.wave-1 {
  width: 64px;
  height: 64px;
  left: -8px;
  top: -20px;
  animation: rotate-wave 7s linear infinite;
}

.wave-2 {
  width: 56px;
  height: 56px;
  left: 1px;
  top: -15px;
  background: radial-gradient(circle, rgba(254, 240, 138, 0.16) 0%, rgba(94, 234, 212, 0.1) 60%, transparent 80%);
  animation: rotate-wave 10s linear infinite reverse;
}

.wave-3 {
  width: 72px;
  height: 72px;
  left: -12px;
  top: -24px;
  animation: rotate-wave 15s ease-in-out infinite;
}

/* Central magical core light */
.pool-core-light {
  position: absolute;
  inset: 12%;
  border-radius: 50%;
  background: radial-gradient(circle at center, rgba(255, 255, 255, 0.95) 0%, rgba(94, 234, 212, 0.45) 45%, transparent 100%);
  filter: blur(1.5px);
  z-index: 12;
}

@keyframes rotate-wave {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* Circular Progress Ring */
.mana-cost-ring {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 12;
  transform: rotate(-90deg);
  pointer-events: none;
  filter: drop-shadow(0 0 8px rgba(94, 234, 212, 0.35));
}

.progress-track {
  fill: none;
  stroke: rgba(94, 234, 212, 0.05);
  stroke-width: 3.5px;
}

.progress-bar {
  fill: none;
  stroke: #2dd4bf;
  stroke-linecap: round;
  stroke-width: 4px;
  transition: stroke-dashoffset 0.8s cubic-bezier(0.22, 1, 0.36, 1);
}

/* Readout Panel */
.mana-readout-panel {
  margin-top: 10px;
  z-index: 12;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.mana-glow-text {
  font-size: 13px;
  font-weight: 900;
  letter-spacing: 0.16em;
  color: #dfdfdf;
  text-shadow:
    0 0 10px rgba(255, 255, 255, 0.25),
    0 0 20px rgba(94, 234, 212, 0.45);
}

/* In-game HUD Mana Bar (Positioned compactly to fit viewport) */
.mana-hud-overlay {
  position: absolute;
  bottom: 12px; /* Positioned closer to the bottom border (12px down from 24px) */
  left: 50%;
  transform: translateX(-50%);
  z-index: 30;
  width: min(580px, 90vw);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.hud-label-wrapper {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif;
  padding: 0 14px;
}

.hud-label {
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.16em;
  color: rgba(94, 234, 212, 0.7);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}

.hud-digital-readout {
  font-size: 11px;
  font-weight: 800;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  color: #e2e8f0;
}

.botania-hud-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(10, 10, 15, 0.65);
  border-radius: 99px;
  padding: 2px 10px; /* Reduced vertical padding from 4px to 2px */
  border: 1px solid rgba(94, 234, 212, 0.08);
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.28);
}

.hud-bracket {
  font-size: 14px;
  color: #2dd4bf;
  text-shadow: 0 0 8px rgba(94, 234, 212, 0.5);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  user-select: none;
}

.bracket-right {
  color: #fbbf24;
  text-shadow: 0 0 8px rgba(251, 191, 36, 0.5);
}

.hud-progress-track {
  flex: 1;
  height: 8px; /* Compact height of track (8px down from 10px) */
  background: rgba(15, 23, 42, 0.9);
  border: 1.5px solid #166534; /* Pixelated green leaf border */
  box-shadow: inset 0 2px 4px rgba(0,0,0,0.8);
  border-radius: 3px;
  overflow: hidden;
  position: relative;
}

.hud-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #0891b2 0%, #2dd4bf 100%);
  box-shadow: 0 0 8px #2dd4bf;
  border-radius: 1px;
  transition: width 0.8s cubic-bezier(0.22, 1, 0.36, 1);
}

/* Animations */
@keyframes drift-orb {
  from { transform: translate3d(0, 0, 0) scale(0.95); opacity: 0.28; }
  to { transform: translate3d(8px, -12px, 0) scale(1.05); opacity: 0.42; }
}

/* Responsive breakpoint: Switch to column layout ONLY when viewport is extremely narrow (< 640px)
   This keeps inputs, pool, and outputs aligned horizontally on standard NEI modal widths (700px - 850px),
   reducing vertical height significantly and preventing vertical clipping. */
@media (max-width: 640px) {
  .mana-pool-ui {
    padding-bottom: 24px;
    min-height: auto;
  }

  .altar-deck {
    flex-direction: column;
    width: 100%;
    gap: 24px;
  }

  .armillary-conduit {
    display: none;
  }

  .slot-container.grid-layout {
    grid-template-columns: repeat(4, 68px);
  }

  .mana-hud-overlay {
    position: relative;
    bottom: auto;
    left: auto;
    transform: none;
    width: 100%;
    margin-top: 24px;
  }
}
</style>
