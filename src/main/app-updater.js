/**
 * How often the installed app asks GitHub for a newer release after the
 * check it makes at start. The app tends to stay open all evening, so a
 * release made meanwhile should still reach the user before the next
 * start, and a few checks a day are nothing to GitHub's public API.
 */
export const UPDATE_CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

/**
 * Keeps the installed app up to date from the GitHub releases. It checks
 * when the app starts and every UPDATE_CHECK_INTERVAL_MS after, and offers
 * a newer version it finds. Nothing more happens without the user: a click
 * on the offer downloads the version in the background, so the user picks
 * the moment for a download that can run past 100 MB, and a second click
 * restarts the app into it. A downloaded version that no click installed
 * goes in the next time the app quits. It never restarts the app on its
 * own, so no join is cut short. The renderer only shows the status this
 * reports and passes the clicks on.
 *
 * Nothing runs unless the app is packaged: a development run has no
 * installer to update and no release to compare with.
 *
 * The updater comes in from main.js (electron-updater's autoUpdater), so
 * this file needs no Electron and can be tested under plain Node.
 */
export default class AppUpdater {
  /**
   * @param {Object} options
   * @param {Object} options.updater - electron-updater's autoUpdater
   * @param {boolean} options.isPackaged - app.isPackaged
   * @param {(status: Object) => void} options.send - Hands the status to the window
   * @param {{info: Function, warn: Function, error: Function}} options.logger
   */
  constructor({ updater, isPackaged, send, logger }) {
    this.updater = updater;
    this.isPackaged = isPackaged;
    this.send = send;
    this.logger = logger;
    /** @type {{state: string, version?: string, percent?: number, failed?: boolean}} */
    this.status = { state: isPackaged ? "idle" : "off" };
    this._timer = null;
  }

  /**
   * Check now and on a timer, and report what the updater does
   */
  start() {
    if (!this.isPackaged) {
      this.logger.info("Updates are off: this is not an installed build");
      return;
    }
    const updater = this.updater;
    // A found version waits for the user's click: see download()
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = true;
    updater.logger = {
      info: (message) => this.logger.info(`[updater] ${message}`),
      warn: (message) => this.logger.warn(`[updater] ${message}`),
      error: (message) => this.logger.error(`[updater] ${message}`),
      debug: () => {},
    };

    updater.on("checking-for-update", () =>
      this._report({ state: "checking" })
    );
    updater.on("update-not-available", () => this._report({ state: "idle" }));
    updater.on("update-available", (info) =>
      this._report({ state: "available", version: info?.version })
    );
    updater.on("download-progress", (progress) =>
      this._report({
        state: "downloading",
        version: this.status.version,
        percent: Math.floor(progress?.percent ?? 0),
      })
    );
    updater.on("update-downloaded", (info) =>
      this._report({ state: "ready", version: info?.version })
    );
    updater.on("error", (error) => {
      if (this.status.state === "downloading") {
        this._downloadFailed(error);
        return;
      }
      // A failed check changes nothing for the user: the app goes on as it
      // is, and the next check tries again
      this.logger.warn("Update check failed", { error: error?.message });
      if (this.status.state === "checking") this._report({ state: "idle" });
    });

    this.check();
    this._timer = setInterval(() => this.check(), UPDATE_CHECK_INTERVAL_MS);
  }

  /**
   * Ask GitHub for a newer release, unless one is already found: offered,
   * on its way or ready
   */
  check() {
    if (!this.isPackaged) return;
    if (
      ["checking", "available", "downloading", "ready"].includes(
        this.status.state
      )
    )
      return;
    Promise.resolve()
      .then(() => this.updater.checkForUpdates())
      .catch((error) => {
        this.logger.warn("Update check failed", { error: error?.message });
      });
  }

  /**
   * @returns {{state: string, version?: string, percent?: number, failed?: boolean}}
   *   What the updater is doing: off, idle, checking, available (failed
   *   after a download that broke off), downloading or ready
   */
  getStatus() {
    return { ...this.status };
  }

  /**
   * Download the offered version in the background, at the user's click
   * @returns {boolean} - Whether there was one to download
   */
  download() {
    if (this.status.state !== "available") return false;
    const version = this.status.version;
    this.logger.info("Downloading the update", { version });
    this._report({ state: "downloading", version, percent: 0 });
    Promise.resolve()
      .then(() => this.updater.downloadUpdate())
      .catch((error) => this._downloadFailed(error));
    return true;
  }

  /**
   * Restart into the downloaded version, at the user's click
   * @returns {boolean} - Whether there was one to install
   */
  install() {
    if (this.status.state !== "ready") return false;
    this.logger.info("Installing the downloaded update", {
      version: this.status.version,
    });
    // Silent: the installer asks its questions on the first install only;
    // and the app opens again once it is done
    this.updater.quitAndInstall(true, true);
    return true;
  }

  /**
   * Stop the timer (when the app quits, and in tests)
   */
  stop() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }

  /**
   * Offer the version again after its download broke off, so a click
   * retries it
   * @param {Error} error
   * @private
   */
  _downloadFailed(error) {
    // electron-updater reports a failed download twice, as an error event
    // and as the rejected download; the first one does it
    if (this.status.state !== "downloading") return;
    const version = this.status.version;
    this.logger.warn("Update download failed", {
      version,
      error: error?.message,
    });
    this._report({ state: "available", version, failed: true });
  }

  /**
   * @param {{state: string, version?: string, percent?: number, failed?: boolean}} status
   * @private
   */
  _report(status) {
    this.status = status;
    this.send(this.getStatus());
  }
}
