import { test } from "node:test";
import assert from "node:assert/strict";
import { createLimiter, ipGroup } from "../src/limits.js";

test("IPv4 as is; IPv6 grouped by its /64 block", () => {
  assert.equal(ipGroup("203.0.113.7"), "203.0.113.7");
  assert.equal(ipGroup("::ffff:203.0.113.7"), "203.0.113.7");
  assert.equal(ipGroup("2001:db8:1:2:aaaa::1"), "2001:db8:1:2::/64");
  assert.equal(ipGroup("2001:0db8:0001:0002:ffff:1:2:3"), "2001:db8:1:2::/64");
  assert.equal(ipGroup("2001:db8::5"), "2001:db8:0:0::/64");
  assert.equal(ipGroup("fe80::1%eth0"), "fe80:0:0:0::/64");
});

test("two reports per sender every 24 hours", () => {
  const limiter = createLimiter({ limitMs: 1000 });
  assert.equal(limiter.take("a", 0), "ok");
  assert.equal(limiter.take("a", 400), "ok");
  assert.equal(limiter.take("a", 500), "ip");
  assert.equal(limiter.take("b", 500), "ok");
  assert.equal(limiter.take("a", 1000), "ok"); // the first one is over 24 hours old
  assert.equal(limiter.take("a", 1100), "ip");
});

test("a report that couldn't be delivered gives its slot back to the sender", () => {
  const limiter = createLimiter({ limitMs: 1000 });
  assert.equal(limiter.take("a", 0), "ok");
  assert.equal(limiter.take("a", 100), "ok");
  limiter.release("a", 100);
  assert.equal(limiter.take("a", 200), "ok");
  assert.equal(limiter.take("a", 300), "ip");
});

test("daily cap for everyone together, and slots given back when delivery fails", () => {
  const limiter = createLimiter({ dailyCap: 2 });
  const now = Date.parse("2026-10-17T10:00:00Z");
  assert.equal(limiter.take("a", now), "ok");
  assert.equal(limiter.take("b", now), "ok");
  assert.equal(limiter.take("c", now), "daily");
  limiter.release("b", now);
  assert.equal(limiter.take("c", now), "ok");
  assert.equal(limiter.take("d", Date.parse("2026-10-18T00:00:01Z")), "ok"); // new day
});
