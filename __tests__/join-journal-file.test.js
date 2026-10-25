/**
 * Jest tests for writing the join journal to disk (main process)
 */

import fs from "fs";
import os from "os";
import path from "path";

import { appendJoinJournal } from "../src/main/join-journal-file.js";
import { JOIN_JOURNAL_CONFIG } from "../src/shared/constants.js";

describe("join journal file", () => {
  let dir;
  let file;

  const lines = () => fs.readFileSync(file, "utf-8").split("\n").filter(Boolean);

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "casual-enjoyer-journal-"));
    file = path.join(dir, JOIN_JOURNAL_CONFIG.FILE_NAME);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("appends each batch as lines, in the order the batches came", async () => {
    const first = appendJoinJournal(file, ['{"event":"a"}', '{"event":"b"}']);
    const second = appendJoinJournal(file, ['{"event":"c"}']);

    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(lines()).toEqual(['{"event":"a"}', '{"event":"b"}', '{"event":"c"}']);
  });

  test("a line break inside a line cannot start a line of its own", async () => {
    await appendJoinJournal(file, ['{"a":1}\r\n{"forged":true}']);

    expect(lines()).toEqual(['{"a":1} {"forged":true}']);
  });

  test("a file grown past the limit is moved aside and a new one started", async () => {
    fs.writeFileSync(file, "x".repeat(JOIN_JOURNAL_CONFIG.MAX_BYTES));
    fs.writeFileSync(`${file}.old`, "older");

    await expect(appendJoinJournal(file, ['{"event":"new"}'])).resolves.toBe(true);

    expect(lines()).toEqual(['{"event":"new"}']);
    expect(fs.statSync(`${file}.old`).size).toBe(JOIN_JOURNAL_CONFIG.MAX_BYTES);
  });

  test.each([
    ["not a list", "line"],
    ["an empty list", []],
    ["a line that is not text", [{ event: "a" }]],
    ["a line that is too long", ["x".repeat(JOIN_JOURNAL_CONFIG.MAX_LINE_LENGTH + 1)]],
    [
      "too many lines",
      Array.from({ length: JOIN_JOURNAL_CONFIG.MAX_LINES_PER_APPEND + 1 }, () => "{}"),
    ],
  ])("refuses %s", async (_name, batch) => {
    await expect(appendJoinJournal(file, batch)).resolves.toBe(false);
    expect(fs.existsSync(file)).toBe(false);
  });

  test("a folder that cannot be written to fails the append, not the next one", async () => {
    const missing = path.join(dir, "missing", JOIN_JOURNAL_CONFIG.FILE_NAME);

    await expect(appendJoinJournal(missing, ["{}"])).resolves.toBe(false);
    await expect(appendJoinJournal(file, ["{}"])).resolves.toBe(true);
  });
});
