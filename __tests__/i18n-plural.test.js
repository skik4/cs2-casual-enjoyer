/**
 * Jest tests for texts about a number: one form per plural category
 */

import { setLanguage, tPlural } from "../src/i18n/i18n-manager.js";

afterAll(() => setLanguage("en"));

test.each([
  [1, "1 сервер"],
  [2, "2 сервера"],
  [4, "4 сервера"],
  [5, "5 серверов"],
  [11, "11 серверов"],
  [21, "21 сервер"],
  [22, "22 сервера"],
])("ru: %i servers is «%s»", (count, text) => {
  setLanguage("ru");
  expect(tPlural("mapFinder.servers", count)).toBe(text);
});

test("ru: after «среди» the noun takes the genitive", () => {
  setLanguage("ru");
  expect(tPlural("mapFinder.searchingAmong", 1)).toBe("ищем среди 1 игрока");
  expect(tPlural("mapFinder.searchingAmong", 3)).toBe("ищем среди 3 игроков");
  expect(tPlural("mapFinder.searchingAmong", 263)).toBe("ищем среди 263 игроков");
});

test("en: one and other", () => {
  setLanguage("en");
  expect(tPlural("mapFinder.servers", 1)).toBe("1 server");
  expect(tPlural("mapFinder.servers", 2)).toBe("2 servers");
});

test("a key without forms gives no text", () => {
  setLanguage("en");
  expect(tPlural("mapFinder.noScore", 2)).toBe("");
  expect(tPlural("mapFinder.missing", 2)).toBe("");
});
