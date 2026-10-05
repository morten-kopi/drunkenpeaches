#!/usr/bin/env python3
"""
Import a club's member list from the committee's spreadsheet, with an account
and a temporary password for each member.

    SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... \\
      python3 scripts/import-members.py <club-slug> <members.xlsx> [--apply]

Without --apply it prints what would change and writes nothing. Needs
openpyxl (pip install openpyxl). Never commit the spreadsheet or the password
file: this repo is public.

Expected columns, found by header name on any row: First name, Last name,
Function, e-Mail, Phone, Member since, Comments membership.

- New members get an account with a temporary password of three words
  (e.g. claret-oyster-lantern) and are active straight away. Nobody is
  emailed. Passwords go to <club-slug>-temporary-passwords.csv next to the
  spreadsheet (readable by you only) and are never printed. Each member must
  choose their own password at first sign-in.
- A member whose email already has an account elsewhere is linked to it and
  keeps their own password.
- Anyone with a Function gets the committee role, unless the function marks a
  former office ("ex ...", "past ...", "former ..."). A Function of exactly
  "Wine Master" also sets the Wine Master flag.
- Members already on the roster, matched by email, get names, phone,
  function, comments and member-since refreshed wherever the sheet has a
  value. Their role, Wine Master flag, status and account are never touched.
- Member since is a year and is stored as 1 January of that year. Anything
  other than a plain year (e.g. "2011-2025") is also kept in comments.
- Phone numbers are 8-digit Singapore numbers, stored as "+65 9123 4567".
  Anything else is kept as written.

Safe to re-run: members who already have an account are skipped.
"""

import csv
import json
import os
import re
import secrets
import sys
import urllib.error
import urllib.request
from datetime import date

import openpyxl

HEADERS = {
    "first name": "first_name",
    "last name": "last_name",
    "function": "function",
    "e-mail": "email",
    "email": "email",
    "phone": "phone",
    "member since": "since",
    "comments membership": "comments",
    "comments": "comments",
}
FORMER_OFFICE = re.compile(r"^(ex|past|former)\b", re.IGNORECASE)
REFRESHED = ["first_name", "last_name", "phone", "function", "comments", "joined_on"]

# 256 words, so three of them give about 16.7 million combinations.
WORDS = """
acacia acorn almond alpine amber anchor anise apple apricot arbor aspen autumn
avocado badger bagel bamboo barley barrel basil bay beacon beech beetroot berry
birch biscuit bistro blossom bluebell bonfire bottle bouquet bramble brandy
breeze brioche brook bucket butter cabin cactus camel candle canoe canvas canyon
caper caramel carrot cashew castle cedar celery cellar chalk cheddar cherry
chestnut chicory chive cider cinder cinnamon citrus clam claret clover cobalt
cobble cocoa comet compass copper coral cotton cove crane crater cricket crown
crumble crystal cumin currant custard cypress daisy damson dawn decanter delta
dill dolphin dumpling dune eagle elder ember endive falcon feather fennel fern
fiddle fig flannel flint forest fossil fox frost garden garlic garnet gherkin
ginger glacier glade goose granite grape gravel grove harbor harp harvest hazel
heather heron herring hickory honey horizon iris island ivory jasmine juniper
kale kettle kiwi lagoon lantern larch laurel leek lemon lilac lime linen lobster
lotus mackerel magnet mallow mango maple marble mead meadow melon merlot mint
mirror mocha morel moss muffin mussel nectar nougat nutmeg oak oat olive onion
orange orchard oregano otter paddle pantry paprika parsley parsnip peach pear
pebble pecan pepper pewter piano pickle pine plover plum pocket poppy porter
pumpkin quail quartz quince radish raisin raven reef rhubarb ribbon risotto
river robin rocket rose rosemary rye saffron sage salmon sardine satin scarlet
scone shallot shell shrimp silver slate sorbet sorrel spice spruce squash stone
summit sunset swallow tannin tarragon teapot thistle thyme timber toast topaz
truffle tulip tundra turnip valley velvet walnut willow winter yarrow zest
""".split()


def text(value):
    """Collapse whitespace and drop stray trailing commas; empty becomes None."""
    if value is None:
        return None
    s = re.sub(r"\s+", " ", str(value)).strip(" ,")
    return s or None


def phone(value):
    if value is None:
        return None
    raw = str(int(value)) if isinstance(value, (int, float)) else str(value).strip()
    digits = re.sub(r"\D", "", raw)
    if len(digits) == 10 and digits.startswith("65"):
        digits = digits[2:]
    if len(digits) == 8:
        return f"+65 {digits[:4]} {digits[4:]}"
    return raw or None


def member_since(value):
    """Returns (joined_on, note for comments)."""
    if value is None:
        return None, None
    s = str(int(value)) if isinstance(value, (int, float)) else text(value)
    if re.fullmatch(r"\d{4}", s):
        return f"{s}-01-01", None
    year = re.match(r"\d{4}", s)
    if year:
        return f"{year.group(0)}-01-01", f"Member {s}"
    return None, f"Member since {s}"


def temporary_password():
    return "-".join(secrets.choice(WORDS) for _ in range(3))


def read_sheet(path):
    ws = openpyxl.load_workbook(path, read_only=True, data_only=True).active
    columns = None
    rows = []
    for cells in ws.iter_rows(values_only=True):
        if columns is None:
            keys = [HEADERS.get((text(c) or "").lower()) for c in cells]
            if "email" in keys:
                columns = keys
            continue
        raw = {k: v for k, v in zip(columns, cells) if k}
        email = (text(raw.get("email")) or "").lower()
        if not email:
            continue
        joined_on, since_note = member_since(raw.get("since"))
        function = text(raw.get("function"))
        comments = "; ".join(filter(None, [since_note, text(raw.get("comments"))]))
        rows.append({
            "email": email,
            "first_name": text(raw.get("first_name")) or "",
            "last_name": text(raw.get("last_name")) or "",
            "phone": phone(raw.get("phone")),
            "function": function,
            "comments": comments or None,
            "joined_on": joined_on,
            "role": "committee" if function and not FORMER_OFFICE.match(function) else "member",
            "wine_master": (function or "").lower() == "wine master",
        })
    if columns is None:
        sys.exit("No header row with an e-Mail column found.")
    seen = set()
    for r in rows:
        if r["email"] in seen:
            sys.exit(f"{r['email']} appears twice in the sheet.")
        seen.add(r["email"])
    return rows


def api(method, path, body=None, prefer="return=minimal"):
    url = os.environ["SUPABASE_URL"].rstrip("/") + "/" + path
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    req = urllib.request.Request(
        url,
        method=method,
        data=None if body is None else json.dumps(body).encode(),
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": prefer,
        },
    )
    try:
        with urllib.request.urlopen(req) as res:
            payload = res.read()
    except urllib.error.HTTPError as e:
        sys.exit(f"{method} {path} failed ({e.code}): {e.read().decode()}")
    return json.loads(payload) if payload else None


def auth_users_by_email():
    users, page = {}, 1
    while True:
        batch = api("GET", f"auth/v1/admin/users?page={page}&per_page=1000")["users"]
        users.update({u["email"].lower(): u for u in batch if u.get("email")})
        if len(batch) < 1000:
            return users
        page += 1


def password_file(path):
    """Append-only, owner-only CSV so a re-run never loses earlier passwords."""
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
    f = os.fdopen(fd, "a", newline="")
    writer = csv.writer(f)
    if f.tell() == 0:
        writer.writerow(["first_name", "last_name", "email", "temporary_password"])
    return f, writer


def main():
    args = [a for a in sys.argv[1:] if a != "--apply"]
    apply = "--apply" in sys.argv[1:]
    if len(args) != 2:
        sys.exit(__doc__)
    slug, path = args
    passwords_path = os.path.join(
        os.path.dirname(os.path.abspath(path)), f"{slug}-temporary-passwords.csv"
    )

    clubs = api("GET", f"rest/v1/clubs?slug=eq.{slug}&select=id,name")
    if not clubs:
        sys.exit(f"No club with slug {slug}.")
    club = clubs[0]
    existing = {
        m["email"].lower(): m
        for m in api("GET", f"rest/v1/memberships?club_id=eq.{club['id']}&select=*")
    }
    if apply and existing and "first_name" not in next(iter(existing.values())):
        sys.exit("memberships has no first_name yet. Push migration 00005 first.")
    auth_users = auth_users_by_email()

    inserts, updates = [], []
    rows = read_sheet(path)
    for r in rows:
        current = existing.get(r["email"])
        if current is None:
            inserts.append(r)
            continue
        changes = {
            k: r[k]
            for k in REFRESHED
            if r[k] is not None and r[k] != current.get(k)
        }
        if changes:
            updates.append((current, changes))

    # Members still waiting for an account: new rows, and pending rows from
    # an earlier run that stopped part way.
    needs_account = [
        r for r in rows
        if r["email"] not in existing
        or (existing[r["email"]]["user_id"] is None and existing[r["email"]]["status"] == "invited")
    ]
    to_link = [r for r in needs_account if r["email"] in auth_users]
    to_create = [r for r in needs_account if r["email"] not in auth_users]

    print(f"{club['name']}: {len(inserts)} to add, {len(updates)} to update\n")
    for r in inserts:
        flags = r["role"] + (", Wine Master" if r["wine_master"] else "")
        extra = ", ".join(
            f"{k}: {r[k]}" for k in ("function", "comments", "phone", "joined_on") if r[k]
        )
        print(f"  add     {r['first_name']} {r['last_name']} <{r['email']}> [{flags}] {extra}")
    for current, changes in updates:
        print(f"  update  {current['email']} (role stays {current['role']}, status {current['status']})")
        for k, v in changes.items():
            print(f"            {k}: {current.get(k)!r} -> {v!r}")
    for r in to_link:
        print(f"  link    {r['email']} to the account that already exists (keeps its password)")
    print(f"\n  committee: {sum(r['role'] == 'committee' for r in inserts)} of the new members")
    print(f"  accounts: {len(to_create)} to create, {len(to_link)} to link")
    print(f"  temporary passwords go to {passwords_path}")

    if not apply:
        print("\nDry run. Nothing written. Re-run with --apply to write.")
        return

    membership_ids = {m["email"].lower(): m["id"] for m in existing.values()}
    if inserts:
        today = date.today().isoformat()
        created = api(
            "POST",
            "rest/v1/memberships?select=id,email",
            [
                {**r, "club_id": club["id"], "status": "invited", "joined_on": r["joined_on"] or today}
                for r in inserts
            ],
            prefer="return=representation",
        )
        membership_ids.update({m["email"]: m["id"] for m in created})
    for current, changes in updates:
        api("PATCH", f"rest/v1/memberships?id=eq.{current['id']}", changes)

    for r in to_link:
        api(
            "PATCH",
            f"rest/v1/memberships?id=eq.{membership_ids[r['email']]}",
            {"user_id": auth_users[r["email"]]["id"], "status": "active"},
        )

    f, writer = password_file(passwords_path)
    with f:
        for r in to_create:
            password = temporary_password()
            user = api("POST", "auth/v1/admin/users", {
                "email": r["email"],
                "password": password,
                "email_confirm": True,
                "app_metadata": {"must_change_password": True},
            })
            # Saved before the membership is touched, so a failure below
            # never leaves an account whose password nobody has.
            writer.writerow([r["first_name"], r["last_name"], r["email"], password])
            f.flush()
            api(
                "PATCH",
                f"rest/v1/memberships?id=eq.{membership_ids[r['email']]}",
                {"user_id": user["id"], "status": "active"},
            )

    print(
        f"\nWritten: {len(inserts)} added, {len(updates)} updated, "
        f"{len(to_create)} accounts created, {len(to_link)} linked. No emails sent."
    )
    if to_create:
        print(f"Temporary passwords: {passwords_path}")


if __name__ == "__main__":
    main()
