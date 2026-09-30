// The pack: what your character carries, as a grid of slots. Select a slot to read about the item and
// to drop it on the ground; other players can pick it up from there.
import { ITEMS, PACK_SLOTS, type ItemKind, type ItemStack } from "@explorer/shared";
import { h } from "./dom";

export interface PackActions {
  drop(slot: number, amount: number | undefined): void;
}

const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

/** A little gem-shaped icon in an item's own colours. */
export function itemIcon(kind: ItemKind): HTMLElement {
  const [body, light] = ITEMS[kind].colour;
  const el = h("span.item-icon", { dataset: { rarity: ITEMS[kind].rarity } });
  el.style.setProperty("--item-body", hex(body));
  el.style.setProperty("--item-light", hex(light));
  return el;
}

export class PackPanel {
  readonly root: HTMLElement;
  private readonly grid = h("div.pack-grid");
  private readonly detail = h("div.pack-detail");
  private readonly badge = h("span.badge");
  private readonly panel: HTMLElement;
  private pack: readonly ItemStack[] = [];
  private selected = -1;
  private key = "";
  private opened = false;

  constructor(private readonly actions: PackActions) {
    this.panel = h(
      "div.pack.panel",
      { style: { display: "none" } },
      h("h3", {}, "Pack", h("span.kbd", {}, "I")),
      this.grid,
      this.detail,
    );
    const button = h(
      "button.btn.pack-btn",
      { title: "Open your pack (I)", onclick: () => this.toggle() },
      "Pack ",
      this.badge,
    );
    this.root = h("div.pack-wrap", { style: { display: "none" } }, this.panel, button);
  }

  get isOpen(): boolean {
    return this.opened;
  }

  /** Adventure worlds only: colony worlds have no pack. */
  setAvailable(on: boolean): void {
    this.root.style.display = on ? "" : "none";
  }

  toggle(): void {
    this.opened = !this.opened;
    this.panel.style.display = this.opened ? "" : "none";
  }

  close(): void {
    if (this.opened) this.toggle();
  }

  /** Show the pack of your character (redrawn only when something in it changed). */
  set(pack: readonly ItemStack[]): void {
    const key = pack.map((s) => `${s.kind}:${s.amount}`).join("|");
    if (key === this.key) return;
    this.key = key;
    this.pack = pack;
    if (this.selected >= pack.length) this.selected = pack.length - 1;
    this.draw();
  }

  private draw(): void {
    this.badge.textContent = `${this.pack.length}/${PACK_SLOTS}`;
    const slots: HTMLElement[] = [];
    for (let i = 0; i < PACK_SLOTS; i++) {
      const s = this.pack[i];
      const el = h(
        s ? "button.slot" : "div.slot.empty",
        s
          ? {
              title: ITEMS[s.kind].name,
              "aria-pressed": String(i === this.selected),
              onclick: () => {
                this.selected = this.selected === i ? -1 : i;
                this.draw();
              },
            }
          : {},
        s ? itemIcon(s.kind) : null,
        s && s.amount > 1 ? h("span.count", {}, String(s.amount)) : null,
      );
      if (i === this.selected) el.classList.add("selected");
      slots.push(el);
    }
    this.grid.replaceChildren(...slots);
    const s = this.pack[this.selected];
    if (!s) {
      this.detail.replaceChildren(
        h(
          "p.hint",
          {},
          this.pack.length === 0 ? "Your pack is empty." : "Select something to see it.",
        ),
      );
      return;
    }
    const def = ITEMS[s.kind];
    this.detail.replaceChildren(
      h("p.name", { dataset: { rarity: def.rarity } }, def.name, h("small", {}, ` ${def.rarity}`)),
      h("p.blurb", {}, def.blurb),
      h(
        "div.actions",
        {},
        h(
          "button.btn.mini",
          {
            title: "Put one down where you stand",
            onclick: () => this.actions.drop(this.selected, 1),
          },
          "Drop one",
        ),
        s.amount > 1
          ? h(
              "button.btn.mini",
              {
                title: "Put the whole stack down",
                onclick: () => this.actions.drop(this.selected, undefined),
              },
              `Drop all ${s.amount}`,
            )
          : null,
      ),
    );
  }
}
