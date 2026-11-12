import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { registerSchema } from "./services/auth.js";

describe("registerSchema", () => {
  it("rejects short passwords", () => {
    assert.throws(() =>
      registerSchema.parse({ email: "a@b.co", password: "short", displayName: "Ada" })
    );
  });

  it("accepts a strong password", () => {
    const parsed = registerSchema.parse({
      email: "ada@example.com",
      password: "StrongPass1x",
      displayName: "Ada Lovelace",
    });
    assert.equal(parsed.email, "ada@example.com");
  });
});
