/**
 * @jest-environment jsdom
 *
 * Jest tests for the overlay that offers to launch CS2 before a join: what
 * its promise answers, and when the overlay stays up. The same overlay
 * offers the launch alone, with no join waiting, from the GSI status; that
 * offer asks Steam first and, with CS2 running already, only says so.
 */

jest.mock("../src/utils/logger.js", () => ({
  __esModule: true,
  default: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import Cs2LaunchDialog from "../src/ui/cs2-launch-dialog.js";
import { setLanguage, t } from "../src/i18n/i18n-manager.js";

const overlay = () => document.getElementById("cs2-launch-notification");
const visible = () =>
  overlay().style.display === "flex" && !overlay().classList.contains("hidden");
const title = () => overlay().querySelector(".cs2-launch-title").textContent;
const message = () =>
  overlay().querySelector(".cs2-launch-message").textContent;
const hint = () => overlay().querySelector(".cs2-launch-hint").textContent;
const launchButton = () => document.getElementById("launch-cs2-btn");
const closeButton = () => document.getElementById("close-cs2-launch");

/** Let the promise chains behind a click run */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Track whether a promise has settled, without awaiting it
 * @param {Promise} promise - Promise to observe
 * @returns {{settled: boolean, value: any}} - Live settle state
 */
function observe(promise) {
  const state = { settled: false, value: undefined };
  promise.then((value) => {
    state.settled = true;
    state.value = value;
  });
  return state;
}

let cs2Manager;
let finishLaunch;
let onProgress;

beforeEach(() => {
  setLanguage("en");
  document.body.innerHTML =
    '<div id="cs2-launch-notification" class="cs2-launch-overlay hidden"></div>';
  // Stands in for CS2Manager: the test ends each launch itself. Steam shows
  // no CS2 and CS2 has reported nothing, unless a test says otherwise.
  cs2Manager = {
    launchAndWaitForLobby: jest.fn((progress) => {
      onProgress = progress;
      return new Promise((resolve) => (finishLaunch = resolve));
    }),
    cancelLaunchOperations: jest.fn(),
    checkUserInCS2: jest.fn().mockResolvedValue(false),
    getGsiUserState: jest.fn(() => null),
  };
});

const ask = () => observe(Cs2LaunchDialog.ask(cs2Manager));

test("shows the overlay with its first texts and waits", () => {
  const answer = ask();

  expect(visible()).toBe(true);
  expect(title()).toBe("Launch CS2 First");
  expect(launchButton().textContent).toBe("Launch CS2");
  expect(answer.settled).toBe(false);
  expect(cs2Manager.launchAndWaitForLobby).not.toHaveBeenCalled();
});

test("Launch starts CS2 once and answers true when the lobby is reached", async () => {
  const answer = ask();

  launchButton().click();
  launchButton().click();
  expect(cs2Manager.launchAndWaitForLobby).toHaveBeenCalledTimes(1);
  expect(title()).toBe("Launching CS2...");
  expect(launchButton().disabled).toBe(true);
  expect(answer.settled).toBe(false);

  finishLaunch(true);
  await settle();

  expect(answer.value).toBe(true);
  expect(visible()).toBe(false);
});

test("Close answers false and cancels a launch under way", async () => {
  const answer = ask();
  launchButton().click();

  closeButton().click();
  await settle();

  expect(answer.value).toBe(false);
  expect(cs2Manager.cancelLaunchOperations).toHaveBeenCalledTimes(1);
  expect(visible()).toBe(false);

  // The launch the cancel ended cannot answer after it
  finishLaunch(true);
  await settle();
  expect(answer.value).toBe(false);
});

test("a launch that times out keeps the overlay up for another try", async () => {
  const answer = ask();
  launchButton().click();

  onProgress("timeout");
  finishLaunch(false);
  await settle();

  expect(answer.settled).toBe(false);
  expect(visible()).toBe(true);
  expect(title()).toBe("CS2 Did Not Start");
  expect(launchButton().textContent).toBe("Try Again");
  expect(launchButton().disabled).toBe(false);

  launchButton().click();
  expect(cs2Manager.launchAndWaitForLobby).toHaveBeenCalledTimes(2);

  finishLaunch(true);
  await settle();
  expect(answer.value).toBe(true);
  expect(visible()).toBe(false);
});

test("a launch that throws answers false", async () => {
  cs2Manager.launchAndWaitForLobby.mockRejectedValue(new Error("Steam is not running"));
  const answer = ask();

  launchButton().click();
  await settle();

  expect(answer.value).toBe(false);
  expect(visible()).toBe(false);
});

test("answers false when the page has no overlay", async () => {
  document.body.innerHTML = "";

  await expect(Cs2LaunchDialog.ask(cs2Manager)).resolves.toBe(false);
});

test("a language switch re-renders the phase it shows", async () => {
  ask();
  launchButton().click();

  setLanguage("ru");
  await settle();

  expect(title()).toBe(t("notifications.cs2Launch.launching.title"));
  expect(title()).not.toBe("Launching CS2...");
});

describe("with no join waiting", () => {
  /** Ask with no join waiting, and let Steam's answer about CS2 come in */
  const offer = async () => {
    const answer = observe(Cs2LaunchDialog.ask(cs2Manager, { mode: "launch" }));
    await settle();
    return answer;
  };
  const askLaunchOnly = () =>
    observe(Cs2LaunchDialog.ask(cs2Manager, { mode: "launch" }));

  /**
   * Keep Steam's answer about CS2 back until the test gives it
   * @returns {(inCS2: boolean|null) => void} - Gives the answer
   */
  const holdSteam = () => {
    let answer;
    cs2Manager.checkUserInCS2.mockReturnValue(
      new Promise((resolve) => (answer = resolve))
    );
    return (inCS2) => answer(inCS2);
  };

  // An offer left up would step aside for the next test's first question
  afterEach(() => closeButton()?.click());

  test("offers the launch alone, in texts that speak of no join", async () => {
    const answer = await offer();

    expect(visible()).toBe(true);
    expect(title()).toBe("Launch CS2?");
    expect(message()).toBe(t("notifications.cs2Launch.launchOnly.message"));
    expect(message()).not.toBe(t("notifications.cs2Launch.initial.message"));
    expect(hint()).toBe(t("notifications.cs2Launch.launchOnly.hint"));
    expect(launchButton().textContent).toBe("Launch CS2");
    expect(launchButton().classList.contains("hidden")).toBe(false);
    expect(closeButton().textContent).toBe("Close");
    // The keyboard follows the offer
    expect(document.activeElement).toBe(launchButton());
    expect(answer.settled).toBe(false);
    // Steam was asked about CS2 first, once
    expect(cs2Manager.checkUserInCS2).toHaveBeenCalledTimes(1);
    expect(cs2Manager.launchAndWaitForLobby).not.toHaveBeenCalled();
  });

  test("says CS2 runs already, with Close alone, when Steam shows it", async () => {
    cs2Manager.checkUserInCS2.mockResolvedValue(true);
    const answer = await offer();

    expect(visible()).toBe(true);
    expect(title()).toBe("CS2 Is Already Running");
    expect(message()).toBe(t("notifications.cs2Launch.running.message"));
    // In the words the GSI status uses once CS2 reports
    expect(hint()).toContain("“CS2 connected”");
    expect(launchButton().classList.contains("hidden")).toBe(true);
    expect(closeButton().textContent).toBe("Close");
    expect(document.activeElement).toBe(closeButton());

    // The hidden Launch starts nothing, even clicked from code
    launchButton().click();
    expect(cs2Manager.launchAndWaitForLobby).not.toHaveBeenCalled();

    closeButton().click();
    await settle();
    expect(answer.value).toBe(false);
    expect(visible()).toBe(false);
    expect(cs2Manager.cancelLaunchOperations).not.toHaveBeenCalled();
  });

  test("a language switch keeps saying CS2 runs", async () => {
    cs2Manager.checkUserInCS2.mockResolvedValue(true);
    await offer();

    setLanguage("ru");
    await settle();

    expect(title()).toBe(t("notifications.cs2Launch.running.title"));
    expect(title()).not.toBe("CS2 Is Already Running");
    expect(hint()).toContain(`«${t("gsi.label.active")}»`);
    expect(launchButton().classList.contains("hidden")).toBe(true);
  });

  test.each([
    ["shows no CS2", () => Promise.resolve(false)],
    ["cannot be asked", () => Promise.resolve(null)],
    ["fails to answer", () => Promise.reject(new Error("Steam is down"))],
  ])("offers the launch as before when Steam %s", async (_, steam) => {
    cs2Manager.checkUserInCS2.mockImplementation(steam);
    await offer();

    expect(title()).toBe("Launch CS2?");
    expect(launchButton().classList.contains("hidden")).toBe(false);
    expect(document.activeElement).toBe(launchButton());
  });

  test("the control pressed reads as busy while Steam answers, and a second press asks nothing", async () => {
    const answerSteam = holdSteam();
    document.body.insertAdjacentHTML("beforeend", '<button id="opener">GSI</button>');
    const opener = document.getElementById("opener");
    opener.focus();

    const answer = askLaunchOnly();
    const second = askLaunchOnly();
    await settle();

    expect(opener.getAttribute("aria-busy")).toBe("true");
    expect(visible()).toBe(false);
    expect(second.value).toBe(false);
    expect(cs2Manager.checkUserInCS2).toHaveBeenCalledTimes(1);

    answerSteam(false);
    await settle();
    expect(opener.hasAttribute("aria-busy")).toBe(false);
    expect(visible()).toBe(true);

    // Closed, the keyboard goes back where it was
    closeButton().click();
    await settle();
    expect(answer.value).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  test("a join that asks while Steam answers keeps the overlay", async () => {
    const answerSteam = holdSteam();
    const launchOnly = askLaunchOnly();

    const join = ask();
    answerSteam(true);
    await settle();

    expect(launchOnly.value).toBe(false);
    expect(title()).toBe("Launch CS2 First");
    expect(launchButton().classList.contains("hidden")).toBe(false);
    expect(join.settled).toBe(false);
  });

  test("CS2 reporting while Steam answers leaves the overlay down", async () => {
    const answerSteam = holdSteam();
    const launchOnly = askLaunchOnly();

    cs2Manager.getGsiUserState.mockReturnValue({ inMenu: true });
    answerSteam(true);
    await settle();

    expect(launchOnly.value).toBe(false);
    expect(visible()).toBe(false);
  });

  test("Launch takes the join's launch and answers true in the lobby", async () => {
    const answer = await offer();

    launchButton().click();
    expect(cs2Manager.launchAndWaitForLobby).toHaveBeenCalledTimes(1);
    expect(title()).toBe("Launching CS2...");
    expect(launchButton().disabled).toBe(true);

    finishLaunch(true);
    await settle();

    expect(answer.value).toBe(true);
    expect(visible()).toBe(false);
  });

  test("Close before Launch changes nothing", async () => {
    const answer = await offer();

    closeButton().click();
    await settle();

    expect(answer.value).toBe(false);
    expect(visible()).toBe(false);
    expect(cs2Manager.launchAndWaitForLobby).not.toHaveBeenCalled();
    expect(cs2Manager.cancelLaunchOperations).not.toHaveBeenCalled();
  });

  test("Close during the launch calls it off, as in a join", async () => {
    const answer = await offer();
    launchButton().click();

    closeButton().click();
    await settle();

    expect(answer.value).toBe(false);
    expect(cs2Manager.cancelLaunchOperations).toHaveBeenCalledTimes(1);
    expect(visible()).toBe(false);
  });

  test("never opens over the join's own offer", async () => {
    const join = ask();
    const joinLaunch = launchButton();

    const launchOnly = await offer();

    expect(launchOnly.value).toBe(false);
    // Turned down before asking Steam anything
    expect(cs2Manager.checkUserInCS2).not.toHaveBeenCalled();
    expect(launchButton()).toBe(joinLaunch);
    expect(title()).toBe("Launch CS2 First");

    // The join's offer is still up, and still answers
    launchButton().click();
    finishLaunch(true);
    await settle();
    expect(join.value).toBe(true);
  });

  test("does not cover an offer of its own either", async () => {
    const first = await offer();
    const second = await offer();

    expect(second.value).toBe(false);
    expect(first.settled).toBe(false);
    expect(visible()).toBe(true);
    expect(cs2Manager.checkUserInCS2).toHaveBeenCalledTimes(1);
  });

  test("a join's question takes the overlay over, a launch under way included", async () => {
    const launchOnly = await offer();
    launchButton().click();
    const finishOfferLaunch = finishLaunch;

    const join = ask();
    await settle();

    expect(launchOnly.value).toBe(false);
    expect(cs2Manager.cancelLaunchOperations).toHaveBeenCalledTimes(1);
    expect(visible()).toBe(true);
    expect(title()).toBe("Launch CS2 First");

    // The called-off launch ending late leaves the join's overlay alone
    finishOfferLaunch(true);
    await settle();
    expect(visible()).toBe(true);
    expect(join.settled).toBe(false);

    launchButton().click();
    finishLaunch(true);
    await settle();
    expect(join.value).toBe(true);
    expect(visible()).toBe(false);
  });

  test("a language switch keeps the texts without a join", async () => {
    await offer();

    setLanguage("ru");
    await settle();

    expect(title()).toBe(t("notifications.cs2Launch.launchOnly.title"));
    expect(title()).not.toBe("Launch CS2?");
  });
});
