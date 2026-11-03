/**
 * Jest tests for the map names
 */

import { mapLabel } from "../src/shared/map-labels.js";

test("mapLabel names known maps and tidies unknown ones", () => {
  expect(mapLabel("de_dust2")).toBe("Dust II");
  expect(mapLabel("cs_office")).toBe("Office");
  expect(mapLabel("de_newmap")).toBe("Newmap");
});
