"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { saveEmailTemplateAction } from "@/app/actions/emails";
import type { FormState } from "@/app/actions/auth";
import {
  emailDef,
  emailHtml,
  placeholdersOf,
  renderBody,
  renderHeading,
  renderSubject,
  sampleValues,
  type EmailContent,
  type EmailKey,
} from "@/lib/email-templates";
import { useSuccessToast } from "@/lib/use-success-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormError } from "@/components/form-error";

type Field = keyof EmailContent;

export function EmailEditor({
  slug,
  emailKey,
  clubName,
  initial,
}: {
  slug: string;
  emailKey: EmailKey;
  clubName: string;
  initial: EmailContent;
}) {
  const def = emailDef(emailKey)!;
  const [text, setText] = useState<EmailContent>(initial);
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    saveEmailTemplateAction.bind(null, slug, emailKey),
    {}
  );
  useSuccessToast(pending, state.error, "Email saved");

  // Placeholders go where the cursor last was.
  const subjectRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [lastField, setLastField] = useState<Field>("body");
  const insert = (token: string) => {
    const el =
      lastField === "subject"
        ? subjectRef.current
        : lastField === "heading"
          ? headingRef.current
          : bodyRef.current;
    const value = text[lastField];
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    setText({ ...text, [lastField]: value.slice(0, start) + token + value.slice(end) });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };
  const bind = (field: Field) => ({
    name: field,
    value: text[field],
    onFocus: () => setLastField(field),
    onChange: (e: { target: { value: string } }) => setText({ ...text, [field]: e.target.value }),
  });

  const preview = useMemo(() => {
    const values = { ...sampleValues(def), club: clubName };
    return {
      subject: renderSubject(text.subject, values),
      html: emailHtml({
        heading: renderHeading(text.heading, values),
        body: renderBody(text.body, values),
        clubName,
        button: def.button ? { label: def.button, url: "#" } : undefined,
      }),
    };
  }, [def, text, clubName]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form action={formAction} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="subject">Subject</Label>
          <Input id="subject" ref={subjectRef} required {...bind("subject")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="heading">Heading</Label>
          <Input id="heading" ref={headingRef} {...bind("heading")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="body">Body</Label>
          <Textarea id="body" ref={bodyRef} rows={12} required {...bind("body")} />
          <p className="text-xs text-muted-foreground">
            Leave a blank line between paragraphs. Put **two asterisks** around
            words to make them bold. A paragraph that comes out empty, such as{" "}
            {"{guests}"} for someone bringing none, is left out.
            {def.button
              ? ` The "${def.button}" button and the signature are added below the text.`
              : " The signature is added below the text."}
          </p>
        </div>

        <Card size="sm">
          <CardHeader>
            <CardTitle>Placeholders</CardTitle>
            <p className="text-xs font-normal text-muted-foreground">
              Click one to put it where your cursor is.
            </p>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5">
              {placeholdersOf(def).map((p) => (
                <li key={p.key} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <button
                    type="button"
                    onClick={() => insert(`{${p.key}}`)}
                    className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground hover:bg-accent"
                  >
                    {`{${p.key}}`}
                  </button>
                  <span className="text-muted-foreground">{p.about}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <FormError message={state.error} />
        <Button type="submit" loading={pending}>
          Save email
        </Button>
      </form>

      <div className="space-y-2 lg:sticky lg:top-20 lg:self-start">
        <p className="text-sm font-medium">Preview, with sample details</p>
        <div className="overflow-hidden rounded-xl border border-border">
          <p className="border-b border-border bg-muted/60 px-4 py-2 text-sm">
            <span className="text-muted-foreground">Subject: </span>
            {preview.subject}
          </p>
          {/* Emails are read on white; the preview matches. */}
          <div
            className="bg-white text-sm"
            dangerouslySetInnerHTML={{ __html: preview.html }}
          />
        </div>
      </div>
    </div>
  );
}
