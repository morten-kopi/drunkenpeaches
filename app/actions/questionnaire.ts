"use server";

import { revalidatePath } from "next/cache";
import { requireMember, errorMessage } from "@/lib/action-helpers";
import { questionnairePath } from "@/lib/questionnaire";

export type QuestionnaireState = { error?: string; success?: boolean };

/**
 * A member answers a lunch's questionnaire, or changes their answers. Each
 * answer arrives as a field named "q.<question key>"; submit_questionnaire
 * checks them against the questions and decides who may answer.
 */
export async function submitQuestionnaireAction(
  slug: string,
  lunchId: string,
  _prev: QuestionnaireState,
  formData: FormData
): Promise<QuestionnaireState> {
  try {
    const ctx = await requireMember(slug);
    const answers: Record<string, string> = {};
    for (const [name, value] of formData.entries()) {
      if (name.startsWith("q.") && typeof value === "string") {
        answers[name.slice(2)] = value;
      }
    }
    const { error } = await ctx.supabase.rpc("submit_questionnaire", {
      p_lunch: lunchId,
      p_answers: answers,
    });
    if (error) return { error: error.message };
  } catch (e) {
    return { error: errorMessage(e) };
  }
  revalidatePath(questionnairePath(slug, lunchId));
  revalidatePath(`/c/${slug}/lunches/${lunchId}`);
  return { success: true };
}
