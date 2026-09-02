// renderer.js — rendu canvas de l'ensemble des éléments
import { SHAPE_TYPES } from './model.js';

// dessine tous les éléments sur un contexte aux coordonnées monde (ℓ)
export function render(ctx, elements, opts = {}) {
  const {
    gridOn = false,
    gridSize = 24,
    bgColor = '#ffffff',
    noClear = false,
    // vue/zoom pour la grille infinie (passés par le contrôleur)
    zoom = 1,
    panX = 0,
    panY = 0,
    cssW = null,
    cssH = null,
  } = opts;

  if (!noClear) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }

  if (gridOn) drawGrid(ctx, { size: gridSize, zoom, panX, panY, cssW, cssH });

  for (const el of elements) {
    if (el.type === 'path') {
      drawPath(ctx, el);
    } else if (el.type === 'line') {
      drawLine(ctx, el);
    } else if (el.type === 'arrow') {
      drawArrow(ctx, el, elements);
    } else if (el.type === 'text') {
      drawText(ctx, el);
    } else if (SHAPE_TYPES.includes(el.type)) {
      drawShape(ctx, el);
    }
  }
}

// Grille infini : couvre tout le viewport, réglée pour rester lisible à tout zoom.
// Le pas s'adapte (x2) pour que l'espacement à l'écran ne devienne ni dense ni
// trop large, et le trait fait toujours ~1 px écran (~1/zoom en unités monde).
function drawGrid(ctx, o) {
  const zoom = o.zoom || 1;
  const base = Math.max(8, o.size || 24);
  let step = base;
  while (step * zoom < 22) step *= 2; // garde ~>=22 px écran entre deux lignes
  // dimensions visibles (px écran) → unités monde
  const w = o.cssW || ctx.canvas.width;
  const h = o.cssH || ctx.canvas.height;
  const worldW = w / zoom;
  const worldH = h / zoom;
  const x0 = Math.floor(((0 - o.panX) / zoom) / step) * step;
  const y0 = Math.floor(((0 - o.panY) / zoom) / step) * step;

  ctx.save();
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1 / zoom;
  ctx.beginPath();
  for (let x = x0; x <= x0 + worldW; x += step) {
    ctx.moveTo(x, (0 - o.panY) / zoom);
    ctx.lineTo(x, (0 - o.panY) / zoom + worldH);
  }
  for (let y = y0; y <= y0 + worldH; y += step) {
    ctx.moveTo((0 - o.panX) / zoom, y);
    ctx.lineTo((0 - o.panX) / zoom + worldW, y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawOutline(ctx, el) {
  // trace le contour d'une forme (utilisé par drawShape, drawLine, drawArrow)
  const { x, y, w, h } = el;
  ctx.beginPath();
  switch (el.type) {
    case 'rect':
      ctx.rect(x, y, w, h);
      break;
    case 'parallelogram': {
      const o = Math.min(w / 4, 40);
      ctx.moveTo(x + o, y);
      ctx.lineTo(x + w, y);
      ctx.lineTo(x + w - o, y + h);
      ctx.lineTo(x, y + h);
      ctx.closePath();
      break;
    }
    case 'ellipse': {
      ctx.ellipse(x + w / 2, y + h / 2, Math.abs(w) / 2, Math.abs(h) / 2, 0, 0, Math.PI * 2);
      break;
    }
    case 'diamond': {
      ctx.moveTo(x + w / 2, y);
      ctx.lineTo(x + w, y + h / 2);
      ctx.lineTo(x + w / 2, y + h);
      ctx.lineTo(x, y + h / 2);
      ctx.closePath();
      break;
    }
    case 'triangle': {
      ctx.moveTo(x + w / 2, y);
      ctx.lineTo(x + w, y + h);
      ctx.lineTo(x, y + h);
      ctx.closePath();
      break;
    }
    case 'line': {
      // pas de fermeture
      break;
    }
    default:
      break;
  }
}

export function fillAndStroke(ctx, el) {
  if (el.fill && el.fill !== 'transparent') {
    ctx.fillStyle = el.fill;
    ctx.fill();
  }
  if (el.stroke && el.stroke !== 'transparent' && el.strokeWidth > 0) {
    ctx.strokeStyle = el.stroke;
    ctx.lineWidth = el.strokeWidth;
    ctx.stroke();
  }
}

function drawShape(ctx, el) {
  ctx.save();
  const sm = applyRotation(ctx, el);
  drawOutline(ctx, el);
  fillAndStroke(ctx, el);
  ctx.restore();
}

function applyRotation(ctx, el) {
  // rotation autour du centre de la forme
  const sm = 1;
  if (el.rotation) {
    ctx.translate(el.x + el.w / 2, el.y + el.h / 2);
    ctx.rotate((el.rotation * Math.PI) / 180);
    ctx.translate(-(el.x + el.w / 2), -(el.y + el.h / 2));
  }
  return sm;
}

function drawLine(ctx, el) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(el.x, el.y);
  ctx.lineTo(el.x + el.w, el.y + el.h);
  if (el.stroke && el.stroke !== 'transparent' && el.strokeWidth > 0) {
    ctx.strokeStyle = el.stroke;
    ctx.lineWidth = el.strokeWidth;
    ctx.lineCap = 'round';
    ctx.stroke();
  }
  ctx.restore();
}

function drawPath(ctx, el) {
  if (!el.points || el.points.length === 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(el.points[0][0], el.points[0][1]);
  for (let i = 1; i < el.points.length; i++) {
    ctx.lineTo(el.points[i][0], el.points[i][1]);
  }
  if (el.stroke && el.stroke !== 'transparent' && el.strokeWidth > 0) {
    ctx.strokeStyle = el.stroke;
    ctx.lineWidth = el.strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
  ctx.restore();
}

export function anchorPointOf(el) {
  const { x, y, w, h } = el;
  const cx = x + w / 2;
  const cy = y + h / 2;
  return {
    top: { x: cx, y },
    bottom: { x: cx, y: y + h },
    left: { x, y: cy },
    right: { x: x + w, y: cy },
  };
}

// résout le point réel (dans l'espace monde) d'un connecteur de flèche
function resolveConnector(conn, elements) {
  if (!conn) return null;
  const el = elements.find(e => e.id === conn.id);
  if (!el) return null;
  const anchors = anchorPointOf(el);
  return anchors[conn.side] || null;
}

function drawArrow(ctx, el, elements) {
  const from = resolveConnector(el.from, elements);
  const to = resolveConnector(el.to, elements);
  let x1 = el.x, y1 = el.y, x2 = el.x + el.w, y2 = el.y + el.h;
  if (from) { x1 = from.x; y1 = from.y; }
  if (to) { x2 = to.x; y2 = to.y; }

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  if (el.stroke && el.stroke !== 'transparent' && el.strokeWidth > 0) {
    ctx.strokeStyle = el.stroke;
    ctx.lineWidth = el.strokeWidth;
    ctx.lineCap = 'round';
    ctx.stroke();
  }

  // pointe(s)
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len > 0) {
    const ux = (x2 - x1) / len, uy = (y2 - y1) / len;
    const hsize = Math.max(6, el.strokeWidth * 3);
    const headAngle = Math.PI / 6;
    const drawHead = (px, py, ux, uy) => {
      const angle = Math.atan2(uy, ux);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px - Math.cos(angle - headAngle) * hsize, py - Math.sin(angle - headAngle) * hsize);
      ctx.lineTo(px - Math.cos(angle + headAngle) * hsize, py - Math.sin(angle + headAngle) * hsize);
      ctx.closePath();
      ctx.fillStyle = el.stroke || '#1f2937';
      ctx.fill();
    };
    if (el.arrowHead === 'to' || el.arrowHead === 'both') drawHead(x2, y2, ux, uy);
    if (el.arrowHead === 'both') drawHead(x1, y1, -ux, -uy);
  }

  // label au milieu
  if (el.label) {
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    ctx.font = `600 ${Math.max(13, el.strokeWidth + 10)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const pad = 3;
    // fond blanc pour la lisibilité
    const tw = ctx.measureText(el.label).width + pad * 2;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(mx - tw / 2, my - 12, tw, 24);
    ctx.fillStyle = el.labelColor || '#111827';
    ctx.fillText(el.label, mx, my);
  }
  ctx.restore();
}

function drawText(ctx, el) {
  ctx.save();
  ctx.font = `${el.fontStyle || 'normal'} ${el.fontWeight || '500'} ${el.fontSize}px system-ui, sans-serif`;
  ctx.fillStyle = el.fontColor || '#111827';
  ctx.textBaseline = 'top';
  // simple wrapping sur \n
  const lines = String(el.text || '').split('\n');
  lines.forEach((ln, i) => {
    ctx.fillText(ln, el.x, el.y + i * (el.fontSize * 1.2));
  });
  ctx.restore();
}

// dessine l'overlay de sélection (poignées + points d'ancrage)
export function drawSelectionOverlay(ctx, el, canSnap) {
  if (!el) return;
  ctx.save();
  const { x, y, w, h } = el;
  // boîte englobante
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.strokeRect(x - 5, y - 5, w + 10, h + 10);
  ctx.setLineDash([]);

  // poignées
  const hs = 8;
  ctx.fillStyle = '#3b82f6';
  [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].forEach(([hx, hy]) => {
    ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
  });

  // points d'ancrage des formes
  if (canSnap && SHAPE_TYPES.includes(el.type)) {
    const anchors = anchorPointOf(el);
    ctx.fillStyle = '#10b981';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    for (const [side, p] of Object.entries(anchors)) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.restore();
}