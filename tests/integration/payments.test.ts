import { beforeEach, expect, it, vi } from "vitest";
import Stripe from "stripe";
import { endpoint } from "../helpers/http";
import webhook from "../../server/api/stripe/webhook.post";
import checkout from "../../server/api/stripe/create-checkout-session.post";
import { serverSupabaseClient } from "../helpers/supabase";
const state = vi.hoisted(() => ({
  events: {} as Record<string, Record<string, unknown>>,
  otherOrder: { id: "order-other", stripe_payment_intent_id: "pi_other", status: "PAID" } as Record<string, unknown>,
  orderWrites: 0,
  soldWrites: 0,
  order: null as null | Record<string, unknown>,
  sold: false,
}));
const checkoutCreate = vi.hoisted(() =>
  vi.fn(async (_params: Stripe.Checkout.SessionCreateParams) => ({ url: "https://checkout.stripe.test/session" })),
);
vi.mock("stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("stripe")>();
  class TestStripe extends actual.default {
    constructor(...args: ConstructorParameters<typeof actual.default>) {
      super(...args);
      this.checkout.sessions.create = checkoutCreate as never;
    }
  }
  return { ...actual, default: TestStripe, Stripe: TestStripe };
});
vi.mock("@supabase/supabase-js", () => ({ createClient: () => database }));
const database = {
  from(table: string) {
    let action = "select";
    let values: Record<string, unknown> = {};
    const filters: Record<string, unknown> = {};
    const matches = (row: Record<string, unknown>) => Object.entries(filters).every(([key, value]) => row[key] === value);
    const result = () => {
      if (table === "webhook_event") {
        const eventId = (values.event_id || filters.event_id) as string;
        if (action === "insert") {
          if (state.events[eventId]) return { data: null, error: { code: "23505" } };
          state.events[eventId] = { id: eventId, ...values };
        }
        const row = state.events[eventId];
        if (action === "update" && row) Object.assign(row, values);
        return { data: row || null, error: null };
      }
      if (table === "orders") {
        if (action === "insert") {
          state.orderWrites++;
          state.order = { id: "order-1", status: "PAID", ...values };
          return { data: null, error: null };
        }
        const rows = [state.order, state.otherOrder].filter((row): row is Record<string, unknown> => !!row && matches(row));
        if (action === "update") rows.forEach(row => Object.assign(row, values));
        return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { code: "PGRST116" } };
      }
      if (table === "artworks") {
        if (action === "update") {
          state.soldWrites++;
          state.sold = values.sold === true;
        }
        return { data: { price: 250 }, error: null };
      }
      throw new Error(`Unexpected table: ${table}`);
    };
    const query = {
      select: () => query,
      eq: (key: string, value: unknown) => { filters[key] = value; return query; },
      single: async () => result(),
      maybeSingle: async () => result(),
      insert: (v: Record<string, unknown>) => {
        action = "insert";
        values = v;
        return query;
      },
      update: (v: Record<string, unknown>) => {
        action = "update";
        values = v;
        return query;
      },
      then: (resolve: (v: unknown) => void) =>
        Promise.resolve(result()).then(resolve),
    };
    return query;
  },
};
beforeEach(() => {
  state.events = {};
  state.otherOrder = { id: "order-other", stripe_payment_intent_id: "pi_other", status: "PAID" };
  state.orderWrites = 0;
  state.soldWrites = 0;
  state.order = null;
  state.sold = false;
  checkoutCreate.mockClear();
  serverSupabaseClient.mockResolvedValue(database);
});
const event = {
  id: "evt_paid",
  type: "checkout.session.completed",
  data: {
    object: {
      id: "cs_test",
      metadata: { artworkId: "artwork-1", price: "25000" },
      customer_details: {
        name: "Buyer",
        email: "buyer@example.test",
        address: {
          line1: "1 Main",
          city: "Boston",
          state: "MA",
          postal_code: "02108",
          country: "US",
        },
      },
      payment_intent: "pi_test",
      shipping_cost: { amount_total: 1000 },
    },
  },
};
async function deliver(payload: { id: string; type: string; data: { object: unknown } } = event, valid = true) {
  const body = JSON.stringify(payload);
  const signature = new Stripe(
    "sk_test_fake",
  ).webhooks.generateTestHeaderString({
    payload: body,
    secret: valid ? "whsec_test" : "whsec_wrong",
  });
  return endpoint(
    "/webhook",
    webhook,
    "post",
  )(
    new Request("http://localhost/webhook", {
      method: "POST",
      body,
      headers: { "stripe-signature": signature },
    }),
  );
}
it("creates an order and marks artwork sold once when a signed payment is replayed", async () => {
  expect((await deliver()).status).toBe(200);
  expect(state.order).toMatchObject({
    artwork_id: "artwork-1",
    amount: 25000,
    stripe_payment_intent_id: "pi_test",
  });
  expect(state.sold).toBe(true);
  expect((await deliver()).status).toBe(200);
  expect(state.orderWrites).toBe(1);
  expect(state.soldWrites).toBe(1);
});
it("rejects an invalid signature without creating an order", async () => {
  expect((await deliver(event, false)).status).toBeGreaterThanOrEqual(400);
  expect(state.order).toBeNull();
  expect(state.sold).toBe(false);
});
it("creates checkout with the server price", async () => {
  const response = await endpoint(
    "/checkout",
    checkout,
    "post",
  )(
    new Request("http://localhost/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        artworkId: "artwork-1",
        artworkName: "Flowers",
        price: 1,
      }),
    }),
  );
  expect(response.status).toBe(200);
  expect(
    checkoutCreate.mock.calls[0]?.[0].line_items[0].price_data.unit_amount,
  ).toBe(25000);
});

it("updates the matching order when Stripe sends a refund", async () => {
  expect((await deliver()).status).toBe(200);
  const refund = {
    id: "evt_refund",
    type: "charge.refunded",
    data: { object: { payment_intent: "pi_test" } },
  };
  expect((await deliver(refund)).status).toBe(200);
  expect(state.order).toMatchObject({
    status: "REFUNDED",
    stripe_payment_intent_id: "pi_test",
  });
  expect(state.orderWrites).toBe(1);
  expect(state.otherOrder.status).toBe("PAID");
});
