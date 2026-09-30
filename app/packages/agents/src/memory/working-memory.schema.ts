import { z } from "zod";

const personal = (description: string) => ({ description, pii: "personal" as const });

/**
 * Working memory of a user inside one organization (SP3 spec §10, decision 0029):
 * preferences only, never secrets, credentials or business records. The resource
 * is `tenantId:uid`, so the same person in two organizations has two of these.
 * The model fills it through Mastra's working memory tool; every field is optional
 * and bounded so a prompt cannot grow it without limit.
 */
export const WorkingMemorySchema = z
  .object({
    language: z.string().min(2).max(35).optional().meta(personal("Preferred language of the answers (BCP 47 tag or plain name).")),
    tone: z.enum(["concise", "detailed", "formal", "casual"]).optional().meta(personal("Preferred answer style.")),
    recurringGoals: z.array(z.string().min(1).max(200)).max(10).optional().meta(personal("Goals the user keeps coming back to, in their words.")),
  })
  .meta(personal("Preferences the assistant keeps about the user within one organization."));
export type WorkingMemory = z.infer<typeof WorkingMemorySchema>;
