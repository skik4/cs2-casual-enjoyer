// UI and utilities
import DOMUtils from "../utils/dom-utils.js";
import logger from "../utils/logger.js";
import { t, onLanguageChange } from "../i18n/i18n-manager.js";

/**
 * The update notice in the footer, beside the version: a newer version
 * downloading, then a link that restarts the app into it. It says nothing
 * the rest of the time. The restart waits for the user's click, so no join
 * is cut short; without one the update goes in the next time the app quits.
 */
class UpdateNotice {
  static _initialized = false;
  /** @type {{state: string, version?: string, percent?: number}|null} */
  static _status = null;

  /**
   * Show the updater's status now and on every change
   */
  static async initialize() {
    if (this._initialized) return;
    this._initialized = true;
    const api = window.electronAPI?.updates;
    if (!api) return;

    DOMUtils.getElementById("update-notice")?.addEventListener("click", () =>
      this.install()
    );
    api.onStatus((status) => this.render(status));
    onLanguageChange(() => this.render(this._status));
    // The updater may have moved on before this subscribed
    this.render(await api.getStatus());
  }

  /**
   * @param {{state: string, version?: string, percent?: number}|null} status
   */
  static render(status) {
    this._status = status;
    const notice = DOMUtils.getElementById("update-notice");
    if (!notice) return;

    const ready = status?.state === "ready";
    let text = "";
    if (status?.state === "downloading" && status.version) {
      text = t("update.downloading", {
        version: status.version,
        percent: status.percent ?? 0,
      });
    } else if (ready) {
      text = t("update.ready", { version: status.version });
    }
    notice.textContent = text;
    notice.title = ready ? t("update.readyTitle") : "";
    notice.disabled = !ready;
    notice.classList.toggle("ready", ready);
    notice.classList.toggle("hidden", !text);
  }

  /**
   * Restart into the downloaded version
   */
  static async install() {
    if (this._status?.state !== "ready") return;
    logger.info("UpdateNotice", "Restarting into the update", {
      version: this._status.version,
    });
    await window.electronAPI.updates.install();
  }
}

export default UpdateNotice;
