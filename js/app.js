// app.js — contrôleur principal : état, interactions, UI, export/import
import { makeElement, hitTest, serializeElements, deserializeElements, getAllAnchors, anchorPoint, SHAPE_TYPES } from './model.js';
import { render, drawSelectionOverlay } from './renderer.js';

const STORAGE_KEY = 'sputnk-draw:document';

const state = {
  elements: [],
  selected: [],
  tool: 'select',
  strokeColor: '#1f2937',
  fillColor: '#bfdbfe',
  strokeWidth: 3,
  gridOn: false,
  gridSize: 24,
  zoom: 1,
  panX: 0,
  panY: 0,
  // interaction en cours
  draft: null,
  snapshot: null,
  history: [],
  historyIndex: -1,
};

const PRESET_COLORS = [
  '#1f2937', '#ef4444', '#f97316', '#f59e0b', '#22c55e',
  '#10b981', '#14b8a6', '#3b82f6', '#6366f1', '#a855f7',
  '#ec4899', '#ffffff', '#f9fafb', '#e5e7eb', '#9ca3af',
];

// ---------- Raccourcis d'outils ----------
const TOOL_KEYS = {
  v: 'select', p: 'pencil', l: 'line', a: 'arrow', t: 'text',
  r: 'rect', o: 'ellipse', y: 'triangle', d: 'diamond', p2: 'parallelogram',
  f: 'fill', c: 'fill',
};

// ---------- DOM ----------
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

let cw, ch; // tailles CSS du canvas

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  cw = rect.width;
  ch = rect.height;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = cw * dpr;
  canvas.height = ch * dpr;
}

function toWorld(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const x = (clientX - rect.left - state.panX) / state.zoom;
  const y = (clientY - rect.top - state.panY) / state.zoom;
  return { x, y };
}

function draw() {
  ctx.save();
  ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);
  ctx.translate(state.panX, state.panY);
  ctx.scale(state.zoom, state.zoom);
  render(ctx, state.elements, {
    gridOn: state.gridOn,
    gridSize: state.gridSize,
    bgColor: '#ffffff',
    zoom: state.zoom,
    panX: state.panX,
    panY: state.panY,
    cssW: cw,
    cssH: ch,
  });
  // overlay sélection
  for (const el of state.selected) {
    const canSnap = state.tool === 'select' && SHAPE_TYPES.includes(el.type);
    drawSelectionOverlay(ctx, el, canSnap);
  }
  // prévisualisation du draft
  drawDraft();
  ctx.restore();
}

function drawDraft() {
  if (!state.draft) return;
  const d = state.draft;
  if (d.type === 'path' && d.points && d.points.length) {
    ctx.beginPath();
    ctx.moveTo(d.points[0][0], d.points[0][1]);
    for (let i = 1; i < d.points.length; i++) ctx.lineTo(d.points[i][0], d.points[i][1]);
    ctx.strokeStyle = d.stroke;
    ctx.lineWidth = d.strokeWidth;
    ctx.lineCap = 'round';
    ctx.stroke();
    return;
  }
  // formes / ligne / flèche : dessiner l'élément partiel
  const tmp = { ...d };
  render(ctx, [tmp], { gridOn: state.gridOn, gridSize: state.gridSize, noClear: true });
}

// ---------- Historique (undo/redo) ----------
function pushHistory() {
  // tronque l'historique après index courant
  state.history = state.history.slice(0, state.historyIndex + 1);
  state.history.push(serializeElements(state.elements));
  if (state.history.length > 60) state.history.shift();
  state.historyIndex = state.history.length - 1;
  save();
}

function undo() {
  if (state.historyIndex <= 0) return;
  state.historyIndex--;
  state.elements = deserializeElements(state.history[state.historyIndex]);
  state.selected = [];
  draw();
}
function redo() {
  if (state.historyIndex >= state.history.length - 1) return;
  state.historyIndex++;
  state.elements = deserializeElements(state.history[state.historyIndex]);
  state.selected = [];
  draw();
}

// ---------- Persistance (100 % navigateur) ----------
function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      v: 1,
      elements: serializeElements(state.elements),
      settings: {
        strokeColor: state.strokeColor, fillColor: state.fillColor,
        strokeWidth: state.strokeWidth, gridOn: state.gridOn,
      },
    }));
  } catch (e) { /* quota */ }
}
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data && Array.isArray(data.elements)) {
      state.elements = deserializeElements(data.elements);
    }
    if (data && data.settings) {
      if (data.settings.strokeColor) state.strokeColor = data.settings.strokeColor;
      if (data.settings.fillColor) state.fillColor = data.settings.fillColor;
      if (data.settings.strokeWidth) state.strokeWidth = data.settings.strokeWidth;
      if (data.settings.gridOn !== undefined) state.gridOn = data.settings.gridOn;
    }
  } catch (e) { /* ignore */ }
}

// ---------- UI helpers ----------
function setTool(tool) {
  state.tool = tool;
  state.selected = [];
  document.querySelectorAll('#toolbar button').forEach(b => {
    b.classList.toggle('active', b.dataset.tool === tool);
  });
  document.getElementById('stroke-size-wrap').style.display =
    (tool === 'pencil' || tool === 'line' || tool === 'arrow' ||
     tool === 'rect' || tool === 'ellipse' || tool === 'triangle' ||
     tool === 'diamond' || tool === 'parallelogram') ? 'flex' : 'none';
  draw();
}

function initUI() {
  // toolbar
  document.querySelectorAll('#toolbar button[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => setTool(btn.dataset.tool));
  });

  // race : les touches a, arrow -> arrow ; r -> rect etc (géré par keydown)

  // couleurs
  const strokePicker = document.getElementById('stroke-color');
  const fillPicker = document.getElementById('fill-color');
  strokePicker.value = state.strokeColor;
  fillPicker.value = state.fillColor;
  strokePicker.addEventListener('input', () => {
    state.strokeColor = strokePicker.value;
    updatePresetActive();
    draw();
  });
  fillPicker.addEventListener('input', () => {
    state.fillColor = fillPicker.value;
    updatePresetActive();
    draw();
  });

  // palette
  const palette = document.getElementById('palette');
  PRESET_COLORS.forEach(c => {
    const sw = document.createElement('div');
    sw.className = 'swatch';
    sw.style.background = c;
    sw.dataset.color = c;
    sw.addEventListener('click', () => {
      // Alt/Option = remplissage, sinon trait
      state.strokeColor = c;
      strokePicker.value = c;
      updatePresetActive();
      draw();
    });
    sw.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      state.fillColor = c;
      fillPicker.value = c;
      updatePresetActive();
      draw();
    });
    palette.appendChild(sw);
  });
  updatePresetActive();

  // épaisseur
  const widthSlider = document.getElementById('stroke-width');
  widthSlider.addEventListener('input', () => {
    state.strokeWidth = parseInt(widthSlider.value, 10);
    document.getElementById('stroke-width-val').textContent = state.strokeWidth;
  });

  // grille
  document.getElementById('grid-toggle').addEventListener('click', () => {
    state.gridOn = !state.gridOn;
    document.getElementById('grid-toggle').classList.toggle('active', state.gridOn);
    draw();
  });

  // export/import
  document.getElementById('export-png').addEventListener('click', exportPNG);
  document.getElementById('save-file').addEventListener('click', saveNative);
  document.getElementById('open-file').addEventListener('click', () => document.getElementById('file-input').click());
  document.getElementById('file-input').addEventListener('change', openNative);
  document.getElementById('clear-all').addEventListener('click', () => {
    if (!state.elements.length) return;
    if (confirm('Effacer tout le dessin ?')) {
      const prev = state.elements;
      state.elements = [];
      state.selected = [];
      pushHistory();
      draw();
      void prev;
    }
  });

  document.getElementById('zoom-in').addEventListener('click', () => zoomBy(1.2));
  document.getElementById('zoom-out').addEventListener('click', () => zoomBy(1 / 1.2));
  document.getElementById('zoom-reset').addEventListener('click', () => {
    state.zoom = 1; state.panX = 0; state.panY = 0; draw();
  });

  // boutons undo/redo
  document.getElementById('undo').addEventListener('click', undo);
  document.getElementById('redo').addEventListener('click', redo);
}

function updatePresetActive() {
  document.querySelectorAll('#palette .swatch').forEach(s => {
    s.classList.toggle('active', s.dataset.color.toLowerCase() === state.strokeColor.toLowerCase());
  });
}

// Zoom centré sous le curseur (canvas infini) : on garde fixe le point monde
// qui est sous le pointeur. `cx/cy` sont les coordonnées CSS dans le canvas.
function zoomAt(clientX, clientY, factor) {
  const rect = canvas.getBoundingClientRect();
  const cx = clientX - rect.left;
  const cy = clientY - rect.top;
  const wx = (cx - state.panX) / state.zoom;
  const wy = (cy - state.panY) / state.zoom;
  const nz = Math.min(8, Math.max(0.02, state.zoom * factor));
  state.zoom = nz;
  state.panX = cx - wx * nz;
  state.panY = cy - wy * nz;
  draw();
}

function zoomBy(f) {
  const rect = canvas.getBoundingClientRect();
  zoomAt(rect.left + cw / 2, rect.top + ch / 2, f);
}

// ---------- Interactions souris ----------
let drag = null; // {mode, startWorld, startEls, moved}

canvas.addEventListener('pointerdown', (e) => {
  // clic droit ou espace = pan (géré plus bas), jamais un outil
  if (e.button === 2 || spaceHeld) return;
  const p = toWorld(e.clientX, e.clientY);
  canvas.setPointerCapture(e.pointerId);

  if (state.tool === 'select') {
    const hit = hitTest(state.elements, p.x, p.y);
    if (e.shiftKey) {
      drag = { mode: 'select', startWorld: p };
      if (hit) {
        const idx = state.selected.findIndex(s => s.id === hit.id);
        if (idx >= 0) state.selected.splice(idx, 1); else state.selected.push(hit);
      }
      drag.startSelected = state.selected.slice();
      drag.startEls = {};
      draw();
      return;
    }
    if (hit) {
      if (!state.selected.find(s => s.id === hit.id)) state.selected = [hit];
      drag = {
        mode: 'move', startWorld: p, startEls: state.selected.map(el => ({ el, ox: el.x, oy: el.y })),
      };
    } else {
      state.selected = [];
    }
    draw();
    return;
  }

  if (state.tool === 'pencil') {
    state.draft = { type: 'path', points: [[p.x, p.y]], stroke: state.strokeColor, strokeWidth: state.strokeWidth, fill: 'transparent' };
    drag = { mode: 'pencil', moved: false };
    return;
  }

  if (['line', 'rect', 'ellipse', 'triangle', 'diamond', 'parallelogram', 'arrow'].includes(state.tool)) {
    drag = { mode: state.tool, startWorld: p, moved: false };
    return;
  }

  if (state.tool === 'text') {
    addElement(makeElement('text', {
      x: p.x, y: p.y, w: 1, h: state.strokeWidth + 10,
      text: prompt('Texte :', 'Texte'),
      fontSize: 18, fontColor: state.strokeColor,
    }));
    return;
  }

  if (state.tool === 'fill') {
    fillAt(p);
    return;
  }
});

canvas.addEventListener('pointermove', (e) => {
  const p = toWorld(e.clientX, e.clientY);
  if (!drag) return;

  if (drag.mode === 'select') {
    // rectangle de sélection simple — on ignore, on déplace les sélectionnés
    return;
  }

  if (drag.mode === 'move') {
    const dx = p.x - drag.startWorld.x;
    const dy = p.y - drag.startWorld.y;
    drag.startEls.forEach(({ el, ox, oy }) => { el.x = ox + dx; el.y = oy + dy; });
    draw();
    return;
  }

  if (drag.mode === 'pencil') {
    const pts = state.draft.points;
    const last = pts[pts.length - 1];
    if (Math.hypot(p.x - last[0], p.y - last[1]) > 1) pts.push([p.x, p.y]);
    state.draft.stroke = state.strokeColor;
    state.draft.strokeWidth = state.strokeWidth;
    drag.moved = true;
    draw();
    return;
  }

  // formes / ligne / flèche pendant le drag
  const sx = drag.startWorld.x, sy = drag.startWorld.y;
  let w = p.x - sx, h = p.y - sy;
  if (drag.mode !== 'line' && drag.mode !== 'arrow') {
    const shift = e.shiftKey;
    if (shift) {
      const m = Math.max(Math.abs(w), Math.abs(h)) * (w * h < 0 ? -1 : 1);
      w = m; h = m;
    }
  }
  const shape = drag.mode;
  state.draft = {
    type: shape,
    x: sx, y: sy, w, h,
    stroke: state.strokeColor,
    strokeWidth: state.strokeWidth,
    fill: state.fillColor,
    label: '',
  };
  drag.moved = true;
  draw();
});

canvas.addEventListener('pointerup', (e) => {
  if (!drag) return;
  const p = toWorld(e.clientX, e.clientY);
  const mode = drag.mode;

  if (mode === 'pencil') {
    if (drag.moved && state.draft.points.length > 1) {
      state.elements.push({ ...state.draft, id: makeElement('path').id });
      pushHistory();
    }
    state.draft = null;
    drag = null;
    draw();
    return;
  }

  if (mode === 'select') {
    drag = null;
    draw();
    return;
  }

  if (mode === 'move') {
    pushHistory();
    drag = null;
    draw();
    return;
  }

  if (['line', 'rect', 'ellipse', 'triangle', 'diamond', 'parallelogram', 'arrow'].includes(mode)) {
    const sx = drag.startWorld.x, sy = drag.startWorld.y;
    let w = p.x - sx, h = p.y - sy;
    if (mode !== 'line' && mode !== 'arrow' && e.shiftKey) {
      const m = Math.max(Math.abs(w), Math.abs(h)) * (w * h < 0 ? -1 : 1);
      w = m; h = m;
    }
    if (mode === 'line' || mode === 'arrow') {
      if (Math.hypot(p.x - sx, p.y - sy) < 3) { drag = null; state.draft = null; return; }
    } else {
      if (Math.abs(w) < 3 && Math.abs(h) < 3) { drag = null; state.draft = null; return; }
    }

    let el = makeElement(mode, {
      x: sx, y: sy, w, h,
      stroke: state.strokeColor,
      strokeWidth: state.strokeWidth,
      fill: state.fillColor,
    });

    if (mode === 'arrow') {
      // applique les aimants
      el = applyArrowSnap(el, p);
      el.label = prompt('Texte de la flèche (optionnel) :', '') || '';
    }

    state.elements.push(el);
    state.selected = [el];
    pushHistory();
    state.draft = null;
    drag = null;
    draw();
    return;
  }

  drag = null;
  state.draft = null;
  draw();
});

function applyArrowSnap(el, endWorld) {
  const anchors = getAllAnchors(state.elements);
  const R = 16 / state.zoom;
  const startAnchor = nearestAnchor(anchors, el.x, el.y, R);
  const endAnchor = nearestAnchor(anchors, endWorld.x, endWorld.y, R);

  if (startAnchor) {
    el.x = startAnchor.x; el.y = startAnchor.y;
    el.from = { id: startAnchor.elId, side: startAnchor.side };
  }
  const wa = el.w, ha = el.h;
  if (endAnchor) {
    el.w = endAnchor.x - el.x;
    el.h = endAnchor.y - el.y;
    el.to = { id: endAnchor.elId, side: endAnchor.side };
    el.toAnchor = endAnchor.side;
    // (optionally recompute label)
  }
  void wa; void ha;
  return el;
}

function nearestAnchor(anchors, x, y, radius) {
  let best = null, bestD = radius;
  for (const a of anchors) {
    const d = Math.hypot(a.x - x, a.y - y);
    if (d <= bestD) { bestD = d; best = a; }
  }
  return best;
}

function fillAt(p) {
  const hit = hitTest(state.elements, p.x, p.y);
  if (hit && SHAPE_TYPES.includes(hit.type)) {
    hit.fill = state.fillColor;
  }
  pushHistory();
  draw();
}

function addElement(el) {
  state.elements.push(el);
  state.selected = [el];
  pushHistory();
  draw();
}

// ---------- Clavier ----------
document.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  // raccourcis d'outil (hors champs texte)
  if (e.target.matches('input, textarea, select')) return;
  if (e.ctrlKey || e.metaKey) {
    if (e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo(); else undo();
      return;
    }
    if (e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (e.key.toLowerCase() === 'c') { e.preventDefault(); copySelection(); return; }
    if (e.key.toLowerCase() === 'v') { e.preventDefault(); pasteSelection(); return; }
    return;
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (state.selected.length) {
      const ids = new Set(state.selected.map(s => s.id));
      state.elements = state.elements.filter(el => !ids.has(el.id));
      state.selected = [];
      pushHistory();
      draw();
    }
    return;
  }
  if (e.key === 'Escape') { state.selected = []; draw(); return; }
  if (e.key === ' ') { e.preventDefault(); return; } // réserve espace pour pan
  if (TOOL_KEYS[k] && TOOL_KEYS[k] !== 'fill') {
    setTool(TOOL_KEYS[k]);
  } else if (k === 'f' || k === 'c') {
    setTool('fill');
  }
});

// ---------- Presse-papiers interne ----------
let clipboard = [];
function copySelection() {
  clipboard = serializeElements(state.selected);
}
function pasteSelection() {
  if (!clipboard.length) return;
  const ids = new Map();
  for (const c of clipboard) {
    const id = makeElement('rect').id;
    ids.set(c.id, id);
  }
  const newEls = clipboard.map(c => ({
    ...deserializeElements([c])[0],
    id: ids.get(c.id),
    x: c.x + 16, y: c.y + 16,
    from: c.from ? { ...c.from, id: ids.get(c.from.id) || c.from.id } : c.from,
    to: c.to ? { ...c.to, id: ids.get(c.to.id) || c.to.id } : c.to,
  }));
  state.elements.push(...newEls);
  state.selected = newEls;
  pushHistory();
  draw();
}

// ---------- Export ----------
async function exportPNG() {
  const scale = 3;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  if (!state.elements.length) { alert('Dessin vide'); return; }
  for (const el of state.elements) {
    if (el.type === 'path' && el.points) {
      for (const [x, y] of el.points) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
    } else {
      const ax = anchorPoint(el);
      const pts = [el.x, el.y, el.x + el.w, el.y + el.h, ax.top.x, ax.top.y, ax.bottom.x, ax.bottom.y];
      for (let i = 0; i < pts.length; i += 2) {
        minX = Math.min(minX, pts[i]); maxX = Math.max(maxX, pts[i]);
        minY = Math.min(minY, pts[i + 1]); maxY = Math.max(maxY, pts[i + 1]);
      }
    }
  }
  const pad = 50;
  const W = Math.ceil((maxX - minX + pad * 2)) * scale;
  const H = Math.ceil((maxY - minY + pad * 2)) * scale;
  if (W < 10) { alert('Contenu trop petit pour un export'); return; }
  const off = document.createElement('canvas');
  off.width = W; off.height = H;
  const octx = off.getContext('2d');
  octx.setTransform(scale, 0, 0, scale, 0, 0);
  octx.translate(-minX + pad, -minY + pad);
  render(octx, state.elements, { gridOn: state.gridOn, gridSize: state.gridSize, bgColor: '#ffffff' });

  const link = document.createElement('a');
  link.download = 'drawing.png';
  link.href = off.toDataURL('image/png');
  link.click();
}

function saveNative() {
  const data = {
    format: 'sputnk-draw',
    version: 1,
    app: 'Sputnk Draw',
    exportedAt: new Date().toISOString(),
    elements: serializeElements(state.elements),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'drawing.spdraw';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function openNative(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      const els = data.elements || (Array.isArray(data) ? data : null);
      if (!Array.isArray(els)) throw new Error('format invalide');
      pushHistory();
      state.elements = deserializeElements(els);
      state.selected = [];
      draw();
      alert('Dessin ouvert : ' + els.length + ' élément(s)');
    } catch (err) {
      alert('Fichier invalide');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

// ---------- Pan (clic droit OU espace + glisser) et zoom molette ----------
let spaceHeld = false, panState = null;
canvas.addEventListener('pointerdown', (e) => {
  if (e.button === 2 || (e.button === 0 && spaceHeld)) {
    panState = { lastX: e.clientX, lastY: e.clientY };
    e.preventDefault();
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (panState) {
    state.panX += e.clientX - panState.lastX;
    state.panY += e.clientY - panState.lastY;
    panState.lastX = e.clientX;
    panState.lastY = e.clientY;
    draw();
  }
});
document.addEventListener('pointerup', () => { panState = null; });
document.addEventListener('keydown', (e) => { if (e.key === ' ') spaceHeld = true; });
document.addEventListener('keyup', (e) => { if (e.key === ' ') { spaceHeld = false; } });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.1 : 1 / 1.1);
}, { passive: false });

// ---------- Init ----------
function init() {
  load();
  resizeCanvas();
  window.addEventListener('resize', () => { resizeCanvas(); draw(); });
  // état de départ si vide
  if (!state.elements.length) {
    // espace de travail par défaut vide — l'utilisateur dessine
  }
  initUI();
  pushHistory(); // point de départ pour undo
  setTool('select');
  draw();
}

document.addEventListener('DOMContentLoaded', init);