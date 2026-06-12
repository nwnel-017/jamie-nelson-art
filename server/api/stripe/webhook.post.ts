import { stripe } from "@server/utils/stripe/stripe";
import { Stripe } from "stripe";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  createOrder,
  updateOrderStatusById,
  getOrderByPaymentIntentId,
} from "@server/services/orders.service";
import {
  ShippingDetail,
  validateShippingAddress,
} from "@utils/validation/stripe";
import { getStripeId } from "@utils/stripe/stripe";
import type { Database } from "#types/supabase/database";

async function insertWebhookEvent(
  supabase: SupabaseClient<Database>,
  stripeEventId: string,
) {
  const { error } = await supabase.from("webhook_event").insert({
    event_id: stripeEventId,
    status_type: "PENDING",
  });

  if (error) {
    throw error;
  }
}

async function getWebhookEvent(
  supabase: SupabaseClient<Database>,
  stripeEventId: string,
) {
  const { data, error } = await supabase
    .from("webhook_event")
    .select("id, status_type")
    .eq("event_id", stripeEventId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function markWebhookEventProcessed(
  supabase: SupabaseClient<Database>,
  stripeEventId: string,
) {
  const { error } = await supabase
    .from("webhook_event")
    .update({
      status_type: "PROCESSED",
      processed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      error_message: null,
    })
    .eq("event_id", stripeEventId);

  if (error) {
    throw error;
  }
}

async function processEvent(
  stripeEvent: Stripe.Event,
  supabase: SupabaseClient<Database>,
) {
  const webhookEvent = await getWebhookEvent(supabase, stripeEvent.id);

  if (!webhookEvent || webhookEvent.status_type === "PROCESSED") {
    return;
  }

  switch (stripeEvent.type) {
    case "checkout.session.completed": {
      console.log("processed payment event detected");
      const session = stripeEvent.data.object as Stripe.Checkout.Session;

      const artworkId = session.metadata?.artworkId;
      const name = session?.customer_details?.name;
      const userEmail = session.customer_details?.email;
      const shipping = session.customer_details?.address;
      const price = session.metadata?.price;
      const paymentIntentId = session.payment_intent as string;
      const shippingCost = session.shipping_cost?.amount_total;

      const checkoutSessionId = session.id;
      // const chargeId = paymentIntentId.charges.data[0].id

      console.log("name retrieved from stipe: " + name);
      console.log("shipping cost: " + shippingCost);
      const validatedShippingAddress: ShippingDetail =
        validateShippingAddress(shipping);

      if (
        !artworkId ||
        !userEmail ||
        !name ||
        !shipping ||
        !price ||
        !paymentIntentId ||
        !checkoutSessionId ||
        !shippingCost
      ) {
        throw new Error("Missing required parameters!");
      }

      try {
        await createOrder(
          supabase,
          artworkId,
          userEmail,
          name,
          price,
          shippingCost,
          validatedShippingAddress,
          paymentIntentId,
          checkoutSessionId,
        );
        await markWebhookEventProcessed(supabase, stripeEvent.id);
      } catch (err) {
        console.log("Something went wrong: " + err);
        throw new Error("Something went wrong!");
      }
      break;
    }
    case "charge.refunded":
    case "refund.created": {
      console.log("Refund event received:", stripeEvent.type);

      try {
        let paymentIntentId: string | null = null;

        if (stripeEvent.type === "charge.refunded") {
          const charge = stripeEvent.data.object as Stripe.Charge;
          paymentIntentId = getStripeId(charge.payment_intent);
        }

        if (stripeEvent.type === "refund.created") {
          const refund = stripeEvent.data.object as Stripe.Refund;
          paymentIntentId = getStripeId(refund.payment_intent);
        }

        if (!paymentIntentId) {
          throw new Error("Missing payment_intent on refund event");
        }

        const order = await getOrderByPaymentIntentId(
          supabase,
          paymentIntentId,
        );

        await updateOrderStatusById(supabase, order.id, "REFUNDED");
        await markWebhookEventProcessed(supabase, stripeEvent.id);
      } catch (err) {
        console.error("Failed to process refund:", err);
        throw err;
      }

      break;
    }
  }
}

// TO DO - when site grows we will need to add queue processing for webhook events to protect from race conditions
// add transactions for db integrity
export default defineEventHandler(async (event) => {
  console.log("stripe webhook has been reached");

  const config = useRuntimeConfig();
  const stripeWebhookSecret = config.stripeWebhookSecret;
  const rawBody = await readRawBody(event);
  const signature = getHeader(event, "stripe-signature");

  if (!signature || !rawBody) {
    throw createError({ statusCode: 400, message: "Bad Request" });
  }

  let stripeEvent: Stripe.Event;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      rawBody!,
      signature!,
      stripeWebhookSecret,
    );
  } catch (err) {
    console.log("An error occured reading the event: " + err);
    throw new Error("Failed to retrieve event!");
  }

  const supabase = createClient(
    config.public.supabaseUrl,
    config.supabaseServiceKey,
  );

  try {
    await insertWebhookEvent(supabase, stripeEvent.id);
  } catch (err) {
    console.log("Failed to insert webhook event: ", err);
  }

  await processEvent(stripeEvent, supabase);

  return { received: true };
});
