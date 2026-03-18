# Plan: Kiosk Generalization (practical next steps)

> **Agent instructions**: You are executing this plan independently. Other agents are working on Ansible migration and web dev environment in parallel — coordinate by only reading (not modifying) files in `packages/kiosk-client/`, `packages/kiosk-server/`, and `packages/shared/`. Your output is a research document, not code changes. When implementation is complete and confirmed correct by the user, delete this file.

## Goal

Analyze the current kiosk-client and kiosk-server to identify what's hardcoded to the original Czech pension use case, and produce a concrete plan for generalizing it. **Be practical** — this is about what to change in the actual code, not a brainstorm.

## Current State

The kiosk was built for one Czech pension. The UI is entirely in Czech (hardcoded strings in every `.tsx` file). The data model has domain-specific concepts: "apartments" (could be rooms, units, or any tenant ID), "pastry" (a specific ordering workflow with delivery dates). The `price.ts` module hardcodes Czech formatting (`Kč`, comma decimals).

The product plan targets "small pensions and guesthouses" but the platform could serve other honor-system self-service contexts.

## Research Areas

### 1. Audit all hardcoded Czech strings

Go through **every** `.tsx` file in `kiosk-client/src/` and catalog every user-visible string. There are Czech labels in:
- `App.tsx` — maintenance screen ("Údržba", "Kiosek je dočasně mimo provoz"), inactivity warning ("Neaktivita — resetuji za..."), success messages ("Přidáno:", "Odebráno:"), error messages
- `Confirm.tsx` — button labels ("Přidat", "Odebrat", "Ano", "Ne"), delivery text ("Dodání:"), storno confirmation ("Opravdu stornovat?", "Opravdu odebrat...")
- `BuyerSelect.tsx`, `CategorySelect.tsx`, `ItemSelect.tsx` — screen titles, back labels
- `ScreenHeader.tsx` — any static text
- `PastryCategorySelect.tsx` — pastry-specific labels
- `PastryOrdersOverview.tsx`, `ConsumptionOverview.tsx` — table headers, labels
- `OfflineBanner.tsx` — offline message

Also check `packages/shared/src/validation.ts` for Czech error messages (apartment validation has Czech strings like "Chybí ID", "Neplatné ID", "Duplicitní ID").

Also check `packages/shared/src/pastry.ts` for Czech day names in `getDeliveryDateLabel`.

**Produce a complete inventory**: file, line number, string, English equivalent.

### 2. Research i18n approach

This is a touchscreen kiosk, not a web app with URL-based locale. The string count is small (<100). Options:
- **(a) Simple key-value JSON + React context**: `useTranslation()` hook, no library. Locale files like `en.json`, `cs.json`. Locale comes from kiosk settings (set by building manager via dashboard).
- **(b) react-i18next**: full library with pluralization, ICU message format. Probably overkill.

The kiosk-client currently has zero dependencies beyond React and @kioskkit/shared. Adding a big i18n library is a significant weight increase for a Pi. Recommend an approach.

### 3. Generalize "apartments" concept

The data model uses `apartments` for the buyer entity. In practice this could be: hotel rooms, apartment numbers, family names, employee IDs, club member numbers.

Research what needs to change:
- Database table name (`apartments` → keep or rename?)
- API endpoints (`/api/apartments` → `/api/units`?)
- Shared types (`Apartment` → `Unit`?)
- UI label — configurable via settings ("Apartment", "Room", "Member", etc.)

**Weigh**: rename everything now vs make the label configurable while keeping the internal name `apartments`. The internal name doesn't leak to end users — only the display label matters. Practical recommendation.

### 4. Generalize "pastry" workflow

The pastry ordering system is a generic "pre-order with delivery schedule" capability. The `pastry: boolean` flag on catalog categories could be `preorder: boolean`. The delivery date calculation and day-of-week schedule are already generic — just need renaming.

Map out what this rename touches:
- Types: `PastryConfig` → `PreorderConfig`, `pastry` flag → `preorder`
- DB columns: `pastry` in `catalog_categories`, `pastry_config` table
- API endpoints: `/api/pastry-config` → `/api/preorder-config`
- Route files in kiosk-server
- Client screens: `PastryCategorySelect`, `PastryOrdersOverview`
- Shared utilities: `pastry.ts`, delivery date functions
- Report endpoint: `/api/reports/pastry` → `/api/reports/preorders`

Estimate the blast radius (number of files, lines affected).

### 5. Identify concrete use cases

Based on the architecture (touchscreen + honor system + catalog), what other deployments make sense? For each, note what's the same and what's different:
- Office kitchen / snack bar
- Coworking space amenities
- Holiday rental self-service minibar
- Sports club bar
- Small hotel minibar
- Shared laundry room (token/credit tracking)

This informs which generalizations are worth doing now vs later.

### 6. Currency and locale in the backend

`packages/shared/src/price.ts` hardcodes Czech formatting:
- `parsePrice` handles Czech comma decimals
- `formatPrice` outputs "12,50 Kč"
- `ensureKc` appends " Kč"

Settings should include currency and locale. The `Intl.NumberFormat` API handles most of this natively. Research:
- What changes in `price.ts`
- What changes in display components (`Confirm.tsx`, `ItemSelect.tsx`)
- How the currency/locale setting flows from settings → shared utils → client

### 7. Produce a prioritized changelist

Rank the generalizations by impact × effort. Likely order:
1. **i18n string extraction** — high impact, medium effort (touches every screen but is mechanical)
2. **Configurable buyer/unit label** — low effort, makes the product applicable to non-apartment contexts
3. **Currency/locale** — medium effort, needed for non-Czech markets
4. **pastry → preorder rename** — medium effort, mostly mechanical
5. **Configurable screen flow** — future, don't do now but note what it would take

**For each item**: list every file that changes, what changes in each, and estimated line count. Enough detail that an implementer can execute without ambiguity.

## Output

A concrete plan document (markdown file in `plans/`) with the string inventory, recommended approach for each area, and the prioritized changelist with file-by-file scope.
