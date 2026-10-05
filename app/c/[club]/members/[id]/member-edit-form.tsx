"use client";

import { useActionState, useRef, useState } from "react";
import { updateMemberAction } from "@/app/actions/members";
import type { FormState } from "@/app/actions/auth";
import type { Membership, MembershipStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormError } from "@/components/form-error";
import { ConfirmDialog } from "@/components/confirm-dialog";

const STATUS_LABELS: Record<MembershipStatus, string> = {
  invited: "Invited (pending)",
  active: "Active",
  resigned: "Resigned",
  lapsed: "Lapsed",
  removed: "Removed",
};

export function MemberEditForm({
  slug,
  member,
  isSelf,
}: {
  slug: string;
  member: Membership;
  isSelf: boolean;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    updateMemberAction.bind(null, slug, member.id),
    {}
  );
  const [role, setRole] = useState<Membership["role"]>(member.role);
  const [status, setStatus] = useState<MembershipStatus>(member.status);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Removing a member is the one destructive status change — confirm it.
  const isRemoving = status === "removed" && member.status !== "removed";

  return (
    <>
      <form ref={formRef} action={formAction} className="max-w-2xl space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="firstName">First name</Label>
            <Input
              id="firstName"
              name="firstName"
              defaultValue={member.first_name}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">Last name</Label>
            <Input
              id="lastName"
              name="lastName"
              defaultValue={member.last_name}
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Email</Label>
          <div className="flex h-9 items-center rounded-lg border border-border bg-muted/50 px-3 text-sm text-muted-foreground">
            {member.email}
          </div>
          <p className="text-xs text-muted-foreground">
            Email is the member&apos;s login and can&apos;t be changed here.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="function">Function</Label>
          <Input
            id="function"
            name="function"
            defaultValue={member.function ?? ""}
            placeholder="e.g. Treasurer"
          />
          <p className="text-xs text-muted-foreground">
            Shown on the roster. Access comes from the role below, not from
            this field.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" name="phone" defaultValue={member.phone ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="joinedOn">Joined on</Label>
            <Input
              id="joinedOn"
              name="joinedOn"
              type="date"
              defaultValue={member.joined_on}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="dietary">Dietary preferences</Label>
          <Textarea
            id="dietary"
            name="dietary"
            rows={2}
            defaultValue={member.dietary_notes ?? ""}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <Select
              value={role}
              onValueChange={(v) => setRole((v as Membership["role"]) ?? "member")}
              disabled={isSelf}
              name={isSelf ? undefined : "role"}
            >
              <SelectTrigger id="role" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">Member</SelectItem>
                <SelectItem value="committee">Committee</SelectItem>
              </SelectContent>
            </Select>
            {isSelf ? (
              <>
                <input type="hidden" name="role" value={member.role} />
                <p className="text-xs text-muted-foreground">
                  You can&apos;t change your own role.
                </p>
              </>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select
              name="status"
              value={status}
              onValueChange={(v) =>
                setStatus((v as MembershipStatus) ?? member.status)
              }
            >
              <SelectTrigger id="status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(STATUS_LABELS) as MembershipStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="comments">Comments</Label>
          <Textarea
            id="comments"
            name="comments"
            rows={3}
            defaultValue={member.comments ?? ""}
            placeholder="e.g. abroad 2012-15"
          />
        </div>

        <FormError message={state.error} />
        <Button
          type="submit"
          loading={pending}
          variant={isRemoving ? "destructive" : "default"}
          onClick={(e) => {
            if (isRemoving) {
              e.preventDefault();
              setConfirmRemove(true);
            }
          }}
        >
          {isRemoving ? "Remove member" : "Save member"}
        </Button>
      </form>

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        destructive
        title={`Remove ${member.full_name || "this member"}?`}
        description="They lose access to the club, but their attendance history is preserved. You can reactivate them later."
        confirmLabel="Remove member"
        onConfirm={() => {
          setConfirmRemove(false);
          formRef.current?.requestSubmit();
        }}
      />
    </>
  );
}
