// Site layout: the landing page is at the root and the game, a single-page app, lives under /play.
// The server, the Vite dev server and the client all route with these.

export const PLAY_PATH = "/play";

const WORLD_PATH = /^\/play\/w\/([a-z0-9]{4,32})\/?$/i;
const OLD_WORLD_PATH = /^\/w\/([a-z0-9]{4,32})\/?$/i;

/** A co-op world's page, which is also its invite link. */
export function worldPath(id: string): string {
  return `${PLAY_PATH}/w/${id}`;
}

/** The world id in a world page's path (see worldPath), or null. */
export function worldIdFromPath(pathname: string): string | null {
  return pathname.match(WORLD_PATH)?.[1]?.toLowerCase() ?? null;
}

/** Whether a page belongs to the game (any extensionless path under /play) rather than the site. */
export function isGamePath(pathname: string): boolean {
  return /^\/play(\/[^.]*)?$/.test(pathname);
}

/**
 * Where a link from before the game moved to /play points now, or null: invite links (/w/<id>)
 * and offline games (/?offline…) that players may have saved or shared.
 */
export function movedPath(pathname: string, search: string): string | null {
  const invite = pathname.match(OLD_WORLD_PATH)?.[1];
  if (invite) return worldPath(invite.toLowerCase()) + search;
  if (pathname === "/" && /[?&]offline(?:[=&]|$)/.test(search)) return PLAY_PATH + search;
  return null;
}
