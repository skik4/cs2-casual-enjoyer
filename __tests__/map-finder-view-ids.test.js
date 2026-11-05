/**
 * @jest-environment jsdom
 *
 * Jest tests for the join ids in the Maps view's markup. A map code or a
 * server id comes from other players' rich presence, so the id goes into
 * the row escaped, while StatusManager still finds the label and the
 * button by the raw id.
 */

jest.mock("../src/utils/logger.js", () => ({
  __esModule: true,
  default: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import MapFinderView from "../src/ui/map-finder-view.js";
import StatusManager from "../src/ui/status-manager.js";
import mapFinder from "../src/game/map-finder.js";
import joinManager, {
  getMapJoinId,
  getServerJoinId,
} from "../src/game/join-manager.js";
import { STATUS_TYPES } from "../src/shared/constants.js";
import { setLanguage } from "../src/i18n/i18n-manager.js";

// What a rich presence could try to put into an id, if it ever got that far
const HOSTILE = 'x" onmouseover="alert(1)" data-y="<&';
const MAP = `de_${HOSTILE}`;
const SERVER_ID = `90071992547409${HOSTILE}`;
const JOIN_IDS = [getMapJoinId(MAP), getServerJoinId(SERVER_ID)];

/** The id as it must appear inside an attribute */
const escaped = (id) =>
  id.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

beforeAll(() => {
  setLanguage("en");
  document.body.innerHTML = `
    <span id="tab-count-maps"></span>
    <span id="map-finder-status"></span>
    <div id="maps-list"></div>
    <div id="maps-empty" class="hidden"></div>
    <span id="fof-summary"></span>
    <div id="fof-key-details" class="hidden"></div>
    <button id="fof-key-toggle"></button>
    <div id="map-sources"></div>`;
  MapFinderView.initialize({ getMainAuth: () => "" });
});

beforeEach(() => {
  jest.spyOn(mapFinder, "setNeed").mockImplementation(() => {});
  jest.spyOn(joinManager, "getJoinStates").mockImplementation(() => ({}));
  mapFinder.servers = [
    {
      serverId: SERVER_ID,
      map: MAP,
      score: "[ 3 : 1 ]",
      rounds: 4,
      over: false,
      freeSlot: true,
      players: [
        { steamid: "76561198000000011", personaname: "a", connect: "+gcconnect0A0B0C0D" },
      ],
    },
  ];
  MapFinderView.expanded = new Set([MAP]);
  MapFinderView._lastListHtml = null;
});

afterEach(() => {
  jest.restoreAllMocks();
});

test("the label and the button carry the id escaped", () => {
  const slot = { free: true, casual: true };

  for (const joinId of JOIN_IDS) {
    const label = MapFinderView.renderLabel(joinId, {}, slot);
    const button = MapFinderView.renderJoinButton(joinId, {}, slot);

    expect(label).not.toContain('onmouseover="alert');
    expect(button).not.toContain('onmouseover="alert');
    expect(label).toContain(`id="status-${escaped(joinId)}"`);
    expect(button).toContain(`id="join-btn-${escaped(joinId)}"`);
  }
  expect(MapFinderView.renderJoinButton(JOIN_IDS[1], {}, slot)).toContain(
    'id="join-btn-srv-90071992547409x&quot; onmouseover=&quot;alert(1)&quot; data-y=&quot;&lt;&amp;"'
  );

  MapFinderView.render();
  expect(MapFinderView._lastListHtml).not.toContain('onmouseover="alert');
  expect(document.querySelector("[onmouseover]")).toBeNull();
});

test("StatusManager still finds the label and the button by the raw id", () => {
  MapFinderView.render();

  for (const joinId of JOIN_IDS) {
    const label = document.getElementById(`status-${joinId}`);
    const button = document.getElementById(`join-btn-${joinId}`);
    expect(label).not.toBeNull();
    expect(button).not.toBeNull();
    expect(label.textContent).toBe("free slot");
    expect(button.textContent).toBe("Join");

    StatusManager.updateLabel(joinId, STATUS_TYPES.CONNECTING);
    StatusManager.updateJoinButton(joinId, STATUS_TYPES.CONNECTING);

    expect(label.textContent).toBe("connecting…");
    expect(label.className).toBe("status-label status-busy");
    expect(button.textContent).toBe("Cancel");
    expect(button.classList.contains("cancel-btn")).toBe(true);
  }
});
