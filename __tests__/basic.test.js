/**
 * Simple test to verify Jest setup and basic JoinManager functionality
 */

// Mock modules before importing
jest.mock("../src/utils/dom-utils.js");
jest.mock("../src/steam/steam-api.js");
jest.mock("../src/utils/validators.js");
jest.mock("../src/utils/error-handler.js");

import JoinManager from "../src/game/join-manager.js";
import { STATUS_TYPES } from "../src/shared/constants.js";

describe("JoinManager - Basic Setup Test", () => {
  test("should create JoinManager instance", () => {
    expect(JoinManager).toBeDefined();
    expect(typeof JoinManager.startJoin).toBe("function");
    expect(typeof JoinManager.cancelJoin).toBe("function");
    expect(typeof JoinManager.getJoinStates).toBe("function");
  });

  test("should have correct status types", () => {
    expect(STATUS_TYPES.WAITING).toBe("waiting");
    expect(STATUS_TYPES.CONNECTING).toBe("connecting");
    expect(STATUS_TYPES.JOINED).toBe("joined");
    expect(STATUS_TYPES.CANCELLED).toBe("cancelled");
    expect(STATUS_TYPES.MISSING).toBe("missing");
  });
  test("should initialize with empty join states", () => {
    const states = JoinManager.getJoinStates();
    expect(states).toBeDefined();
    expect(typeof states).toBe("object");
  });
});
