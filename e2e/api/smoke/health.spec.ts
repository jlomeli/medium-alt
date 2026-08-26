import { test, expect } from "@e2e/support/fixtures";

test.describe("@smoke @api health", () => {
  test("the app answers on / with 200", async ({ api }) => {
    const res = await api.get("/");
    expect(res.status()).toBe(200);
  });
});
