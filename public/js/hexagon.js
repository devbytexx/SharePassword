// Hexagon-Hintergrund-Animation — adaptiert von bytexx.de
// (Original: https://bytexx.de/bytexx.js, Lizenz: BYTEXX-eigen)
// Hier: theme-aware Farben, transparenter Hintergrund, automatisches Resize.

const HEX_RADIUS = 80;
const HEX_MAX_SPEED = 0.09;
const HEX_GAP = 3;
const HEX_LINE_WIDTH = 0.5;

const SQRT3 = Math.sqrt(3);

let canvas, ctx, hexagons = [], rafId = null;

function readThemeColors() {
  // Sehr dezent — sollen nur ganz leicht durchscheinen.
  const dark = isDark();
  return {
    line: dark ? '#F5841F' : '#245398',
    shadow: dark ? 'rgba(245,132,31,0.18)' : 'rgba(36,83,152,0.12)',
    alpha: dark ? 0.18 : 0.22
  };
}

function isDark() {
  const t = document.documentElement.getAttribute('data-theme');
  if (t === 'dark') return true;
  if (t === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function setupCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
}

function buildHexagons() {
  hexagons = [];
  const w = window.innerWidth;
  const h = window.innerHeight;
  const hw = Math.ceil(w / (1.5 * HEX_RADIUS + HEX_GAP * 2)) + 1;
  const hh = Math.ceil(h / (SQRT3 * HEX_RADIUS + HEX_GAP * 2)) + 1;

  for (let x = 0; x < hw; x++) {
    for (let y = 0; y < hh; y++) {
      const cx = HEX_RADIUS + HEX_GAP + (1.5 * HEX_RADIUS + HEX_GAP * 2) * x;
      const cy = SQRT3 * HEX_RADIUS / 2 + HEX_GAP +
                 (SQRT3 * HEX_RADIUS + HEX_GAP * 2) * y -
                 (x % 2 ? SQRT3 * HEX_RADIUS / 2 : 0);
      hexagons.push({
        sl: 0,
        p: Math.random(),
        x: cx,
        y: cy,
        speed: Math.random() * HEX_MAX_SPEED * 2 - HEX_MAX_SPEED
      });
    }
  }
}

function drawHexagonPath(hex) {
  ctx.moveTo(
    hex.x + Math.cos(Math.PI / 3 * hex.sl) * HEX_RADIUS +
            Math.cos(Math.PI / 3 * (hex.sl + 2)) * HEX_RADIUS * hex.p,
    hex.y + Math.sin(Math.PI / 3 * hex.sl) * HEX_RADIUS +
            Math.sin(Math.PI / 3 * (hex.sl + 2)) * HEX_RADIUS * hex.p
  );
  for (let k = 1; k <= 3; k++) {
    ctx.lineTo(
      hex.x + Math.cos(Math.PI / 3 * (hex.sl + k)) * HEX_RADIUS,
      hex.y + Math.sin(Math.PI / 3 * (hex.sl + k)) * HEX_RADIUS
    );
  }
  ctx.lineTo(
    hex.x + Math.cos(Math.PI / 3 * (hex.sl + 3)) * HEX_RADIUS +
            Math.cos(Math.PI / 3 * (hex.sl + 5)) * HEX_RADIUS * hex.p,
    hex.y + Math.sin(Math.PI / 3 * (hex.sl + 3)) * HEX_RADIUS +
            Math.sin(Math.PI / 3 * (hex.sl + 5)) * HEX_RADIUS * hex.p
  );

  hex.p += hex.speed;
  if (hex.p > 1 || hex.p < 0) {
    hex.p = hex.speed < 0 ? 1 : 0;
    hex.sl += hex.speed < 0 ? -1 : 1;
    hex.sl = hex.sl % 6;
    if (hex.sl < 0) hex.sl += 6;
  }
}

function loop() {
  rafId = requestAnimationFrame(loop);
  const colors = readThemeColors();

  // Vollständig leeren — Transform kurz zurücksetzen. Der Kontext ist per dpr
  // skaliert; bei devicePixelRatio < 1 (Rauszoomen) würde clearRect mit den
  // Geräte-Pixel-Maßen canvas.width/height nur einen Bruchteil löschen, der
  // Rest akkumuliert Striche und wird zur „lauten" Fläche.
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
  ctx.globalAlpha = colors.alpha;
  ctx.beginPath();
  for (const hex of hexagons) drawHexagonPath(hex);
  ctx.lineWidth = HEX_LINE_WIDTH;
  ctx.strokeStyle = colors.line;
  ctx.shadowColor = colors.shadow;
  ctx.shadowBlur = 6;
  ctx.stroke();
}

function init() {
  canvas = document.getElementById('hex-canvas');
  if (!canvas) return;
  ctx = canvas.getContext('2d');
  setupCanvas();
  buildHexagons();
  if (rafId) cancelAnimationFrame(rafId);
  loop();
}

let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(init, 150);
});

// Respect "reduce motion" preference: skip the animation entirely
if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  // No animation — leave the canvas empty
} else {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}
