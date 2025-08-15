import i18n, { t } from "./i18n-manager.js";

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

function applyKeyToElement(el, key, attr = "text", params = {}) {
  const value = t(key, params);
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

function parseParams(el) {
  const raw = el.getAttribute("data-i18n-params");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function updateLanguageButton() {
  const langBtn = document.getElementById("language-btn");
  if (langBtn) {
    langBtn.textContent = i18n.getLanguage().toUpperCase();
  }
}

// =============================================================================
// PUBLIC API
// =============================================================================

export function applyI18nToDom() {
  if (typeof document === "undefined") return;

  try {
    document.title = t("common.appTitle");

    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key1 = el.getAttribute("data-i18n");
      if (key1) {
        const attr1 = el.getAttribute("data-i18n-attr") || "text";
        applyKeyToElement(el, key1, attr1, parseParams(el));
      }

      const key2 = el.getAttribute("data-i18n-second");
      if (key2) {
        const attr2 = el.getAttribute("data-i18n-attr-second") || "text";
        applyKeyToElement(el, key2, attr2, parseParams(el));
      }
    });
  } catch {
    // Silent fail for safety during boot
  }
}

export async function toggleLanguageAndApply() {
  try {
    i18n.toggleLanguage();
    applyI18nToDom();
    updateLanguageButton();
    await i18n.persistLanguageToSettings(i18n.getLanguage());
  } catch { }
}

export function setupInitialLanguage(preferredLanguage) {
  i18n.initLanguage(preferredLanguage);
  updateLanguageButton();
  i18n.onLanguageChange(() => applyI18nToDom());
}