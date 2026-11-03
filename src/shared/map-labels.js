/**
 * Map names as players know them, for the views and the join bar
 */

export const MAP_LABELS = {
  de_dust2: "Dust II",
  de_mirage: "Mirage",
  de_inferno: "Inferno",
  de_nuke: "Nuke",
  de_overpass: "Overpass",
  de_vertigo: "Vertigo",
  de_ancient: "Ancient",
  de_anubis: "Anubis",
  de_train: "Train",
  de_cache: "Cache",
  cs_office: "Office",
  cs_italy: "Italy",
  cs_agency: "Agency",
};

/**
 * Human-readable name of a map
 * @param {string} map - Map code, e.g. de_dust2
 * @returns {string}
 */
export function mapLabel(map) {
  if (MAP_LABELS[map]) return MAP_LABELS[map];
  const bare = String(map || "").replace(/^[a-z]{2}_/, "");
  return bare ? bare.charAt(0).toUpperCase() + bare.slice(1) : String(map || "");
}
