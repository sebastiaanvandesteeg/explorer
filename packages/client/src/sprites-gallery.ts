// Dev page: every atlas frame at 1× and 3×, next to the concept art, for comparing style.
interface Frame {
  frame: { x: number; y: number; w: number; h: number };
}
interface Page {
  frames: Record<string, Frame>;
  meta: { image: string };
}
interface Manifest {
  pages: string[];
  sprites: Record<string, { page: number; anchorX: number; anchorY: number }>;
}

const style = document.createElement("style");
style.textContent = `
  body { margin: 0; background: #2b3a2a; color: #fbf0cf; font: 13px/1.4 system-ui, sans-serif; }
  header { padding: 12px 16px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  input { background: #1b1a1f; color: inherit; border: 1px solid #805832; padding: 6px 8px; border-radius: 4px; }
  main { display: flex; flex-wrap: wrap; gap: 10px; padding: 0 16px 24px; }
  figure { margin: 0; padding: 8px; background: #3c522c; border-radius: 6px; display: flex; flex-direction: column; align-items: center; gap: 4px; }
  figcaption { font-size: 11px; opacity: .85; }
  canvas { image-rendering: pixelated; }
  .row { display: flex; gap: 6px; align-items: end; }
  .concept { width: min(900px, 100%); border-radius: 6px; margin: 0 16px 16px; display: block; }
`;
document.head.appendChild(style);

const manifest = (await fetch("/assets/atlas.json").then((r) => r.json())) as Manifest;
const pages = await Promise.all(
  manifest.pages.map(async (file) => {
    const page = (await fetch(`/assets/${file}`).then((r) => r.json())) as Page;
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = `/assets/${page.meta.image}`;
    });
    return { page, image };
  }),
);
const atlas = {
  frames: Object.fromEntries(
    Object.entries(manifest.sprites).map(([name, m]) => [
      name,
      { ...pages[m.page]!.page.frames[name]!, page: m.page },
    ]),
  ),
  explorer: manifest.sprites,
};

const header = document.createElement("header");
header.innerHTML = `<strong>Explorer sprites</strong><span>${Object.keys(atlas.frames).length} frames</span>`;
const filter = document.createElement("input");
filter.placeholder = "Filter by name…";
header.appendChild(filter);
document.body.appendChild(header);

const concept = document.createElement("img");
concept.src = "/concept-art.webp";
concept.className = "concept";
concept.alt = "Concept art";
concept.onerror = () => concept.remove();
document.body.appendChild(concept);

const main = document.createElement("main");
document.body.appendChild(main);

function draw(name: string, scale: number): HTMLCanvasElement {
  const { x, y, w, h } = atlas.frames[name]!.frame;
  const c = document.createElement("canvas");
  c.width = w * scale;
  c.height = h * scale;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(pages[atlas.frames[name]!.page]!.image, x, y, w, h, 0, 0, w * scale, h * scale);
  const a = atlas.explorer[name];
  if (a && scale > 1) {
    ctx.fillStyle = "#ff00ff";
    ctx.fillRect(a.anchorX * scale, a.anchorY * scale, scale, scale);
  }
  return c;
}

const figures = Object.keys(atlas.frames).map((name) => {
  const fig = document.createElement("figure");
  const row = document.createElement("div");
  row.className = "row";
  row.append(draw(name, 1), draw(name, 3));
  const cap = document.createElement("figcaption");
  cap.textContent = name;
  fig.append(row, cap);
  main.appendChild(fig);
  return { name, fig };
});

filter.addEventListener("input", () => {
  const q = filter.value.trim().toLowerCase();
  for (const { name, fig } of figures) fig.style.display = name.includes(q) ? "" : "none";
});

export {};
