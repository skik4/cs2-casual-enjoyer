/**
 * @jest-environment jsdom
 *
 * Jest tests for how a row shows a join: its status label and join button
 */

import { STATUS_TYPES } from "../src/shared/constants.js";
import { setLanguage } from "../src/i18n/i18n-manager.js";
import {
  joinButtonLook,
  readSlotFacts,
  slotAttributes,
  statusLabel,
} from "../src/ui/join-status.js";

beforeAll(() => setLanguage("en"));

describe("statusLabel", () => {
  test.each([
    ["no attempt", undefined, { free: true }, "free", "free slot"],
    ["no attempt", undefined, { free: false }, "full", "no free slot"],
    ["a cancelled attempt", STATUS_TYPES.CANCELLED, { free: true }, "free", "free slot"],
    ["connecting", STATUS_TYPES.CONNECTING, { free: false }, "busy", "connecting…"],
    ["waiting", STATUS_TYPES.WAITING, { free: true }, "busy", "waiting for a slot"],
    ["missing", STATUS_TYPES.MISSING, { free: true }, "missing", "not in casual"],
    ["joined", STATUS_TYPES.JOINED, { free: false }, "done", "on the server ✓"],
  ])("%s (%s) on %j", (_name, status, facts, kind, text) => {
    expect(statusLabel(status, facts)).toEqual({ kind, text });
  });

  test("an idle text replaces the slot text; out of casual the label hides", () => {
    expect(
      statusLabel(undefined, { free: true, idleText: "2 with a free slot" })
    ).toEqual({ kind: "free", text: "2 with a free slot" });
    expect(
      statusLabel(undefined, { free: false, casual: false, idleText: "" })
    ).toEqual({ kind: "none", text: "" });
    // A running join shows even for someone out of casual
    expect(
      statusLabel(STATUS_TYPES.MISSING, { free: false, casual: false, idleText: "" })
        .kind
    ).toBe("missing");
  });
});

describe("joinButtonLook", () => {
  test.each([STATUS_TYPES.WAITING, STATUS_TYPES.CONNECTING, STATUS_TYPES.MISSING])(
    "Cancel while the attempt is %s",
    (status) => {
      expect(joinButtonLook(status, { free: true })).toEqual({
        text: "Cancel",
        className: "action-btn cancel-btn",
        disabled: false,
      });
    }
  );

  test("Join for a free slot, Wait for a slot when full, Join out of casual", () => {
    expect(joinButtonLook(undefined, { free: true }).text).toBe("Join");
    expect(joinButtonLook(undefined, { free: false })).toEqual({
      text: "Wait for a slot",
      className: "action-btn wait-btn",
      disabled: false,
    });
    expect(joinButtonLook(undefined, { free: false, casual: false }).text).toBe(
      "Join"
    );
  });

  test("disabled for the moment it shows a join that landed", () => {
    expect(joinButtonLook(STATUS_TYPES.JOINED, { free: true }).disabled).toBe(true);
  });
});

describe("slot facts on elements", () => {
  const element = (facts) => {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = `<span ${slotAttributes(facts)}></span>`;
    return wrapper.firstElementChild;
  };

  test("survive the trip through attributes, quotes and markup included", () => {
    const facts = { free: true, casual: false, idleText: 'say "hi" <b>&' };
    expect(readSlotFacts(element(facts))).toEqual(facts);
  });

  test("leave the idle text out when there is none", () => {
    expect(readSlotFacts(element({ free: false, casual: true }))).toEqual({
      free: false,
      casual: true,
      idleText: undefined,
    });
  });
});
