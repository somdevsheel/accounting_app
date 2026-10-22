# Online/Offline Edition — Roadmap (planning only, nothing built yet)

This is the plan for a **new, separate project** — a version of Accrued that works both
online (hosted, server-backed, accessible from a browser) and offline (local-first, like
today), with GST and ITR e-filing built in. It is scoped to live **alongside** the existing
offline app in this same repo, as its own top-level folder — nothing under `backend/`,
`frontend/`, or `electron/` is touched by this plan. Those stay exactly as they are today: a
fully offline, single-user/local-network desktop product with no server dependency.

No code has been written for this yet. This document exists so the shape of the project is
written down before any of it starts.

## 1. Why a separate project, not a mode-flag on the existing one

The offline app's entire design rests on one machine, one SQLite file, no network calls, no
accounts. Bolting "also sync to a server" onto that would mean touching almost every request
path and could easily destabilize the product that already works and is already shipped to
you. Instead:

- **`backend/`, `frontend/`, `electron/`** — untouched. Stays the standalone desktop product.
- **New folder, e.g. `cloud/`** — the online/offline-hybrid product. Reuses the accounting
  *logic* (double-entry rules, report calculations) by copying/adapting it, not by importing
  live from `backend/`, so a change to one can never silently break the other.

They'd be two related but independently releasable products, similar to how "Tally" and
"Tally on Cloud" or "QuickBooks Desktop" and "QuickBooks Online" are related but separate
codebases under one brand.

## 2. What "online + offline both" actually means

Two different things get called "offline mode" and it matters which one this is:

- **(a) Fully offline forever, no server** — what the existing app already does.
- **(b) Offline-*capable*: works without internet, syncs when internet returns** — what's
  being asked for here. This is a much bigger engineering problem than (a), because now the
  same company's data can exist on two machines (or a browser + a desktop) and has to be
  reconciled.

This roadmap assumes **(b)**: a local cache/store that keeps working with no connection, plus
a background sync process that reconciles with a central server whenever a connection is
available.

### The hard part: sync and conflict resolution

- Every syncable record needs a way to detect "did this change since we last synced" —
  typically a `updated_at` + `version` counter per row, and edits/deletes become soft
  (`deleted_at`) rather than destructive, so a delete on one device can be reconciled against
  an edit on another instead of just disappearing silently.
- **Voucher/invoice numbering is the single biggest risk area.** This project already hit a
  real numbering-collision bug in the offline app (see `CHANGELOG.md`) from something as
  simple as one field changing after creation on *one* machine. With two devices creating
  entries offline at the same time, naive numbering will collide constantly. This needs a
  real design decision up front — likely either (i) numbers are only ever finalized by the
  server once a device is back online, with a clearly-labeled "pending sync" number shown
  locally until then, or (ii) each device is issued a reserved numeric range. Do not skip this
  — it's the one part of the previous sync-less design that breaks hardest under sync.
- Conflict policy needs to be explicit per entity type (e.g. "last write wins" may be fine for
  a draft invoice, but is not acceptable for a posted journal entry — those should probably be
  immutable once synced, with corrections done via a reversing entry, which is standard
  accounting practice anyway).

## 3. What "online" adds beyond sync

- **Multi-tenancy** — many companies' data on shared infrastructure. Likely a shared Postgres
  database with a `tenant_id`/`company_id` on every table, replacing SQLite for the server
  side (the offline client can still use SQLite locally).
- **Real accounts** — signup, email verification, password reset, session security, on top of
  what the existing local multi-user auth already has (which was built for a trusted single
  machine, not the internet).
- **Hosting & ops** — a real server, managed database, backups, monitoring, uptime
  responsibility.
- **Security bar goes up** — encrypting financial data at rest, audit logging, per-tenant data
  isolation guarantees, a real incident-response plan. This is now other people's financial
  data on infrastructure you operate, not a file on someone's own laptop.

## 4. GST filing

- **Returns in scope**: GSTR-1 (outward supplies) and GSTR-3B (summary return) first;
  GSTR-2A/2B reconciliation (matching purchase-side input tax credit) as a fast-follow.
- **What the app can do itself**: generate the correct return data from the ledger — this is
  ordinary accounting-engine work, an extension of the tax summary logic that already exists.
- **What the app cannot do alone**: actually transmit a return to the government. Direct API
  access to GSTN is not open to arbitrary apps — it requires becoming a registered **GSP (GST
  Suvidha Provider)** or integrating through an existing GSP (e.g. ClearTax, MasterGST, and
  similar already-licensed providers offer APIs for exactly this). **This is a business/legal
  registration step, not just an engineering task**, and needs to be resourced/decided
  separately from writing code.
- Realistic near-term scope: generate the GSTN-prescribed JSON in the exact format their
  offline utility accepts, so a user can download it and upload it to the government portal
  themselves — full automatic filing depends on the GSP decision above.
- Needs GSTIN checksum validation, HSN/SAC code fields on items, and place-of-supply logic to
  correctly split IGST vs CGST+SGST — none of which the current schema has yet.

## 5. ITR filing

- **Forms in scope depend on entity type** already recorded in Company setup — sole
  proprietors typically need ITR-3/ITR-4, partnerships ITR-5, companies ITR-6. These are
  materially different forms; scope which one(s) first rather than "ITR filing" generically.
- Requires an **Income Tax Act depreciation** calculation (different rates/method than the
  book depreciation the accounting engine already computes) and slab/presumptive-taxation
  computation logic — new domain logic, not reuse of existing reports.
- Same regulatory ceiling as GST: actually transmitting a return to the Income Tax Department
  generally requires **ERI (e-Return Intermediary)** registration, or integrating through a
  provider that already holds it. Likely near-term scope is again "generate the correct
  return JSON/computation for the user to file themselves," with direct e-filing as a later
  phase contingent on that registration decision.

## 6. Proposed phasing

| Phase | Scope | Depends on |
|---|---|---|
| 0 | This roadmap, finalized; decide sync model and numbering strategy | — |
| 1 | Server skeleton: multi-tenant API + Postgres, real accounts/auth, deploy pipeline | Phase 0 |
| 2 | Port accounting engine + UI to run against the hosted server (pure online mode, no offline yet) | Phase 1 |
| 3 | Offline-capable client: local store + background sync + conflict resolution | Phase 2 |
| 4 | GST return generation (download-and-file-yourself) | Phase 2 |
| 5 | ITR return generation (download-and-file-yourself), form(s) TBD | Phase 2 |
| 6 | GSP/ERI integration for direct e-filing | Business decision + Phases 4/5 |

Phases 4 and 5 don't strictly need offline/sync (Phase 3) to be done first — they can start
as soon as there's a working hosted engine (end of Phase 2), if filing is the priority over
offline support.

## 7. Open decisions needed before Phase 1 starts

- Priority order: is offline-sync (Phase 3) or GST/ITR filing (Phases 4-5) more urgent? They
  can be built in either order once Phase 2 is done.
- Hosting provider/budget owner for the server, database, and backups.
- Whether direct government e-filing (GSP/ERI) is worth pursuing vs. always leaving the last
  step ("upload this file to the portal") to the user.
- Pricing/billing model, if this is meant to be sold rather than run for one company.

## 8. Explicitly not happening as part of this

- No changes to `backend/`, `frontend/`, or `electron/`.
- No new folders or code yet — this file only, per instruction.
