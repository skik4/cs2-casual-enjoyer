/**
 * Jest tests for escaping text that other Steam users control
 */

import DOMUtils from "../src/utils/dom-utils.js";
import { FRIENDS_TEMPLATES } from "../src/ui/html-templates.js";

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

describe("FRIEND_ITEM", () => {
  test("renders a hostile name, status and avatar as text", () => {
    const html = FRIENDS_TEMPLATES.FRIEND_ITEM(
      STEAM_ID,
      'x.jpg" onerror="alert(1)',
      '<a href="file:///C:/Windows/System32/calc.exe" target="_blank">Join</a>',
      "<img src=https://evil.example/pixel>",
      true,
      false,
      false
    );

    expect(html).not.toContain("<a href=");
    expect(html).not.toContain("<img src=https://evil");
    expect(html).not.toContain('onerror="alert');
    expect(html).toContain("&lt;a href=&quot;file:///C:/Windows/System32/calc.exe&quot;");
    expect(html).toContain('src="x.jpg&quot; onerror=&quot;alert(1)"');
  });

  test("adds the remove button only for manually added IDs", () => {
    const args = [STEAM_ID, "a.jpg", "name", "", false, false, false];

    expect(FRIENDS_TEMPLATES.FRIEND_ITEM(...args)).not.toContain("remove-fake-btn");
    expect(FRIENDS_TEMPLATES.FRIEND_ITEM(...args, true)).toContain(
      `id="remove-fake-btn-${STEAM_ID}"`
    );
  });
});
