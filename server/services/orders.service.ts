import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "#types/supabase/database";
import type { ShippingDetail } from "@utils/validation/stripe";
import { markArtworkAsSold } from "./artworks.service";

export async function getOrders(supabase: SupabaseClient<Database>) {
  if (!supabase) {
    throw new Error("Missing supabase client");
  }

  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, artwork_id, amount, status, created_at, updated_at, address_line_1, buyer_email, buyer_name, shipping_cost",
    );

  if (error || !data) {
    console.log("Error getting orders from supabase: " + error?.message);
    throw new Error("Failed to get orders!");
  }

  return data;
}

export async function getOrderCount(supabase: SupabaseClient<Database>) {
  const { count: orderCount, error: orderError } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true });

  if (orderError) {
    throw createError({
      statusCode: 500,
      statusMessage: "Internal Error",
      data: {
        message: "Failed to fetch total order count",
        details: orderError.message,
      },
    });
  }

  return orderCount || 0;
}

export async function createOrder(
  supabase: SupabaseClient<Database>,
  artworkId: string,
  userEmail: string,
  name: string,
  price: string,
  shippingCost: number,
  address: ShippingDetail,
  paymentIntentId: string,
  checkoutSessionId: string,
) {
  if (
    !supabase ||
    !address ||
    !artworkId ||
    !price ||
    !shippingCost ||
    !userEmail ||
    !name ||
    !paymentIntentId ||
    !checkoutSessionId
  ) {
    throw new Error("Missing Parameters!");
  }

  // Check if order already exists for this payment intent (idempotency)
  const { data: existingOrder } = await supabase
    .from("orders")
    .select("id")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .single();

  if (existingOrder) {
    console.log("Order already exists for payment intent: " + paymentIntentId);
    return;
  }

  const shippingCountry = address.country;
  const shippingCity = address.city;
  const shippingLine1 = address.line1;
  const zip = address.postal_code;
  const shippingState = address.state;

  if (
    !shippingCountry ||
    !shippingCity ||
    !shippingLine1 ||
    !zip ||
    !shippingState
  ) {
    throw new Error("Missing expected fields for shipping address");
  }

  const numericPrice = Number(price);

  if (isNaN(numericPrice)) {
    throw new Error("Invalid price: not a number");
  }

  // To Do: verify order does not exist before inserting
  const { error } = await supabase.from("orders").insert({
    address_line_1: shippingLine1,
    address_line_2: address?.line2 || "",
    artwork_id: artworkId,
    buyer_email: userEmail,
    buyer_name: name,
    city: shippingCity,
    country: shippingCountry,
    amount: numericPrice,
    shipping_cost: shippingCost,
    state: shippingState,
    postal_code: zip,
    stripe_payment_intent_id: paymentIntentId,
    stripe_checkout_session_id: checkoutSessionId,
  });

  if (error) {
    console.log("Failed to create order: " + error?.message);
  }

  try {
    // mark artwork as sold
    await markArtworkAsSold(supabase, artworkId);
  } catch (err) {
    console.log("Something went wrong: " + err);
    throw new Error("Failed to create order!", { cause: err });
  }
}

export async function getOrderByPaymentIntentId(
  supabase: SupabaseClient<Database>,
  paymentIntentId: string,
) {
  if (!supabase || !paymentIntentId) {
    throw new Error("Missing parameters");
  }

  const { data: order, error } = await supabase
    .from("orders")
    .select("id")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .single();

  if (error || !order) {
    console.log("Order not found for payment_intent: " + paymentIntentId);
    throw new Error("Order not found for payment_intent");
  }

  return order;
}

// To Do: check if order status is already updated before updating
export async function updateOrderStatusById(
  supabase: SupabaseClient<Database>,
  orderId: string,
  status: string,
) {
  if (!supabase || !orderId || !status) {
    throw new Error("Missing parameters");
  }

  const { data: order, error } = await supabase
    .from("orders")
    .select("id, status")
    .eq("id", orderId)
    .single();

  if (error || !order) {
    console.log("Order not found in database");
    throw new Error("No order found in database");
  }

  // If status is already the desired status, skip update (idempotent)
  if (order.status === status) {
    console.log(`Order ${orderId} already has status: ${status}`);
    return;
  }

  const { error: updateError } = await supabase
    .from("orders")
    .update({
      status: status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId);

  if (updateError) {
    console.log("Failed to update order: " + updateError.message);
    throw new Error("Failed to update order!");
  }
}

// Returns the sum of the amount field in all orders as a number
export async function getTotalFundsRaised(
  supabase: SupabaseClient<Database>,
): Promise<number> {
  if (!supabase) {
    throw new Error("Missing supabase client");
  }

  const { data, error } = await supabase
    .from("orders")
    .select("amount")
    .neq("status", "REFUNDED");

  console.log("Order amounts data: ", data);

  if (error || !data) {
    console.log("Error getting order amounts from supabase: " + error?.message);
    throw new Error("Failed to get order amounts!");
  }

  // sum up the amount field (ensure null/NaN amounts are handled)
  return data.reduce((sum, order) => {
    const val =
      typeof order.amount === "number" ? order.amount : Number(order.amount);
    return sum + (isNaN(val) ? 0 : val);
  }, 0);
}
