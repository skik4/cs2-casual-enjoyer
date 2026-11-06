// UI and utilities
import DOMUtils from "../utils/dom-utils.js";
import logger from "../utils/logger.js";
import { t, onLanguageChange } from "../i18n/i18n-manager.js";

/**
 * The update notice in the footer, beside the version. It offers a newer
 * version, shows it downloading once clicked, then offers to restart into
 * it. It says nothing the rest of the time. Both the download and the
 * restart wait for the user's click, so neither comes at a bad moment; a
 * downloaded version that no click installed goes in the next time the app
 * quits.
 */
class UpdateNotice {
  static _initialized = false;
  /** @type {{state: string, version?: string, percent?: number, failed?: boolean}|null} */
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
      this._onClick()
    );
    api.onStatus((status) => this.render(status));
    onLanguageChange(() => this.render(this._status));
    // The updater may have moved on before this subscribed
    this.render(await api.getStatus());
  }

  /**
   * @param {{state: string, version?: string, percent?: number, failed?: boolean}|null} status
   */
  static render(status) {
    this._status = status;
    const notice = DOMUtils.getElementById("update-notice");
    if (!notice) return;

    const version = status?.version;
    const state = version ? status.state : null;
    let text = "";
    let title = "";
    if (state === "available") {
      text = t(status.failed ? "update.failed" : "update.available", {
        version,
      });
      title = t("update.availableTitle");
    } else if (state === "downloading") {
      text = t("update.downloading", {
        version,
        percent: status.percent ?? 0,
      });
    } else if (state === "ready") {
      text = t("update.ready", { version });
      title = t("update.readyTitle");
    }
    notice.textContent = text;
    notice.title = title;
    notice.disabled = state !== "available" && state !== "ready";
    notice.classList.toggle("ready", state === "ready");
    notice.classList.toggle("hidden", !text);
  }

  /**
   * Download the offered version, or restart into the downloaded one
   * @private
   */
  static async _onClick() {
    const status = this._status;
    const updates = window.electronAPI.updates;
    if (status?.state === "available") {
      logger.info("UpdateNotice", "Downloading the update", {
        version: status.version,
      });
      await updates.download();
    } else if (status?.state === "ready") {
      logger.info("UpdateNotice", "Restarting into the update", {
        version: status.version,
      });
      await updates.install();
    }
  }
}

export default UpdateNotice;
