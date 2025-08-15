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
  if (window?.electronAPI?.settings?.load && window?.electronAPI?.settings?.save) {
    try {
      const current = await window.electronAPI.settings.load();
      const updated = { ...(current || {}), language: lang };
      await window.electronAPI.settings.save(updated);
    } catch { }
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
  return () => { };
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
  t,
};