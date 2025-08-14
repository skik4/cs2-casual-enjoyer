import STRINGS, { EN, RU_OVERRIDES } from "./strings.js";

let currentLanguage = "en";
const listeners = new Set();

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function buildLocale(locale) {
  if (locale === "ru") {
    const merged = deepClone(EN);
    for (const key of Object.keys(RU_OVERRIDES)) {
      merged[key] = { ...(merged[key] || {}), ...RU_OVERRIDES[key] };
    }
    return merged;
  }
  return deepClone(EN);
}

function getSystemLanguage() {
  try {
    const lang = (navigator?.language || navigator?.userLanguage || "en")
      .toLowerCase()
      .trim();
    return lang.startsWith("ru") ? "ru" : "en";
  } catch {
    return "en";
  }
}

export function getLanguage() {
  return currentLanguage;
}

export function setLanguage(lang) {
  const next = lang === "ru" ? "ru" : "en";
  if (next === currentLanguage) return currentLanguage;
  const newStrings = buildLocale(next);
  Object.keys(STRINGS).forEach((k) => delete STRINGS[k]);
  Object.assign(STRINGS, newStrings);
  currentLanguage = next;
  try {
    localStorage.setItem("app_language", currentLanguage);
  } catch {}
  try {
    listeners.forEach((cb) => {
      try {
        cb(currentLanguage);
      } catch {}
    });
  } catch {}
  return currentLanguage;
}

export function initLanguage(preferred) {
  let chosen = preferred;
  if (!chosen) {
    try {
      const stored = localStorage.getItem("app_language");
      chosen = stored || getSystemLanguage();
    } catch {
      chosen = getSystemLanguage();
    }
  }
  return setLanguage(chosen);
}

export async function persistLanguageToSettings(lang) {
  // Best-effort persistence via electron settings
  if (window?.electronAPI?.settings?.load && window?.electronAPI?.settings?.save) {
    try {
      const current = await window.electronAPI.settings.load();
      const updated = { ...(current || {}), language: lang };
      await window.electronAPI.settings.save(updated);
    } catch {}
  }
}

export function toggleLanguage() {
  const next = currentLanguage === "ru" ? "en" : "ru";
  return setLanguage(next);
}

export function onLanguageChange(callback) {
  if (typeof callback === "function") {
    listeners.add(callback);
    return () => listeners.delete(callback);
  }
  return () => {};
}

export function offLanguageChange(callback) {
  listeners.delete(callback);
}

export default {
  getLanguage,
  setLanguage,
  initLanguage,
  toggleLanguage,
  persistLanguageToSettings,
  onLanguageChange,
  offLanguageChange,
};


