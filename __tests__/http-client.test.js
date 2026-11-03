/**
 * Jest tests for the HTTP client: a request that hangs ends as a failed one,
 * a deliberate cancellation stays recognisable
 */

import SteamAPIHttpClient from "../src/steam/http-client.js";
import { API_CONFIG } from "../src/shared/constants.js";

const TIMEOUT = API_CONFIG.REQUEST_TIMEOUT_MS;

/** A fetch that never answers, only gives up when its signal says so */
const hangingFetch = () =>
  jest.fn(
    (_url, { signal }) =>
      new Promise((_resolve, reject) =>
        signal.addEventListener("abort", () => reject(signal.reason))
      )
  );

beforeEach(() => {
  API_CONFIG.REQUEST_TIMEOUT_MS = 20;
  global.fetch = hangingFetch();
});

afterEach(() => {
  API_CONFIG.REQUEST_TIMEOUT_MS = TIMEOUT;
});

test("a request that hangs fails after the timeout", async () => {
  await expect(SteamAPIHttpClient.makeRequest("https://example.test/")).rejects.toThrow(
    "HTTP request failed"
  );
});

test("the caller's own cancellation still surfaces as an abort", async () => {
  API_CONFIG.REQUEST_TIMEOUT_MS = 60000;
  const controller = new AbortController();

  const request = SteamAPIHttpClient.makeRequest("https://example.test/", {
    signal: controller.signal,
  });
  controller.abort();

  await expect(request).rejects.toMatchObject({ name: "AbortError" });
});

test("an answer in time comes through untouched", async () => {
  const response = { ok: true };
  global.fetch = jest.fn(async () => response);

  await expect(SteamAPIHttpClient.makeRequest("https://example.test/")).resolves.toBe(
    response
  );
  expect(global.fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
});
