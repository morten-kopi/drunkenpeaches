"use client";

import { useId, useState } from "react";
import { UserPlusIcon, XIcon } from "lucide-react";
import type { GuestOption } from "@/lib/types";
import type { GuestEntry } from "@/lib/guests";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const NEW = "__new";

type Slot = {
  key: number;
  /** A guest on file, or NEW for someone typed in. */
  pick: string;
  first_name: string;
  last_name: string;
  email: string;
  dietary_notes: string;
};

function toEntry(s: Slot): GuestEntry {
  return s.pick === NEW
    ? {
        first_name: s.first_name,
        last_name: s.last_name,
        email: s.email,
        dietary_notes: s.dietary_notes || undefined,
      }
    : { id: s.pick };
}

interface GuestPickerProps {
  /** Most guests this form may hold. */
  max: number;
  /** Guests the host has brought before, offered for a quick pick. */
  options: GuestOption[];
  /** Guests on the signup now. */
  initial?: GuestOption[];
  onCountChange?: (count: number) => void;
  /** Name of the hidden field that carries the list as JSON. */
  name?: string;
}

/**
 * The guests on one signup. Each guest is someone the host has brought
 * before, or someone new with a first name, last name and email. A new
 * guest whose email the club already knows is matched to that record, so
 * nobody is entered twice.
 */
export function GuestPicker({
  max,
  options,
  initial = [],
  onCountChange,
  name = "guests",
}: GuestPickerProps) {
  const uid = useId();
  const [slots, setSlots] = useState<Slot[]>(() =>
    initial.map((g, i) => ({
      key: i,
      pick: g.id,
      first_name: "",
      last_name: "",
      email: "",
      dietary_notes: "",
    }))
  );
  const [nextKey, setNextKey] = useState(initial.length);

  const setAll = (next: Slot[]) => {
    setSlots(next);
    if (next.length !== slots.length) onCountChange?.(next.length);
  };

  // Current guests stay pickable even if the options list leaves them out.
  const known = [
    ...options,
    ...initial.filter((g) => !options.some((o) => o.id === g.id)),
  ];

  const update = (key: number, patch: Partial<Slot>) =>
    setAll(slots.map((s) => (s.key === key ? { ...s, ...patch } : s)));

  // A new slot starts as someone new; a previous guest is one pick away.
  const add = () => {
    setAll([
      ...slots,
      { key: nextKey, pick: NEW, first_name: "", last_name: "", email: "", dietary_notes: "" },
    ]);
    setNextKey((k) => k + 1);
  };

  return (
    <div className="space-y-3">
      <input type="hidden" name={name} value={JSON.stringify(slots.map(toEntry))} />

      {slots.map((s, i) => {
        const id = `${uid}-${s.key}`;
        const elsewhere = new Set(slots.filter((o) => o.key !== s.key).map((o) => o.pick));
        const choices = known.filter((g) => !elsewhere.has(g.id));
        const items = [
          ...choices.map((g) => ({ value: g.id, label: g.full_name })),
          { value: NEW, label: "Someone new" },
        ];
        return (
          <div key={s.key} className="space-y-3 rounded-xl border border-border bg-background p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Guest {i + 1}</p>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove guest ${i + 1}`}
                onClick={() => setAll(slots.filter((o) => o.key !== s.key))}
              >
                <XIcon />
              </Button>
            </div>

            {choices.length > 0 ? (
              <Select
                items={items}
                value={s.pick}
                onValueChange={(v) => update(s.key, { pick: String(v ?? NEW) })}
              >
                <SelectTrigger aria-label={`Guest ${i + 1}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {items.map((it) => (
                    <SelectItem key={it.value} value={it.value}>
                      {it.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}

            {s.pick === NEW ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`${id}-first`}>First name</Label>
                  <Input
                    id={`${id}-first`}
                    required
                    autoComplete="off"
                    value={s.first_name}
                    onChange={(e) => update(s.key, { first_name: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${id}-last`}>Last name</Label>
                  <Input
                    id={`${id}-last`}
                    required
                    autoComplete="off"
                    value={s.last_name}
                    onChange={(e) => update(s.key, { last_name: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor={`${id}-email`}>Email</Label>
                  <Input
                    id={`${id}-email`}
                    type="email"
                    required
                    autoComplete="off"
                    value={s.email}
                    onChange={(e) => update(s.key, { email: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor={`${id}-diet`}>
                    Dietary notes <span className="font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <Input
                    id={`${id}-diet`}
                    autoComplete="off"
                    value={s.dietary_notes}
                    onChange={(e) => update(s.key, { dietary_notes: e.target.value })}
                  />
                </div>
              </div>
            ) : null}
          </div>
        );
      })}

      {slots.length < max ? (
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <UserPlusIcon />
          {slots.length === 0 ? "Add a guest" : "Add another guest"}
        </Button>
      ) : null}
    </div>
  );
}
