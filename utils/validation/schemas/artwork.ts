import { z } from "zod";
import { priceSchema, FileType } from "./common";

// TO DO: review
export const artworkFormSchema = z
  .object({
    title: z
      .string()
      .min(1, { message: "Title is required" })
      .max(50, { message: "Title is too long" }),
    description: z
      .string()
      .min(1, { message: "Description is required" })
      .max(500, { message: "Description is too long" }),
    price: priceSchema,
    dimensions: z
      .string()
      .min(1, { message: "Dimensions are required" })
      .max(50, { message: "Dimesniosn are too long" }),
    year: z
      .string()
      .trim()
      .regex(/^(\d{4})?$/, { message: "Year must be a 4 digit number" })
      .optional(),
    medium: z.string().max(100, { message: "Medium is too long" }).optional(),
    artwork_note: z.string().optional(),
    collection: z
      .string()
      .min(1, { message: "Collection is required" })
      .max(50, { message: "Collection is too long" }),
    cover_image: z.boolean().optional(),
  })
  .strict()
  .strip();

export const existingArtworkFormSchema = z
  .object({
    id: z.uuid(),
    title: z
      .string()
      .min(1, { message: "Title is required" })
      .max(50, { message: "Title is too long" }),
    description: z
      .string()
      .min(1, { message: "Description is required" })
      .max(500, { message: "Description is too long" }),
    price: priceSchema,
    dimensions: z
      .string()
      .min(1, { message: "Dimensions are required" })
      .max(50, { message: "Dimensions is too long" }),
    image: z.custom<File>((v) => v instanceof FileType).optional(),
  })
  .strict()
  .strip();

export type ArtworkForm = z.infer<typeof artworkFormSchema>;

export type ExistingArtworkForm = z.infer<typeof existingArtworkFormSchema>;
