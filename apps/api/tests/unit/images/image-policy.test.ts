import assert from "node:assert/strict";
import { test } from "vitest";
import { isPrivateAddress, parseAllowedSource } from "../../../src/modules/images/services/image-policy.js";

test("private and special-purpose addresses are rejected", () => {
  for (const address of [
    "127.0.0.1",
    "0.0.0.0",
    "10.20.30.40",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.10",
    "169.254.169.254",
    "100.64.0.1",
    "224.0.0.1",
    "::1",
    "::",
    "fd00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "not-an-ip",
  ]) {
    assert.equal(isPrivateAddress(address), true, `${address} should be private`);
  }
});

test("public addresses pass", () => {
  for (const address of ["8.8.8.8", "172.32.0.1", "198.51.100.7", "2606:4700:4700::1111"]) {
    assert.equal(isPrivateAddress(address), false, `${address} should be public`);
  }
});

test("only allowlisted https hosts are proxied", () => {
  const allowed = ["upload.wikimedia.org"];
  assert.ok(parseAllowedSource("https://upload.wikimedia.org/a/b.jpg", allowed));
  assert.equal(parseAllowedSource("http://upload.wikimedia.org/a/b.jpg", allowed), null);
  assert.equal(parseAllowedSource("https://upload.wikimedia.org.evil.test/a.jpg", allowed), null);
  assert.equal(parseAllowedSource("https://evil.test/a.jpg", allowed), null);
  assert.equal(parseAllowedSource("https://user:pass@upload.wikimedia.org/a.jpg", allowed), null);
  assert.equal(parseAllowedSource("ftp://upload.wikimedia.org/a.jpg", allowed), null);
});

test("http is only accepted when explicitly allowed (tests)", () => {
  assert.ok(parseAllowedSource("http://127.0.0.1:8080/a.png", ["127.0.0.1"], true));
  assert.equal(parseAllowedSource("http://127.0.0.1:8080/a.png", ["127.0.0.1"], false), null);
});
