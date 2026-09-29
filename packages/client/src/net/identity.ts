// Name and reconnect token live in localStorage, so a returning player keeps their slot.
const NAME_KEY = "explorer.name";
const TOKEN_KEY = "explorer.token";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode or storage disabled: identity just won't persist.
  }
}

let memoryToken: string | null = null;

export function playerToken(): string {
  let t = read(TOKEN_KEY) ?? memoryToken;
  if (!t) {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    t = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    memoryToken = t;
    write(TOKEN_KEY, t);
  }
  return t;
}

export function playerName(): string {
  return read(NAME_KEY) ?? "";
}

export function savePlayerName(name: string): void {
  write(NAME_KEY, name);
}
