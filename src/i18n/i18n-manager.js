import { LOCALES } from "./locales/index.js";

// =============================================================================
// STATE
// =============================================================================

let currentLanguage = "en";
const listeners = new Set();

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

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

function resolvePath(object, path) {
  return path
    .split(".")
    .reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), object);
}

function formatString(template, params = {}) {
  if (typeof template !== "string") return template ?? "";
  return template.replace(/\{(\w+)\}/g, (_, key) => (params[key] !== undefined ? String(params[key]) : ""));
}

function notifyListeners() {
  listeners.forEach((callback) => {
    try {
      callback(currentLanguage);
    } catch {}
  });
}

function saveToLocalStorage() {
  try {
    localStorage.setItem("app_language", currentLanguage);
  } catch {}
}

// =============================================================================
// PUBLIC API
// =============================================================================

export function getLanguage() {
  return currentLanguage;
}

export function t(key, params = {}) {
  const raw = resolvePath(LOCALES[currentLanguage], key);
  return formatString(typeof raw === "string" ? raw : "", params);
}

/**
 * Translate a text about a number. The key holds one form per plural
 * category of the language (one, few, many, other), each with {count}.
 * @param {string} key - Translation key of the forms
 * @param {number} count - The number the text is about
 * @param {Object} [params] - Further placeholders
 * @returns {string}
 */
export function tPlural(key, count, params = {}) {
  const forms = resolvePath(LOCALES[currentLanguage], key);
  if (!forms || typeof forms !== "object") return "";
  const category = new Intl.PluralRules(currentLanguage).select(count);
  return formatString(forms[category] ?? forms.other ?? "", { count, ...params });
}

export function setLanguage(lang) {
  const next = lang === "ru" ? "ru" : "en";
  if (next === currentLanguage) return currentLanguage;
  
  currentLanguage = next;
  saveToLocalStorage();
  notifyListeners();
  
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
  try {
    await window?.electronAPI?.settings?.update?.({ language: lang });
  } catch {}
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
  return () => { };
}

export default {
  getLanguage,
  setLanguage,
  initLanguage,
  toggleLanguage,
  persistLanguageToSettings,
  onLanguageChange,
  t,
  tPlural,
};