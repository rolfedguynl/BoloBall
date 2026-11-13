/**
 * GitHub Pages lets browsers cache index.html for a while, and a stale
 * index.html keeps loading the old hashed JS/CSS. Each build writes its id to
 * version.json; if the deployed id differs from the one baked into this
 * bundle, reload once to a fresh URL so the new build is fetched.
 */
const GUARD_KEY = 'boloball-reloaded-for';
const RETRY_MS = 2000;

async function fetchDeployedBuild(): Promise<string | null> {
  try {
    const res = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as { build?: unknown };
    return typeof data.build === 'string' ? data.build : null;
  } catch {
    return null;
  }
}

function alreadyReloadedFor(build: string): boolean {
  try {
    return sessionStorage.getItem(GUARD_KEY) === build;
  } catch {
    // No storage means no loop guard, so don't risk reloading at all.
    return true;
  }
}

function reloadTo(build: string): void {
  try {
    sessionStorage.setItem(GUARD_KEY, build);
  } catch {
    return;
  }
  const url = new URL(window.location.href);
  url.searchParams.set('v', build);
  window.location.replace(url.toString());
}

/** @param canReload returns true when reloading would not interrupt a game. */
export function startUpdateCheck(canReload: () => boolean): void {
  if (import.meta.env.DEV) return;

  let pending: string | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;

  const tryReload = (): void => {
    if (!pending || !canReload()) return;
    if (timer !== null) clearInterval(timer);
    timer = null;
    reloadTo(pending);
  };

  const check = async (): Promise<void> => {
    const deployed = await fetchDeployedBuild();
    if (!deployed || deployed === __BUILD_ID__ || alreadyReloadedFor(deployed)) return;
    pending = deployed;
    tryReload();
    // Mid-game: wait until the player is back on the menu or results.
    if (pending && timer === null) timer = setInterval(tryReload, RETRY_MS);
  };

  void check();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void check();
  });
}
