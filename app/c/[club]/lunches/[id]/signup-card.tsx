"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { LockIcon } from "lucide-react";
import {
  signUpAction,
  cancelMySignupAction,
  updateMyGuestsAction,
  type FormState,
} from "@/app/actions/lunches";
import type { SignupPhase } from "@/lib/signup-phases";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormError } from "@/components/form-error";
import { StatusBadge } from "@/components/status-badge";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useSuccessToast } from "@/lib/use-success-toast";

interface SignupCardProps {
  slug: string;
  lunchId: string;
  guestsAllowed: boolean;
  maxGuests: number;
  /** Formatted in the club's zone; null when the lunch has no guest date. */
  guestsOpenAt: string | null;
  seatsLeft: number;
  cutoffPassed: boolean;
  phase: SignupPhase;
  phaseTitle: string | null;
  phaseDetail: string | null;
  isCommittee: boolean;
  isNextOpenLunch: boolean;
  nextOpenHref?: string | null;
  nextOpenTitle?: string | null;
  mySignup: {
    status: string;
    guest_count: number;
    guest_names: string | null;
  } | null;
}

function ClosedCard({
  mySignup,
  title,
  detail,
}: {
  mySignup: SignupCardProps["mySignup"];
  title: string;
  detail: string;
}) {
  return (
    <Card className="border-warning/30 bg-warning/5">
      <CardContent className="flex items-start gap-3 py-5 text-sm text-muted-foreground">
        <LockIcon className="mt-0.5 size-4 shrink-0 text-warning" />
        <p>
          <span className="font-medium text-foreground">{title}.</span> {detail}
          {mySignup ? (
            <>
              {" "}
              Your place is held.
              <span className="ml-2 inline-flex align-middle">
                <StatusBadge status={mySignup.status} />
              </span>
            </>
          ) : null}
        </p>
      </CardContent>
    </Card>
  );
}

export function SignupCard({
  slug,
  lunchId,
  guestsAllowed,
  maxGuests,
  guestsOpenAt,
  seatsLeft,
  cutoffPassed,
  phase,
  phaseTitle,
  phaseDetail,
  isCommittee,
  isNextOpenLunch,
  nextOpenHref,
  nextOpenTitle,
  mySignup,
}: SignupCardProps) {
  const [signupState, signupForm, signupPending] = useActionState<
    FormState,
    FormData
  >(signUpAction.bind(null, slug, lunchId), {});
  const [cancelState, cancelForm, cancelPending] = useActionState<
    FormState,
    FormData
  >(cancelMySignupAction.bind(null, slug, lunchId), {});
  const [guestState, guestForm, guestPending] = useActionState<
    FormState,
    FormData
  >(updateMyGuestsAction.bind(null, slug, lunchId), {});
  const [editingGuests, setEditingGuests] = useState(false);
  const [guestCount, setGuestCount] = useState(mySignup?.guest_count ?? 0);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const cancelFormRef = useRef<HTMLFormElement>(null);

  useSuccessToast(signupPending, signupState.error, "Your name is on the list");
  useSuccessToast(guestPending, guestState.error, "Guests updated");
  useSuccessToast(cancelPending, cancelState.error, "Your place was withdrawn");

  // The guest date binds everyone, committee included.
  const guestsUi = guestsAllowed && phase === "guests";
  const guestsLater = guestsAllowed && !guestsUi;
  const guestsLaterNote = guestsOpenAt
    ? `Guests may be added from ${guestsOpenAt}.`
    : "Guest places open later.";

  if (cutoffPassed || phase === "closed") {
    return (
      <ClosedCard
        mySignup={mySignup}
        title="The list is closed"
        detail={
          mySignup
            ? "Write to the committee if you can no longer attend."
            : "Write to the committee if you still wish to attend."
        }
      />
    );
  }

  if (mySignup) {
    const confirmed = mySignup.status === "confirmed";
    // Guests already on the list can always be reduced before the cutoff.
    const canChangeGuests = guestsUi || mySignup.guest_count > 0;
    return (
      <Card className={confirmed ? "border-success/30" : "border-warning/30"}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {confirmed ? "Your name is on the list" : "You are on the waitlist"}
            <StatusBadge status={mySignup.status} />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {mySignup.guest_count > 0 ? (
            <p className="text-sm text-muted-foreground">
              Bringing {mySignup.guest_count} guest
              {mySignup.guest_count > 1 ? "s" : ""}
              {mySignup.guest_names ? ` — ${mySignup.guest_names}` : ""}.
            </p>
          ) : guestsLater ? (
            <p className="text-sm text-muted-foreground">{guestsLaterNote}</p>
          ) : null}

          {canChangeGuests && !editingGuests ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditingGuests(true)}
            >
              Change guests
            </Button>
          ) : null}

          {canChangeGuests && editingGuests ? (
            <form
              action={guestForm}
              className="space-y-3 rounded-xl border border-border bg-muted/40 p-4"
            >
              <div className="space-y-2">
                <Label htmlFor="guestCount">Guests (max {maxGuests})</Label>
                <Input
                  id="guestCount"
                  name="guestCount"
                  type="number"
                  min={0}
                  max={maxGuests}
                  className="w-24"
                  value={guestCount}
                  onChange={(e) => setGuestCount(Number(e.target.value))}
                />
              </div>
              {guestCount > 0 ? (
                <div className="space-y-2">
                  <Label htmlFor="guestNames">Guest names</Label>
                  <Input
                    id="guestNames"
                    name="guestNames"
                    defaultValue={mySignup.guest_names ?? ""}
                    placeholder="Jane Doe, John Smith"
                  />
                </div>
              ) : null}
              <FormError message={guestState.error} />
              <div className="flex gap-2">
                <Button type="submit" size="sm" loading={guestPending}>
                  Save
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditingGuests(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          ) : null}

          <form ref={cancelFormRef} action={cancelForm}>
            <FormError message={cancelState.error} />
          </form>
          <Button
            variant="destructive"
            loading={cancelPending}
            onClick={() => setConfirmCancel(true)}
          >
            Withdraw my name
          </Button>
          <ConfirmDialog
            open={confirmCancel}
            onOpenChange={setConfirmCancel}
            destructive
            title="Withdraw your name?"
            description="If the table is full, the next member on the waitlist is offered the place and written to."
            confirmLabel="Withdraw"
            cancelLabel="Keep my place"
            onConfirm={() => {
              setConfirmCancel(false);
              cancelFormRef.current?.requestSubmit();
            }}
          />
        </CardContent>
      </Card>
    );
  }

  if (phase === "not_open" && !isCommittee) {
    return (
      <ClosedCard
        mySignup={null}
        title={phaseTitle ?? "The list is not yet open"}
        detail={phaseDetail ?? "Sign-ups have not opened for this luncheon."}
      />
    );
  }

  if (!isCommittee && !isNextOpenLunch) {
    return (
      <Card className="border-border bg-muted/30">
        <CardContent className="space-y-2 py-5 text-sm text-muted-foreground">
          <p>
            You may consult this luncheon, but names may be added only to the
            next table that is currently open.
          </p>
          {nextOpenHref ? (
            <p>
              <Link
                href={nextOpenHref}
                className="text-foreground underline underline-offset-4 hover:text-primary"
              >
                {nextOpenTitle ?? "The next open luncheon"}
              </Link>
            </p>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  if (phase === "committee" && !isCommittee) {
    return (
      <ClosedCard
        mySignup={null}
        title={phaseTitle ?? "Committee priority"}
        detail={
          phaseDetail ??
          "The committee has first claim on places. The list will open to the membership shortly."
        }
      />
    );
  }

  const willWaitlist = seatsLeft < 1 + guestCount;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add your name</CardTitle>
        {phaseDetail ? (
          <p className="text-sm font-normal text-muted-foreground">
            {phaseDetail}
          </p>
        ) : null}
      </CardHeader>
      <CardContent>
        <form action={signupForm} className="space-y-4">
          {guestsUi ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="guestCount">Guests (max {maxGuests})</Label>
                <Input
                  id="guestCount"
                  name="guestCount"
                  type="number"
                  min={0}
                  max={maxGuests}
                  className="w-24"
                  value={guestCount}
                  onChange={(e) => setGuestCount(Number(e.target.value) || 0)}
                />
                <p className="text-xs text-muted-foreground">
                  Guests occupy seats from the same booking.
                </p>
              </div>
              {guestCount > 0 ? (
                <div className="space-y-2">
                  <Label htmlFor="guestNames">Guest names</Label>
                  <Input
                    id="guestNames"
                    name="guestNames"
                    placeholder="Jane Doe, John Smith"
                  />
                </div>
              ) : null}
            </>
          ) : guestsLater ? (
            <p className="text-xs text-muted-foreground">
              {/* In the members window the header already gives the date. */}
              {phase === "members" ? "Guest places open later." : guestsLaterNote}{" "}
              Add your own name first.
            </p>
          ) : null}
          <FormError message={signupState.error} />
          <Button
            type="submit"
            loading={signupPending}
            variant={willWaitlist ? "outline" : "default"}
            className="w-full sm:w-auto"
          >
            {willWaitlist ? "Join the waitlist" : "Add my name"}
          </Button>
          {willWaitlist ? (
            <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
              The table is full. You will be offered a place (and written to)
              should one become free.
            </p>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
