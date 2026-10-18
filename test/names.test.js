import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import * as server from "../src/names.js";

// The website's copy, when the whole repository is checked out (it isn't on Render).
const webCopy = new URL("../../BitPerfectDetector-Web/public/phones.js", import.meta.url);

test("the server's name helpers give the same results as the website's", { skip: !existsSync(webCopy) }, async () => {
  const web = await import(webCopy);
  assert.deepEqual(server.BIT_PERFECT_RANK, web.BIT_PERFECT_RANK);
  const phones = [
    ["motorola", "motorola edge 50 neo"], ["samsung", "SM-S921B"], ["Nothing", "Nothing"], ["Xiaomi", "17"],
  ];
  for (const [m, model] of phones) {
    assert.deepEqual(server.cleanPhoneName(m, model), web.cleanPhoneName(m, model));
    assert.equal(server.phoneName(m, model), web.phoneName(m, model));
  }
  for (const dac of ["USB-Audio - Cayin RU7", "USB Audio - FiiO KA1", "HiBy FC3", "USB-Audio - ", "", undefined]) {
    assert.equal(server.cleanDacName(dac), web.cleanDacName(dac));
  }
  for (const [rate, bits] of [[192000, 24], [44100, 16], [0, 0], [48000, 0]]) {
    assert.equal(server.formatResolution(rate, bits), web.formatResolution(rate, bits));
  }
});
