/**
 * Jest tests for escaping text that other Steam users control
 */

import DOMUtils from "../src/utils/dom-utils.js";
import { FRIENDS_TEMPLATES } from "../src/ui/html-templates.js";
import FriendsRenderer from "../src/ui/friends-renderer.js";

const STEAM_ID = "76561198000000001";

describe("DOMUtils.escapeHtml", () => {
  test("escapes markup and quotes", () => {
    expect(DOMUtils.escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe(
      "&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;"
    );
  });

  test("turns missing values into empty text", () => {
    expect(DOMUtils.escapeHtml(null)).toBe("");
    expect(DOMUtils.escapeHtml(undefined)).toBe("");
    expect(DOMUtils.escapeHtml(42)).toBe("42");
  });
});

/** A row as FriendsRenderer.rowModel builds it */
const row = (overrides = {}) => ({
  steamid: STEAM_ID,
  avatarUrl: "a.jpg",
  personaname: "name",
  whereHtml: "",
  slot: { free: true, casual: true },
  label: { kind: "free", text: "free slot" },
  button: { text: "Join", className: "action-btn", disabled: false },
  ...overrides,
});

describe("FRIEND_ITEM", () => {
  test("renders a hostile name, label and avatar as text", () => {
    const html = FRIENDS_TEMPLATES.FRIEND_ITEM(
      row({
        avatarUrl: 'x.jpg" onerror="alert(1)',
        personaname:
          '<a href="file:///C:/Windows/System32/calc.exe" target="_blank">Join</a>',
        label: { kind: "none", text: "<img src=https://evil.example/pixel>" },
        slot: {
          free: false,
          casual: false,
          idleText: '"><img src=x onerror=alert(1)>',
        },
      })
    );

    expect(html).not.toContain("<a href=");
    expect(html).not.toContain("<img src=https://evil");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain('onerror="alert');
    expect(html).toContain("&lt;a href=&quot;file:///C:/Windows/System32/calc.exe&quot;");
    expect(html).toContain('src="x.jpg&quot; onerror=&quot;alert(1)"');
  });

  test("adds the remove button only for manually added IDs", () => {
    expect(FRIENDS_TEMPLATES.FRIEND_ITEM(row())).not.toContain("remove-fake-btn");
    expect(FRIENDS_TEMPLATES.FRIEND_ITEM(row({ removable: true }))).toContain(
      `id="remove-fake-btn-${STEAM_ID}"`
    );
  });
});

describe("FriendsRenderer.rowModel", () => {
  test("escapes where a friend plays, whatever Steam says", () => {
    const outside = FriendsRenderer.rowModel({
      steamid: STEAM_ID,
      personaname: "x",
      status: "<script>alert(1)</script>",
      in_casual_mode: false,
    });
    const casual = FriendsRenderer.rowModel({
      steamid: STEAM_ID,
      personaname: "x",
      in_casual_mode: true,
      join_available: true,
      game_map: "de_<b>dust</b>",
      game_score: "[ <i>3</i> : 1 ]",
    });

    expect(outside.whereHtml).not.toContain("<script>");
    expect(outside.whereHtml).toContain("&lt;script&gt;");
    expect(casual.whereHtml).not.toContain("<b>");
    expect(casual.whereHtml).not.toContain("<i>");
  });
});
