// UI and utilities
import DOMUtils from "../utils/dom-utils.js";
import logger from "../utils/logger.js";
import { t, onLanguageChange } from "../i18n/i18n-manager.js";

const MEGABYTE = 1024 * 1024;

/**
 * The update, all in the footer beside the version. A newer version is
 * offered with an Install link; Install asks first, in the same place,
 * whether to install and restart, and nothing downloads before Yes. Then a
 * bar in Steam's blue shows the download with the megabytes in, and once
 * the version is in, the app restarts into it. A download that breaks off
 * offers Retry. The notice says nothing while there is no newer version.
 */
class UpdateNotice {
  static _initialized = false;
  /** @type {{state: string, version?: string, percent?: number, transferred?: number, total?: number, failed?: boolean}|null} */
  static _status = null;
  /** Install clicked: the question is up */
  static _confirming = false;
  /** Yes clicked: the version downloads and then installs */
  static _running = false;
  /** Yes clicked, and the updater has not said the download began */
  static _starting = false;
  /** The restart into the downloaded version has been asked for */
  static _installing = false;

  /**
   * Show the updater's status now and on every change
   */
  static async initialize() {
    if (this._initialized) return;
    this._initialized = true;
    const api = window.electronAPI?.updates;
    if (!api) return;

    DOMUtils.getElementById("update-notice-action")?.addEventListener(
      "click",
      (event) => this._onAction(event)
    );
    DOMUtils.getElementById("update-notice-cancel")?.addEventListener(
      "click",
      () => this._onCancel()
    );
    DOMUtils.getElementById("update-notice")?.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape" && this._confirming) this._onCancel();
      }
    );
    api.onStatus((status) => this._onStatus(status));
    onLanguageChange(() => this.render());
    const status = await api.getStatus();
    // The updater may have moved on before this subscribed
    if (this._status === null) this._onStatus(status);
  }

  /**
   * Show what the update does, in the current language
   */
  static render() {
    const notice = DOMUtils.getElementById("update-notice");
    if (!notice) return;
    const phase = this._phase();
    notice.classList.toggle("hidden", !phase);
    notice.dataset.phase = phase ?? "";
    if (!phase) return;

    const status = this._status ?? {};
    const version = status.version;
    const texts = {
      available: t("update.available", { version }),
      confirm: t("update.confirm", { version }),
      downloading: t("update.downloading", { version }),
      installing: t("update.installing", { version }),
      failed: t("update.failed", { version }),
      ready: t("update.ready", { version }),
    };
    this._set("update-notice-text", texts[phase]);

    // The bar: the download so far, full for the restart
    const bar = DOMUtils.getElementById("update-notice-bar");
    if (bar) {
      bar.classList.toggle(
        "hidden",
        phase !== "downloading" && phase !== "installing"
      );
      const fill = bar.querySelector(".update-notice-fill");
      if (fill) {
        const percent =
          phase === "installing"
            ? 100
            : status.state === "downloading"
              ? Math.max(0, Math.min(100, status.percent ?? 0))
              : 0;
        fill.style.width = `${percent}%`;
      }
    }
    this._set("update-notice-size", this._sizeText(phase));

    const links = {
      available: ["install", null],
      ready: ["install", null],
      confirm: ["yes", "no"],
      failed: ["retry", null],
    }[phase] ?? [null, null];
    this._set("update-notice-action", links[0] && t(`update.${links[0]}`));
    this._set("update-notice-cancel", links[1] && t(`update.${links[1]}`));
    const action = DOMUtils.getElementById("update-notice-action");
    if (action) {
      action.title = links[0] === "install" ? t("update.installTitle") : "";
    }
  }

  /**
   * What the update is at
   * @returns {"available"|"confirm"|"downloading"|"installing"|"failed"|"ready"|null}
   * @private
   */
  static _phase() {
    if (this._installing) return "installing";
    const status = this._status;
    if (!status?.version) return null;
    if (status.state === "available") {
      if (this._starting) return "downloading";
      if (status.failed) return "failed";
      return this._confirming ? "confirm" : "available";
    }
    if (status.state === "downloading") return "downloading";
    if (status.state === "ready") {
      return this._confirming ? "confirm" : "ready";
    }
    return null;
  }

  /**
   * The download's size beside the bar: megabytes once the updater knows
   * them, the percentage before that
   * @param {string} phase - See _phase
   * @returns {string}
   * @private
   */
  static _sizeText(phase) {
    const status = this._status ?? {};
    if (phase !== "downloading" || status.state !== "downloading") return "";
    if (status.total > 0) {
      return t("update.size", {
        transferred: Math.round((status.transferred ?? 0) / MEGABYTE),
        total: Math.round(status.total / MEGABYTE),
      });
    }
    return t("update.percent", { percent: status.percent ?? 0 });
  }

  /**
   * A status from the updater: shown, and a version the user chose to
   * install is restarted into once it is in
   * @param {Object|null} status
   * @private
   */
  static _onStatus(status) {
    this._status = status;
    if (status?.state !== "available") this._starting = false;
    if (status?.state === "available" && status.failed) this._running = false;
    // Nothing to ask about any more once the offer is gone
    if (status?.state !== "available" && status?.state !== "ready") {
      this._confirming = false;
    }
    if (this._running && status?.state === "ready") {
      this._install();
      return;
    }
    this.render();
  }

  /**
   * The link: Install asks, Yes downloads and installs, Retry downloads
   * again
   * @param {MouseEvent} [event]
   * @private
   */
  static _onAction(event) {
    const phase = this._phase();
    if (phase === "available" || phase === "ready") {
      this._confirming = true;
      this.render();
      DOMUtils.getElementById("update-notice-cancel")?.focus();
      return;
    }
    if (phase === "confirm") {
      // The second click of a double click on Install is no answer
      if (event?.detail > 1) return;
      this._confirming = false;
      if (this._status.state === "ready") this._install();
      else this._download();
      return;
    }
    // A download the user said yes to, broken off: no need to ask again
    if (phase === "failed") this._download();
  }

  /**
   * No: back to the offer
   * @private
   */
  static _onCancel() {
    if (!this._confirming) return;
    this._confirming = false;
    this.render();
    DOMUtils.getElementById("update-notice-action")?.focus();
  }

  /**
   * Download the offered version, to install it once it is in
   * @private
   */
  static async _download() {
    logger.info("UpdateNotice", "Downloading the update", {
      version: this._status?.version,
    });
    this._running = true;
    this._starting = true;
    this.render();
    if (!(await window.electronAPI.updates.download())) {
      this._running = false;
      this._starting = false;
      this.render();
    }
  }

  /**
   * Restart into the downloaded version
   * @private
   */
  static async _install() {
    if (this._installing) return;
    logger.info("UpdateNotice", "Restarting into the update", {
      version: this._status?.version,
    });
    this._installing = true;
    this.render();
    if (!(await window.electronAPI.updates.install())) {
      this._installing = false;
      this._running = false;
      this.render();
    }
  }

  /**
   * Put words in an element, hiding it without them
   * @param {string} id - Element id
   * @param {string|null} text - Its words, or nothing
   * @private
   */
  static _set(id, text) {
    const element = DOMUtils.getElementById(id);
    if (!element) return;
    element.textContent = text || "";
    if (id !== "update-notice-text") {
      element.classList.toggle("hidden", !text);
    }
  }
}

export default UpdateNotice;
