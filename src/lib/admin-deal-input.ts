import { z } from "zod";

export const adminDealTypeSchema = z.enum(["sale", "rent", "mortgage", "buy"]);
export const adminDealStatusSchema = z.enum([
  "prospect",
  "negotiation",
  "agreement",
  "contracted",
  "completed",
  "cancelled",
]);
export const adminDealDocumentStatusSchema = z.enum(["pending", "received", "verified", "rejected"]);

export const adminDealCreateEnumsSchema = z.object({
  dealType: adminDealTypeSchema.optional().default("sale"),
  status: adminDealStatusSchema.optional().default("prospect"),
});

export const adminDealStatusUpdateSchema = z.object({
  status: adminDealStatusSchema,
});

export const adminDealDocumentUpdateSchema = z.object({
  documentStatus: adminDealDocumentStatusSchema.optional().default("pending"),
});
