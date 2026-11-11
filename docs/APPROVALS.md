# Approving purchases and sales

Every purchase and sale carries a `status`. A normal admin's entry starts as `pending`; a
super admin's own entry is approved as it is saved, because the person who would approve it
is the one entering it.

| Status | Meaning | Counts towards figures |
|---|---|---|
| `pending` | entered, not yet reviewed | **yes** |
| `approved` | reviewed and accepted | yes |
| `rejected` | reviewed and refused | **no** |

## Rejecting keeps the record

Rejecting used to delete the row. It now sets `status: 'rejected'` and records `rejectedBy`.

The record stays on the books. That matters for a ledger: a deleted row leaves no trace that
anything was ever entered, so a disputed load simply vanishes and nobody can later say
whether it was refused or never recorded. A rejected row answers the question.

Rejection is reversible — approving a rejected record restores it, and the route clears the
other party's name so a record can never claim to be both approved and rejected. Removing it
for good is a separate, explicit delete, available to a super admin from the Rejected filter.

Only a super admin can approve, reject or delete.

## What rejected records are excluded from

A rejected purchase never happened, so it must not reach the numbers:

- **P/L** — revenue and cost of purchases
- **Stock** — opening/closing movement and the purchases & sales report
- **The tab's own tiles**, whenever the status filter is narrowing the list

Records written before rejection existed have no `status` field at all. Everything treats a
missing status as `pending`, which is what it was.

## Pending still counts

A pending purchase counts towards P/L and Stock, exactly as it did before this change.
That is worth knowing rather than assuming: profit shown today includes entries nobody has
reviewed. Excluding them is a one-line change to `counted()` in `PLTab.jsx` and
`StockTab.jsx`, but it would move the reported figures, so it is left as a decision rather
than made quietly.

The **Awaiting approval** tile counts pending records across every period, not the one on
screen — a date filter is exactly what would hide something waiting since last week.
Clicking it switches the list to Pending across All Time.

## Approving in bulk

The **Approve all** button sits on the Awaiting-approval tile and acts on the pending
records **in the list as filtered**, never on the all-time tile count — so the set being
approved is always the set on screen. The confirmation dialog names the count, the combined
value, the filters in effect and the first few rows, because a period left set last week is
exactly what would otherwise go unnoticed.

`approve-many` takes explicit ids rather than a filter: the server changes exactly the rows
the caller displayed, so a record added between loading the page and pressing the button
cannot be swept up. Only rows still `pending` move, so a record another super admin decided
in the meantime keeps their decision; the response reports `approved` against `requested`
and the tab refetches rather than guessing. Batches are capped at 500.

## PDF reports

Both tabs export two reports, each honouring the current period and filters:

- **PDF** — the detail list, one row per record, now with a Status column. Rejected rows
  print in red: on paper there is no badge colour, and a rejected row must not read as a
  purchase that happened.
- **Item PDF** — every item in the catalogue over the period, **green where it was bought
  or sold at least once and grey where it was not**. Listing only the items that moved
  cannot answer "what is sitting untouched", which is what this report is for.

The item-wise report excludes rejected records, matching P/L and Stock. The one exception is
filtering the tab to Rejected, which is an explicit request to see exactly those; the
subtitle says which of the two you are holding.

## API

| Method | Path | Who |
|---|---|---|
| PATCH | `/api/transactions/:id/approve` · `/api/sales/:id/approve` | super admin |
| PATCH | `/api/transactions/:id/reject` · `/api/sales/:id/reject` | super admin |
| DELETE | `/api/transactions/:id` · `/api/sales/:id` | super admin |

Approve and reject return the updated record with the supplier or customer populated, so the
list can swap the row in without refetching.
