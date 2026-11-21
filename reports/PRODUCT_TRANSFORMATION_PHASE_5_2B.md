# Product transformation: planning workspace

## Product changes

The primary navigation now has four destinations: **Ringkasan**, **Jelajahi Ruas**, **Usulan & Skenario**, and **Data & Metode**. Road inventory and map views share search and filters, retain the selected road context, and expose shortlist actions from the dashboard, list, map, and road detail.

Ranking groups are presented as relative rank intervals (1–35, 36–70, 71–105, and 106–350). Road summaries separate physical condition from model rank, identify the largest score contributions, and state that a rank is not a measure of urgency or an authorization to fund work. The default policy is identified as a model reference; its approval status is not recorded.

The scenario workspace keeps named weight scenarios and proposal drafts in browser storage. A draft can retain a road shortlist, per-road reason or deferral, evidence captured when the road was added, a planning period, and optional manually entered decision outcome/date/note. Repeated saves update the same draft. Changing year keeps custom weights visible as an unsaved scenario, while the saved scenario remains tied to its original year. Routes and page reloads restore the active local context.

Sensitivity results are recomputed deterministically for four visible configurations: the configured baseline, current scenario, damage-focused preset, and provincial-connection preset. Results show rank ranges and appearances among the first 35 places; they are explicitly not described as probabilities.

The review brief is a print-friendly in-page document that can be printed or saved as PDF by the browser. It includes the chosen planning period (or says it has not been set), preparation date, model and scenario, per-road ranking context, physical-condition breakdown and source filename, reasons, major score contributions, and any recorded outcome. It states when the source publication date is unavailable and distinguishes saved draft notes from formal decisions.

## Context and evidence limits

- **Audit 2024** uses the historical ranking context. The road-condition profile remains the available 2025 observation and is labeled separately in the app and brief.
- Saved scenarios, shortlists, and proposal drafts use `localStorage` in the current browser. They do not sync across users, devices, or browsers and do not provide an institutional shared record.
- Decision outcomes, dates, and notes are user-entered fields. The app does not infer or fabricate an official decision or intervention history.
- Model ratification is not documented in the application. Operational inputs include source vintages that may be older than the 2025 condition profile; the brief calls for checking source currency and field evidence.
- Internal route links preserve year, model, filters, selected road, and saved local scenario when available. A scenario identifier in a URL only resolves in a browser that has that scenario saved.

## Verification

`npm run test:all` passed against a separate copy of the project SQLite database. `npm run build`, browser JavaScript syntax checks, and the focused planning-workspace persistence/sensitivity test passed. Local browser verification covered default 2025 and audit 2024 context switching, custom scenario persistence across reload, rank-year labeling, list/map district-filter synchronization, proposal save/reopen, and generation of the evidence-rich brief.

The production database, deployment, and approved scoring weights were not changed. Work remains uncommitted on the existing branch.
