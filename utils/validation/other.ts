import { uuidSchema, collectionNameSchema, orderStatusSchema } from "./schemas/common";

export const validateUUID = (uuid: string) => {
  return uuidSchema.safeParse(uuid);
};

export const validateCollectionName = (name: string) => {
  return collectionNameSchema.safeParse(name);
};

export const validateOrderStatus = (status: string) => {
  return orderStatusSchema.safeParse(status);
};
