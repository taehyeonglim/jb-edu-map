/**
 * Persists which VWorld basemap the "배경 지도" segmented control (DeckMap's
 * MapOverlay item) is showing, across page loads. Three modes since the
 * bright-diorama redesign (2026-09-21, spec §2):
 *
 * - `off`       — no tiles; the map uses the dark HUD floor.
 * - `night`     — `midnight` road-map png tiles, the default for new visitors.
 * - `satellite` — `Satellite` jpeg tiles under a navy wash.
 * - `base`      — `Base` road-map png tiles, desaturated under a navy wash.
 *
 * Storage key is unchanged from the boolean era (2차 개선 Task C), so the old
 * "1"/"0" values are still read back as satellite/off — a returning user who
 * had switched the midnight basemap off keeps it off.
 *
 * `localStorage` access is wrapped in try/catch because it can throw
 * synchronously in some private-browsing modes (notably older Safari) even
 * just on `getItem`/`setItem` — this module treats that exactly like
 * "nothing stored yet": default night, write silently no-ops.
 * `typeof window === "undefined"` guards SSR/non-DOM callers (DeckMap itself
 * is client-only — see MapShell.tsx's `ssr:false` — but this module makes no
 * assumption about who calls it).
 */
export type BasemapMode = "off" | "night" | "satellite" | "base";

const STORAGE_KEY = "jbmap.basemap";
const DEFAULT_MODE: BasemapMode = "night";

function parse(raw: string | null): BasemapMode {
  if (raw === null) return DEFAULT_MODE;
  if (raw === "1") return "satellite"; // 2차 개선(Task C) boolean-era value: ON
  if (raw === "0") return "off"; // …and OFF
  if (raw === "off" || raw === "night" || raw === "satellite" || raw === "base") return raw;
  return DEFAULT_MODE; // garbage → default
}

/** No stored value yet -> night by default. The caller gates on `NEXT_PUBLIC_VWORLD_KEY`. */
export function readBasemapPref(): BasemapMode {
  if (typeof window === "undefined") return DEFAULT_MODE;
  try {
    return parse(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_MODE;
  }
}

export function writeBasemapPref(mode: BasemapMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Private mode / storage disabled / quota exceeded — the control still
    // works for the rest of this session, it just won't be remembered next
    // time. Not worth surfacing to the user.
  }
}
