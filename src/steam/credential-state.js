// UI and utilities
import logger from "../utils/logger.js";

/**
 * Credentials Steam has turned down. A 401 or 403 on a call any valid token
 * or key may make means the token expired or was revoked, or the key is
 * wrong, and polling on with it only spends Steam's daily allowance on
 * failures. Background polling skips such a credential until it is
 * replaced - a new token is not on the list - or a call made with it is
 * answered again, as one the user asks for by reloading. Nothing here waits.
 */
class CredentialState {
  constructor() {
    this._rejected = new Set();
    this.listeners = new Set();
  }

  /**
   * Steam turned the credential down
   * @param {string} auth - API key or token
   */
  reject(auth) {
    if (!auth || this._rejected.has(auth)) return;
    this._rejected.add(auth);
    logger.warn(
      "CredentialState",
      "Steam turned the credential down; background polling waits for another"
    );
    this._notify();
  }

  /**
   * Steam answered a call made with the credential
   * @param {string} auth - API key or token
   */
  accept(auth) {
    if (!this._rejected.delete(auth)) return;
    logger.info("CredentialState", "Steam takes the credential again");
    this._notify();
  }

  /**
   * @param {string} auth - API key or token
   * @returns {boolean} - Whether Steam turned it down and nothing it answered since
   */
  isRejected(auth) {
    return Boolean(auth) && this._rejected.has(auth);
  }

  /**
   * Subscribe to a credential being turned down or taken again
   * @param {Function} listener - Called with no arguments
   * @returns {Function} - Unsubscribe
   */
  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Forget everything (used by tests)
   */
  reset() {
    this._rejected.clear();
    this.listeners.clear();
  }

  /**
   * @private
   */
  _notify() {
    for (const listener of [...this.listeners]) {
      try {
        listener();
      } catch (error) {
        logger.error("CredentialState", "Credential listener failed", {
          error: error.message,
        });
      }
    }
  }
}

const credentialState = new CredentialState();

export default credentialState;
