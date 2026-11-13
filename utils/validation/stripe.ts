import { z } from "zod";

export const StripeAddressSchema = z.object({
  line1: z.string(),
  line2: z.string().optional().nullable(),
  city: z.string(),
  state: z.string().optional(),
  postal_code: z.string(),
  country: z.string(),
});

export type ShippingDetail = z.infer<typeof StripeAddressSchema>;

export const validateShippingAddress = (address: unknown) => {
  const parsed = StripeAddressSchema.safeParse(address);

  if (!parsed.success) {
    console.log("Failed to validate stripe address object!");
    throw new Error("Failed to validate given stripe address!");
  }
  console.log("shipping address was validated successfully");
  return parsed.data;
};
