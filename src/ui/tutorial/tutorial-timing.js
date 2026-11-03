/**
 * The tutorial's waits. None of them is an event; each keeps the reason the
 * code gave for it, or says that none was recorded.
 */
export const TUTORIAL_TIMING = {
  // A 0 ms wait: the browser paints before the step shows ("prevent
  // flicker", "smooth transition without blocking the render cycle")
  DEFER_MS: 0,
  // Before the mock connection starts on its step: "ensure previous
  // process is fully stopped"
  MOCK_CONNECTION_START_MS: 50,
  // Before auto-refresh resumes after the tutorial: "ensure tutorial
  // cleanup is complete"
  AUTO_REFRESH_RESTORE_MS: 500,
  // How long the copied-link feedback on the last step stays; no reason
  // recorded for the length
  COPY_FEEDBACK_MS: 2000,
  // An element, or the tutorial button at startup, not seen by then is
  // given up on and its observer disconnected; no reason recorded for the
  // length
  ELEMENT_WAIT_MS: 10000,
};
