// model.js — modèles d'éléments, sérialisation, gestion du document
// Représente le dessin comme une liste d'objets vectoriels (pas de pixels)
// pour permettre sélection, déplacement, redimensionnement et connexions.

export const SHAPE_TYPES = ['rect', 'ellipse', 'triangle', 'diamond', 'parallelogram'];

export const SIDES = {
  top: 'top',
  right: 'right',
  bottom: 'bottom',
  left: 'left',
};

// point d'ancrage (milieu d'un demi-côté) d'une forme
export function anchorPoint(el) {
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

export function makeElement(type, props = {}) {
  return {
    id: newId(),
    type,
    x: 0, y: 0, w: 0, h: 0,
    stroke: '#1f2937',
    strokeWidth: 3,
    fill: props.fill ?? 'transparent',
    // rotation en degrés (optionnelle, formes)
    rotation: 0,
    // points pour le crayon
    points: props.points || null,
    // texte
    text: props.text || '',
    fontSize: 18,
    fontColor: '#111827',
    // flèche : connexions aimantées {id, side} ou null ; label = texte sur la flèche
    from: null,
    to: null,
    label: '',
    labelColor: '#111827',
    arrowHead: 'to', // 'to' | 'both' | 'none'
    ...props,
  };
}

let _seq = 1;
export function newId() {
  const id = `e${Date.now().toString(36)}${(_seq++).toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  return id;
}

const GROUP_SNAPSHOT = '__group_tmp__';

// ---------- Serialisation ----------

export function serializeElements(elements) {
  return elements.map(el => ({ ...el }));
}

export function deserializeElements(arr) {
  return arr.map(el => ({ ...el }));
}

// ---------- Opérations sur le document ----------

export function hitTest(elements, x, y) {
  // renvoie l'élément le plus haut (dernier dessiné) contenant le point
  for (let i = elements.length - 1; i >= 0; i--) {
    if (pointInElement(elements[i], x, y)) return elements[i];
  }
  return null;
}

export function pointInElement(el, px, py) {
  const { x, y, w, h } = el;
  if (el.type === 'path' && el.points) {
    if (el.points.length === 1) {
      // point isolé (simple clic) : hit si près du centre du dot
      const [x, y] = el.points[0];
      return Math.hypot(px - x, py - y) <= Math.max(el.strokeWidth / 2 + 2, 6);
    }
    // hit-test sur le polygone approché du trait
    for (let i = 0; i < el.points.length - 1; i++) {
      const [ax, ay] = el.points[i];
      const [bx, by] = el.points[i + 1];
      const d = distToSegment(px, py, ax, ay, bx, by);
      if (d <= Math.max(el.strokeWidth / 2 + 2, 6)) return true;
    }
    return false;
  }
  if (w < 0 || h < 0) {
    // formes tracées en allant en arrière : normaliser
    const nx = Math.min(x, x + w);
    const ny = Math.min(y, y + h);
    const nw = Math.abs(w);
    const nh = Math.abs(h);
    return hitBoxNormalized(el.type, nx, ny, nw, nh, px, py);
  }
  return hitBoxNormalized(el.type, x, y, w, h, px, py);
}

function hitBoxNormalized(type, x, y, w, h, px, py) {
  if (type === 'rect' || type === 'parallelogram') {
    return px >= x - 4 && px <= x + w + 4 && py >= y - 4 && py <= y + h + 4;
  }
  if (type === 'ellipse') {
    const rx = w / 2, ry = h / 2;
    const cx = x + rx, cy = y + ry;
    const dx = (px - cx) / rx, dy = (py - cy) / ry;
    return dx * dx + dy * dy <= 1.15;
  }
  if (type === 'diamond') {
    const cx = x + w / 2, cy = y + h / 2;
    return diamondContains(cx, cy, w / 2, h / 2, px, py);
  }
  if (type === 'triangle') {
    // triangle pointant vers le bas (base en haut)
    const a = { x: x, y: y };
    const b = { x: x + w, y: y };
    const c = { x: x + w / 2, y: y + h };
    return pointInTriangle(px, py, a, b, c);
  }
  return px >= x && px <= x + w && py >= y && py <= y + h;
}

function diamondContains(cx, cy, rx, ry, px, py) {
  const dx = Math.abs(px - cx) / rx;
  const dy = Math.abs(py - cy) / ry;
  return (dx + dy) <= 1.15;
}

export function getAllAnchors(elements) {
  // liste des points aimantables (milieu des 4 côtés des formes)
  const out = [];
  for (const el of elements) {
    if (!SHAPE_TYPES.includes(el.type)) continue;
    const pts = anchorPoint(el);
    for (const [side, p] of Object.entries(pts)) {
      out.push({ elId: el.id, side, x: p.x, y: p.y });
    }
  }
  return out;
}

// ---------- Géométrie utilitaire ----------

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx, cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function pointInTriangle(px, py, a, b, c) {
  const sign = (p1, p2, p3) => (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
  const d1 = sign(px, py, a, b);
  const d2 = sign(px, py, b, c);
  const d3 = sign(px, py, c, a);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

// normalise une boîte (gère le tracé négatif)
export function normalizeBox(x, y, w, h) {
  return { x: Math.min(x, x + w), y: Math.min(y, y + h), w: Math.abs(w), h: Math.abs(h) };
}