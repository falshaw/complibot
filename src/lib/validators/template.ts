import { z } from "zod";
import { QUESTION_TYPES, SECURITY_DOMAINS } from "@/lib/ui/labels";

export const templateQuestionSchema = z.object({
  text: z.string().trim().min(5, "Each question needs at least 5 characters").max(2000),
  type: z.enum(QUESTION_TYPES).default("FREE_TEXT"),
  domain: z.enum(SECURITY_DOMAINS).default("GENERAL"),
  required: z.boolean().default(true),
});

const fields = {
  name: z.string().trim().min(1, "Give the template a name").max(200),
  description: z.string().trim().max(2000).optional(),
  framework: z.string().trim().max(100).optional(),
  questions: z
    .array(templateQuestionSchema)
    .min(1, "Add at least one question")
    .max(500, "A template holds at most 500 questions"),
};

export const createTemplateSchema = z.object(fields);
export const updateTemplateSchema = z.object(fields).partial();

export type TemplateQuestion = z.infer<typeof templateQuestionSchema>;

/** questionCount and domains are derived from the questions, never sent. */
export function templateStats(questions: TemplateQuestion[]) {
  return {
    questionCount: questions.length,
    domains: Array.from(new Set(questions.map((q) => q.domain))),
  };
}
