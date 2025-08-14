import STRINGS from "./strings.js";
import i18n from "./i18n-manager.js";

function resolvePath(object, path) {
  return path.split(".").reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), object);
}

function formatString(template, params = {}) {
  if (typeof template !== "string") return template;
  return template.replace(/\{(\w+)\}/g, (_, key) => (params[key] !== undefined ? String(params[key]) : ""));
}

function applyKeyToElement(el, key, attr = "text", params = {}) {
  const value = formatString(resolvePath(STRINGS, key) ?? "", params);
  switch (attr) {
    case "text":
      el.textContent = value;
      break;
    case "title":
      el.title = value;
      break;
    case "placeholder":
      if ("placeholder" in el) el.placeholder = value;
      break;
    case "html":
      el.innerHTML = value;
      break;
    default:
      el.textContent = value;
  }
}

/**
 * Apply i18n strings to elements annotated with data-i18n* attributes.
 * Supports:
 *  - data-i18n (with data-i18n-attr="text|title|placeholder|html")
 *  - data-i18n-text, data-i18n-title, data-i18n-placeholder, data-i18n-html
 *  - data-i18n-params='{"key":"value"}' to fill placeholders
 */
export function applyI18nToDom() {
  try {
    // Update document title if present
    const docTitle = resolvePath(STRINGS, "common.appTitle");
    if (typeof document !== "undefined" && typeof docTitle === "string") {
      document.title = docTitle;
    }

    const parseParams = (el) => {
      const raw = el.getAttribute("data-i18n-params");
      if (!raw) return {};
      try {
        return JSON.parse(raw);
      } catch {
        return {};
      }
    };

    // Explicit attributes
    const map = [
      { selector: "[data-i18n-text]", attr: "text", attrName: "data-i18n-text" },
      { selector: "[data-i18n-title]", attr: "title", attrName: "data-i18n-title" },
      { selector: "[data-i18n-placeholder]", attr: "placeholder", attrName: "data-i18n-placeholder" },
      { selector: "[data-i18n-html]", attr: "html", attrName: "data-i18n-html" },
    ];

    for (const { selector, attr, attrName } of map) {
      document.querySelectorAll(selector).forEach((el) => {
        const key = el.getAttribute(attrName);
        if (!key) return;
        applyKeyToElement(el, key, attr, parseParams(el));
      });
    }

    // Generic data-i18n + optional data-i18n-attr
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (!key) return;
      const attr = el.getAttribute("data-i18n-attr") || "text";
      applyKeyToElement(el, key, attr, parseParams(el));
    });
  } catch (e) {
    // Silent fail for safety in early boot
  }
}

export default { applyI18nToDom };

export async function toggleLanguageAndApply() {
  try {
    const next = i18n.toggleLanguage();
    applyI18nToDom();
    // Update static texts rendered outside data-i18n (templates read STRINGS at runtime)
    // Also update language button label
    const langBtn = document.getElementById("language-btn");
    if (langBtn) langBtn.textContent = next.toUpperCase();
    // Ask NotificationManager to refresh any open notifications' texts
    try {
      const mod = await import('../ui/notification-manager.js');
      if (mod?.default?.refreshTextsAfterLanguageChange) {
        await mod.default.refreshTextsAfterLanguageChange();
      }
    } catch {}
    // Refresh tutorial modal if it's open
    try {
      const tmod = await import('../ui/tutorial/tutorial-manager.js');
      if (tmod?.default?.refreshTextsAfterLanguageChange) {
        await tmod.default.refreshTextsAfterLanguageChange();
      }
    } catch {}
    await i18n.persistLanguageToSettings(next);
  } catch {}
}

export function setupInitialLanguage(preferredLanguage) {
  const chosen = i18n.initLanguage(preferredLanguage);
  try {
    const langBtn = document.getElementById("language-btn");
    if (langBtn) langBtn.textContent = i18n.getLanguage().toUpperCase();
  } catch {}
  // Subscribe to language change to re-apply i18n on static DOM
  try {
    i18n.onLanguageChange(() => applyI18nToDom());
  } catch {}
}

export function getLanguage() {
  return i18n.getLanguage();
}