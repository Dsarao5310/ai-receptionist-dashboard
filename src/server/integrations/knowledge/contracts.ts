import { z } from "zod";

const boundedText = (max: number) => z.string().trim().min(1).max(max);
const knowledgeCategorySchema = z.enum([
  "faq", "parking", "payment", "cancellation", "late_arrival",
  "booking", "accessibility", "general",
]);

export const knowledgeEntryInputSchema = z.object({
  category: knowledgeCategorySchema,
  title: boundedText(300),
  content: z.string().trim().max(20_000),
  active: z.boolean(),
}).strict();

export const knowledgeEntryPatchSchema = knowledgeEntryInputSchema.partial().strict().refine(
  (patch) => Object.keys(patch).length > 0,
  "At least one field is required."
);

export const knowledgeDocumentSchema = z.object({
  id: boundedText(128),
  version: z.number().int().min(0),
  category: knowledgeCategorySchema,
  title: boundedText(300),
  content: z.string().trim().max(20_000),
  active: z.boolean(),
}).strict();

export const knowledgeQuerySchema = z.object({
  text: boundedText(2_000),
  limit: z.number().int().min(1).max(20).default(5),
}).strict();

export const knowledgeMatchesSchema = z.array(z.object({
  id: boundedText(128),
  title: boundedText(300),
  content: z.string().trim().max(20_000),
  score: z.number().finite().min(0).max(1),
}).strict()).max(20);

export type KnowledgeDocument = z.infer<typeof knowledgeDocumentSchema>;
export type KnowledgeQuery = z.infer<typeof knowledgeQuerySchema>;

export type KnowledgeMatch = z.infer<typeof knowledgeMatchesSchema>[number];

export interface KnowledgeProviderClient {
  upsert(namespace: string, document: KnowledgeDocument): Promise<void>;
  remove(namespace: string, documentId: string, version: number): Promise<void>;
  search(namespace: string, query: KnowledgeQuery): Promise<KnowledgeMatch[]>;
}
