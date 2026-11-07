/**
 * Steam's own log of the games it runs, as the main process reads it
 * (main/steam-game-log.js): when CS2 changed game server, and CS2's game
 * process starting and ending. Without the Electron bridge, as in tests,
 * there is no log to read.
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

  /**
   * CS2's game process as Steam tracks it, read now
   * @returns {Promise<import('../shared/types.js').Cs2ProcessState>} -
   *   Unusable when there is no log to read. Never rejects.
   */
  async cs2State() {
    const api = window.electronAPI?.steamLog;
    if (!api?.cs2State) return toCs2State(null);
    try {
      return toCs2State(await api.cs2State());
    } catch {
      return toCs2State(null);
    }
  },

  /**
   * Subscribe to CS2 opening and closing as Steam logs them
   * @param {(state: import('../shared/types.js').Cs2ProcessState) => void} listener
   * @returns {Function} - Unsubscribe
   */
  onCs2State(listener) {
    const api = window.electronAPI?.steamLog;
    if (!api?.onCs2State) return () => {};
    return api.onCs2State((state) => listener(toCs2State(state)));
  },
};

/**
 * What the main process said about CS2's process, in a known shape
 * @param {*} answer - Its answer
 * @returns {import('../shared/types.js').Cs2ProcessState}
 */
function toCs2State(answer) {
  if (!answer?.usable) {
    return {
      usable: false,
      seen: false,
      running: false,
      fromAppStart: false,
      startedAt: 0,
      exitedAt: 0,
    };
  }
  return {
    usable: true,
    seen: Boolean(answer.seen),
    running: Boolean(answer.running),
    fromAppStart: Boolean(answer.fromAppStart),
    startedAt: Number(answer.startedAt) || 0,
    exitedAt: Number(answer.exitedAt) || 0,
  };
}

export default steamLog;
