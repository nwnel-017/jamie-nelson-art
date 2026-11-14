import { describe, expect, it } from "vitest";
import { validateOrderStatus, validateUUID } from "../../utils/validation/other";
import { validateShippingAddress } from "../../utils/validation/stripe";

describe("core input validation", () => {
  it("accepts known order statuses and rejects arbitrary values", () => {
    expect(validateOrderStatus("SHIPPED").success).toBe(true);
    expect(validateOrderStatus("MAKE_ADMIN").success).toBe(false);
  });

  it("accepts UUIDs and rejects malformed artwork identifiers", () => {
    expect(validateUUID("550e8400-e29b-41d4-a716-446655440000").success).toBe(true);
    expect(validateUUID("artwork-1").success).toBe(false);
  });

  it("requires shipping fields needed to create an order", () => {
    expect(validateShippingAddress({ line1: "1 Main St", city: "Boston", postal_code: "02108", country: "US" }).country).toBe("US");
    expect(() => validateShippingAddress({ city: "Boston" })).toThrow();
  });
});
