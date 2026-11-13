import { z } from "zod";

export const profileSchema = z.object({
  bio: z.string().trim().min(1).max(10000),
});
