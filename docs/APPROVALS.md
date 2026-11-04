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

## API

| Method | Path | Who |
|---|---|---|
| PATCH | `/api/transactions/:id/approve` · `/api/sales/:id/approve` | super admin |
| PATCH | `/api/transactions/:id/reject` · `/api/sales/:id/reject` | super admin |
| DELETE | `/api/transactions/:id` · `/api/sales/:id` | super admin |

Approve and reject return the updated record with the supplier or customer populated, so the
list can swap the row in without refetching.
