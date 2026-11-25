const opening = document.querySelector('#opening');
const heading = document.querySelector('#work');
const canvas = document.querySelector('#sculpture');
const toggle = document.querySelector('#motion-toggle');
const motion = matchMedia('(prefers-reduced-motion: reduce)');
const compact = matchMedia('(max-height: 615px) and (min-width: 601px)');
const connection = navigator.connection;
const limitedHardware = (navigator.deviceMemory && navigator.deviceMemory <= 2)
  || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2);

let sculpture;
let load;
let frame = 0;
let passage = 0;
let paused = false;
let renderingFailed = false;

function mayRender() {
  return !motion.matches && !compact.matches && !connection?.saveData
    && !limitedHardware && !renderingFailed;
}

function setSceneMode(mode) {
  if (opening.dataset.scene === mode) return;
  const headingTop = heading.getBoundingClientRect().top;
  opening.dataset.scene = mode;
  if (headingTop <= 1) {
    // Preserve the visitor's position in the gallery or a later section.
    const offset = heading.getBoundingClientRect().top - headingTop;
    if (offset) scrollBy(0, offset);
  }
}

function stopScene() {
  cancelAnimationFrame(frame);
  frame = 0;
  setSceneMode('static');
}

function paint() {
  frame = 0;
  const distance = -opening.getBoundingClientRect().top;
  if (distance > passage + 4) return;
  sculpture.draw(Math.max(0, Math.min(1, distance / Math.max(1, passage))));
}

function queuePaint() {
  if (opening.dataset.scene === 'live' && !frame) frame = requestAnimationFrame(paint);
}

function measure() {
  passage = heading.offsetTop;
  queuePaint();
}

async function updateScene() {
  const available = mayRender();
  toggle.hidden = !available || !sculpture;
  toggle.textContent = paused ? 'Включить 3D' : 'Выключить 3D';
  if (!available || paused) {
    stopScene();
    return;
  }

  try {
    load ??= import('./sculpture.mjs').then(({ createSculpture }) => createSculpture(canvas));
    sculpture = await load;
    if (!mayRender() || paused) return;
    sculpture.draw(0);
    setSceneMode('live');
    toggle.hidden = false;
    measure();
  } catch {
    renderingFailed = true;
    toggle.hidden = true;
    stopScene();
  }
}

toggle.addEventListener('click', () => {
  paused = !paused;
  void updateScene();
});
canvas.addEventListener('webglcontextlost', () => {
  renderingFailed = true;
  toggle.hidden = true;
  stopScene();
});

addEventListener('scroll', queuePaint, { passive: true });
addEventListener('resize', measure, { passive: true });
motion.addEventListener('change', updateScene);
compact.addEventListener('change', updateScene);
connection?.addEventListener('change', updateScene);

opening.dataset.scene = 'static';
// Let the HTML, poster and top-level styling paint before creating the mesh.
requestAnimationFrame(() => setTimeout(() => void updateScene(), 0));
