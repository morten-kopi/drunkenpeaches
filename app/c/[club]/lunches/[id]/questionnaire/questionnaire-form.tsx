"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { CircleCheckIcon, InfoIcon } from "lucide-react";
import {
  submitQuestionnaireAction,
  type QuestionnaireState,
} from "@/app/actions/questionnaire";
import type { QuestionnaireAnswers, QuestionnaireQuestion } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { FormError } from "@/components/form-error";
import { cn } from "@/lib/utils";

interface QuestionnaireFormProps {
  slug: string;
  lunchId: string;
  intro: string | null;
  questions: QuestionnaireQuestion[];
  /** The member's earlier answers; null if they haven't answered. */
  answers: QuestionnaireAnswers | null;
  /** For the committee: the questions, without a way to answer. */
  preview?: boolean;
}

function asText(answers: QuestionnaireAnswers | null) {
  return Object.fromEntries(
    Object.entries(answers ?? {}).map(([k, v]) => [k, String(v)])
  );
}

export function QuestionnaireForm({
  slug,
  lunchId,
  intro,
  questions,
  answers,
  preview = false,
}: QuestionnaireFormProps) {
  const [state, formAction, pending] = useActionState<
    QuestionnaireState,
    FormData
  >(submitQuestionnaireAction.bind(null, slug, lunchId), {});
  // Controlled, so a refused submit keeps everything the member entered.
  const [values, setValues] = useState<Record<string, string>>(() =>
    asText(answers)
  );
  const [editing, setEditing] = useState(answers == null);
  const [submittedAt, setSubmittedAt] = useState<QuestionnaireState | null>(
    null
  );
  // A new successful submit shows the thank-you again.
  if (state.success && state !== submittedAt) {
    setSubmittedAt(state);
    setEditing(false);
  }

  if (!preview && !editing) {
    return (
      <Card className="border-success/30 bg-success/5">
        <CardContent className="space-y-4 py-5">
          <div className="flex items-start gap-3">
            <CircleCheckIcon className="mt-0.5 size-5 shrink-0 text-success" />
            <div className="space-y-1">
              <p className="font-medium text-foreground">
                Thank you. Your answers are in.
              </p>
              <p className="text-sm text-muted-foreground">
                You can change them at any time.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setEditing(true)}>
              Change my answers
            </Button>
            <Button
              variant="ghost"
              render={<Link href={`/c/${slug}/lunches/${lunchId}`} />}
            >
              Back to the lunch
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <form action={formAction} className="max-w-2xl space-y-6">
      {intro ? (
        <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm text-foreground/90">
          <InfoIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span>{intro}</span>
        </p>
      ) : null}

      <fieldset disabled={preview || pending} className="space-y-6">
        {questions.map((q) => (
          <Card key={q.key}>
            <CardContent>
              <fieldset>
                <legend className="mb-3 font-medium text-foreground">
                  {q.label}
                  {q.type === "rating" && q.weight != null ? (
                    <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                      ({q.weight}%)
                    </span>
                  ) : null}
                  {q.required ? (
                    <span className="ml-1 text-destructive" aria-hidden>
                      *
                    </span>
                  ) : null}
                </legend>
                {q.type === "rating" ? (
                  <div className="space-y-2">
                    {q.options.map((o) => {
                      const value = String(o.value);
                      return (
                        <label
                          key={value}
                          className={cn(
                            "flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3 py-2.5 transition-colors",
                            "hover:bg-muted/50 has-checked:border-primary has-checked:bg-primary/5",
                            "has-disabled:cursor-default has-disabled:hover:bg-transparent"
                          )}
                        >
                          <input
                            type="radio"
                            name={`q.${q.key}`}
                            value={value}
                            checked={values[q.key] === value}
                            onChange={() =>
                              setValues((prev) => ({ ...prev, [q.key]: value }))
                            }
                            required={q.required}
                            className="mt-0.5 size-4 shrink-0 accent-primary"
                          />
                          <span className="text-sm">
                            <span className="font-medium text-foreground">
                              {o.value}. {o.label}
                            </span>
                            {o.hint ? (
                              <span className="block text-muted-foreground">
                                {o.hint}
                              </span>
                            ) : null}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <Textarea
                    name={`q.${q.key}`}
                    aria-label={q.label}
                    rows={5}
                    maxLength={5000}
                    value={values[q.key] ?? ""}
                    onChange={(e) =>
                      setValues((prev) => ({ ...prev, [q.key]: e.target.value }))
                    }
                    required={q.required}
                    placeholder="Your answer"
                  />
                )}
              </fieldset>
            </CardContent>
          </Card>
        ))}
      </fieldset>

      {preview ? null : (
        <>
          <FormError message={state.error} />
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" loading={pending}>
              {answers ? "Save my answers" : "Send my answers"}
            </Button>
            {answers ? (
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  setValues(asText(answers));
                  setEditing(false);
                }}
              >
                Keep my earlier answers
              </Button>
            ) : null}
          </div>
        </>
      )}
    </form>
  );
}
