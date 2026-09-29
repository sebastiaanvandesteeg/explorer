type Child = Node | string | null | undefined | false;

/** Tiny element builder: h("div.card#id", { onclick }, "text", child). */
export function h<T extends HTMLElement = HTMLElement>(
  spec: string,
  props: Partial<Record<string, unknown>> = {},
  ...children: Child[]
): T {
  const [tagAndClasses, id] = spec.split("#");
  const [tag, ...classes] = tagAndClasses!.split(".");
  const el = document.createElement(tag || "div") as T;
  if (id) el.id = id;
  if (classes.length) el.className = classes.join(" ");
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k.startsWith("on") && typeof v === "function")
      el.addEventListener(k.slice(2), v as EventListener);
    else if (k === "dataset" && typeof v === "object") Object.assign(el.dataset, v);
    else if (k in el && typeof v !== "string") (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

export function clear(el: HTMLElement): void {
  while (el.firstChild) el.firstChild.remove();
}
