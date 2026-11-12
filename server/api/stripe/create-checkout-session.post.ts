import { paymentsEnabled } from "@utils/payments";
import { Stripe } from "stripe";
import { serverSupabaseClient } from "#supabase/server";
import { getArtworkPrice } from "@server/services/artworks.service";

export default defineEventHandler(async (event) => {
  if (!paymentsEnabled) {
    throw createError({ statusCode: 503, statusMessage: "Payments are temporarily unavailable" });
  }
  const config = useRuntimeConfig();
  const stripe = new Stripe(config.stripeSecretKey);
  const currency = "usd";
  const domesticShippingFee = config.public.stripeDomesticShippingId;
  const internationalShippingFee = config.public.stripeInternationalShippingId;

  const body = await readBody(event);
  const artworkId = body?.artworkId;
  const artworkName = body?.artworkName;

  console.log(artworkName);
  if (!artworkId || !artworkName) {
    console.log("Missing artwork details in the body");
    throw createError({ statusCode: 400, statusMessage: "Bad Request," });
  }

  try {
    const supabase = await serverSupabaseClient(event);
    const amount = await getArtworkPrice(supabase, artworkId);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: `${artworkName}`,
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      shipping_address_collection: {
        allowed_countries: ["US", "CA"], // or any countries you support
      },
      shipping_options: [
        { shipping_rate: domesticShippingFee },
        { shipping_rate: internationalShippingFee },
      ],
      metadata: {
        artworkId: artworkId,
        price: amount,
      },
      success_url: `${
        getRequestURL(event).origin
      }/payments/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${getRequestURL(event).origin}/payments/cancel`,
    });

    return { url: session.url };
  } catch (error) {
    console.log("Error getting artwork price: " + (error as Error).message);
    throw createError({
      statusCode: 500,
      statusMessage: "Failed to create checkout session!",
    });
  }
});
