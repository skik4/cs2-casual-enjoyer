/**
 * Steam's own log of the games it runs, as the main process reads it
 * (main/steam-game-log.js): when CS2 changed game server. Without the
 * Electron bridge, as in tests, there is no log to read.
 */
const steamLog = {
  /**
   * When Steam logged CS2 changing game server, from a moment on
   * @param {number} since - Epoch ms
   * @returns {Promise<{usable: boolean, changes: number[]}>} - Epoch ms of
   *   each change's second; unusable when there is no log to read
   */
  async serverChangesSince(since) {
    const api = window.electronAPI?.steamLog;
    if (!api?.serverChangesSince) return { usable: false, changes: [] };
    const answer = await api.serverChangesSince(since);
    return answer?.usable && Array.isArray(answer.changes)
      ? answer
      : { usable: false, changes: [] };
  },
};

export default steamLog;
