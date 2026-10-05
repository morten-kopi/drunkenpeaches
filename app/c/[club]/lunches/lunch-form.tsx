"use client";

import { useActionState, useRef, useState } from "react";
import { InfoIcon, PlusIcon } from "lucide-react";
import {
  createLunchAction,
  updateLunchAction,
  type FormState,
} from "@/app/actions/lunches";
import type { Club, Lunch, Venue } from "@/lib/types";
import {
  computePhaseTimestamps,
  fromDatetimeLocalValue,
  toDatetimeLocalValue,
} from "@/lib/signup-phases";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormError } from "@/components/form-error";
import { AddVenueDialog } from "../venues/add-venue-dialog";

type VenueOption = Pick<Venue, "id" | "name" | "default_capacity">;

interface LunchFormProps {
  slug: string;
  club: Club;
  venues: VenueOption[];
  lunch?: Lunch;
  /** Preselected venue for a new lunch (from "Book a lunch here"). */
  initialVenueId?: string;
}

const NO_VENUE = "__none__";
const CREATE_VENUE = "__create__";

const GUEST_ITEMS = [
  { value: "yes", label: "Guests allowed" },
  { value: "no", label: "No guests" },
];

function phasesFromDate(club: Club, lunchDate: string, startTime: string) {
  if (!lunchDate) {
    return { opens: "", members: "", guests: "", cutoff: "" };
  }
  const p = computePhaseTimestamps({
    lunchDate,
    startTime: startTime || "12:30",
    club,
  });
  return {
    opens: toDatetimeLocalValue(p.signup_opens_at, club.timezone),
    members: toDatetimeLocalValue(p.members_open_at, club.timezone),
    guests: toDatetimeLocalValue(p.guests_open_at, club.timezone),
    cutoff: toDatetimeLocalValue(p.signup_cutoff_at, club.timezone),
  };
}

function phasesFromOpens(
  club: Club,
  lunchDate: string,
  startTime: string,
  opensLocal: string,
  cutoffLocal: string
) {
  if (!lunchDate || !opensLocal) return null;
  const opensIso = fromDatetimeLocalValue(opensLocal, club.timezone);
  if (!opensIso) return null;
  const p = computePhaseTimestamps({
    lunchDate,
    startTime: startTime || "12:30",
    club,
    signupOpensAt: opensIso,
    cutoffAt: cutoffLocal
      ? fromDatetimeLocalValue(cutoffLocal, club.timezone)
      : null,
  });
  return {
    members: toDatetimeLocalValue(p.members_open_at, club.timezone),
    guests: toDatetimeLocalValue(p.guests_open_at, club.timezone),
  };
}

export function LunchForm({
  slug,
  club,
  venues,
  lunch,
  initialVenueId,
}: LunchFormProps) {
  const action = lunch
    ? updateLunchAction.bind(null, slug, lunch.id)
    : createLunchAction.bind(null, slug);
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    {}
  );

  // No default: each lunch decides. A lunch saved before that rule shows blank.
  const [guestsMode, setGuestsMode] = useState<string | null>(
    lunch?.guests_allowed == null ? null : lunch.guests_allowed ? "yes" : "no"
  );

  const [venueOptions, setVenueOptions] = useState(venues);
  const [venueId, setVenueId] = useState(
    lunch?.venue_id ??
      (venues.some((v) => v.id === initialVenueId) ? initialVenueId! : NO_VENUE)
  );
  const [createVenueOpen, setCreateVenueOpen] = useState(false);
  const venueItems = [
    { value: NO_VENUE, label: "No venue yet" },
    ...venueOptions.map((v) => ({ value: v.id, label: v.name })),
    { value: CREATE_VENUE, label: "Create venue" },
  ];

  // Capacity follows the chosen venue until the committee types its own.
  const [capacity, setCapacity] = useState(
    String(
      lunch?.capacity ??
        venues.find((v) => v.id === venueId)?.default_capacity ??
        ""
    )
  );
  const capacityTyped = useRef(false);

  function chooseVenue(venue: VenueOption | undefined) {
    setVenueId(venue?.id ?? NO_VENUE);
    if (!lunch && !capacityTyped.current) {
      setCapacity(String(venue?.default_capacity ?? ""));
    }
  }

  function onVenueCreated(venue: VenueOption) {
    setVenueOptions((prev) =>
      [...prev.filter((v) => v.id !== venue.id), venue].sort((a, b) =>
        a.name.localeCompare(b.name)
      )
    );
    chooseVenue(venue);
  }

  const [lunchDate, setLunchDate] = useState(lunch?.lunch_date ?? "");
  const [startTime, setStartTime] = useState(
    lunch?.start_time?.slice(0, 5) ?? "12:30"
  );

  const initialPhases = lunch
    ? {
        opens: toDatetimeLocalValue(lunch.signup_opens_at, club.timezone),
        members: toDatetimeLocalValue(lunch.members_open_at, club.timezone),
        guests: toDatetimeLocalValue(lunch.guests_open_at, club.timezone),
        cutoff: toDatetimeLocalValue(lunch.signup_cutoff_at, club.timezone),
      }
    : phasesFromDate(club, lunchDate, startTime);

  const [opensAt, setOpensAt] = useState(initialPhases.opens);
  const [membersOpenAt, setMembersOpenAt] = useState(initialPhases.members);
  const [guestsOpenAt, setGuestsOpenAt] = useState(initialPhases.guests);
  const [cutoffAt, setCutoffAt] = useState(initialPhases.cutoff);

  function applyFromDate(nextDate: string, nextTime: string) {
    const next = phasesFromDate(club, nextDate, nextTime);
    setOpensAt(next.opens);
    setMembersOpenAt(next.members);
    setGuestsOpenAt(next.guests);
    setCutoffAt(next.cutoff);
  }

  function onLunchDateChange(value: string) {
    setLunchDate(value);
    applyFromDate(value, startTime);
  }

  function onStartTimeChange(value: string) {
    setStartTime(value);
    applyFromDate(lunchDate, value);
  }

  function onOpensChange(value: string) {
    setOpensAt(value);
    const shifted = phasesFromOpens(club, lunchDate, startTime, value, cutoffAt);
    if (shifted) {
      setMembersOpenAt(shifted.members);
      setGuestsOpenAt(shifted.guests);
    }
  }

  return (
    <>
      <form action={formAction} className="max-w-2xl space-y-6">
        <input
          type="hidden"
          name="venueId"
          value={venueId === NO_VENUE ? "" : venueId}
        />

        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            name="title"
            defaultValue={lunch?.title ?? ""}
            placeholder="June lunch — last Friday"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="venue">Venue</Label>
          <Select
            items={venueItems}
            value={venueId}
            onValueChange={(v) => {
              // "Create venue" opens the dialog; the pick waits for the new venue.
              if (v === CREATE_VENUE) {
                setCreateVenueOpen(true);
                return;
              }
              chooseVenue(venueOptions.find((o) => o.id === v));
            }}
          >
            <SelectTrigger id="venue" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_VENUE}>No venue yet</SelectItem>
              {venueOptions.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name}
                </SelectItem>
              ))}
              <SelectSeparator />
              <SelectItem value={CREATE_VENUE}>
                <PlusIcon />
                Create venue
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="lunchDate">Date</Label>
            <Input
              id="lunchDate"
              name="lunchDate"
              type="date"
              value={lunchDate}
              onChange={(e) => onLunchDateChange(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="startTime">Time</Label>
            <Input
              id="startTime"
              name="startTime"
              type="time"
              value={startTime}
              onChange={(e) => onStartTimeChange(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="capacity">Capacity</Label>
          <Input
            id="capacity"
            name="capacity"
            type="number"
            min={0}
            value={capacity}
            onChange={(e) => {
              capacityTyped.current = true;
              setCapacity(e.target.value);
            }}
            disabled={!!lunch}
            required={!lunch}
          />
          {lunch ? (
            <p className="flex items-start gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
              Capacity is changed from the lunch page so the waitlist promotes
              correctly.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              The fixed number of seats from your restaurant booking — sign-ups
              never change it.
            </p>
          )}
        </div>

        <div className="space-y-3">
          <div>
            <Label>Sign-up windows</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Prefills from club defaults (committee{" "}
              {club.committee_priority_days}d, members {club.members_only_days}d,
              guests {club.guests_phase_days}d, cutoff {club.signup_cutoff_days}d
              before the lunch). Changing the date or the open time recalculates
              the later windows. You may override any field. Times are in{" "}
              {club.timezone}.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="signupOpensAt">Sign-ups open</Label>
              <Input
                id="signupOpensAt"
                name="signupOpensAt"
                type="datetime-local"
                value={opensAt}
                onChange={(e) => onOpensChange(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="membersOpenAt">Members open</Label>
              <Input
                id="membersOpenAt"
                name="membersOpenAt"
                type="datetime-local"
                value={membersOpenAt}
                onChange={(e) => setMembersOpenAt(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="guestsOpenAt">Guests open</Label>
              <Input
                id="guestsOpenAt"
                name="guestsOpenAt"
                type="datetime-local"
                value={guestsOpenAt}
                onChange={(e) => setGuestsOpenAt(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cutoffAt">Sign-up cutoff</Label>
              <Input
                id="cutoffAt"
                name="cutoffAt"
                type="datetime-local"
                value={cutoffAt}
                onChange={(e) => setCutoffAt(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!lunchDate}
              onClick={() => applyFromDate(lunchDate, startTime)}
            >
              Recalculate from date
            </Button>
            <p className="text-xs text-muted-foreground">
              After the cutoff, sign-ups and cancellations lock.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="guestsMode">Guests</Label>
          <Select
            name="guestsMode"
            required
            items={GUEST_ITEMS}
            value={guestsMode}
            onValueChange={(v) => setGuestsMode(v)}
          >
            <SelectTrigger id="guestsMode" className="w-full">
              <SelectValue placeholder="Decide for this lunch" />
            </SelectTrigger>
            <SelectContent>
              {GUEST_ITEMS.map((g) => (
                <SelectItem key={g.value} value={g.value}>
                  {g.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Every lunch needs a decision. Guests can be added from the
            guests-open time above, committee included.
          </p>
          {guestsMode === "yes" ? (
            <div className="space-y-2 pt-2 duration-(--duration-default) ease-(--ease-out-quint) animate-in fade-in-0 slide-in-from-top-1">
              <Label htmlFor="maxGuests">Max guests per member</Label>
              <Input
                id="maxGuests"
                name="maxGuests"
                type="number"
                min={1}
                max={10}
                className="w-24"
                defaultValue={lunch?.max_guests_per_member || 1}
                required
              />
            </div>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="notes">Notes (optional)</Label>
          <Textarea
            id="notes"
            name="notes"
            rows={3}
            defaultValue={lunch?.notes ?? ""}
            placeholder="Menu, dress code, parking…"
          />
        </div>

        <FormError message={state.error} />
        <div className="flex flex-col gap-2">
          <Button type="submit" loading={pending} className="w-fit">
            {lunch ? "Save changes" : "Create lunch (as draft)"}
          </Button>
          {!lunch ? (
            <p className="text-xs text-muted-foreground">
              Lunches start as hidden drafts — release it to members from the
              lunch page when you&apos;re ready.
            </p>
          ) : null}
        </div>
      </form>
      {/* Outside the lunch form so the two forms never nest. */}
      <AddVenueDialog
        slug={slug}
        open={createVenueOpen}
        onOpenChange={setCreateVenueOpen}
        onCreated={onVenueCreated}
      />
    </>
  );
}
