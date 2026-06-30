# Delta for lead-attribution-migration

## ADDED Requirements

### Requirement: Expand Phase is Additive with Backfill

The expand migration MUST be additive (nullable columns only) and ship with the
current code. It MUST create one `MetaPixel` row per distinct
`(pixelId, accessToken)` (deduplicated), add nullable `Landing.metaPixelRef` (FK)
and `Landing.whatsappMessages`, and add nullable `Lead.metaPixelRef` (FK),
`Lead.eventSourceUrl`, and `Lead.landingId`. It MUST backfill these for all
landings AND all leads, including in-flight `NOT_CONTACTED` leads.

#### Scenario: MetaPixel rows deduplicated

- GIVEN existing landings sharing the same `(pixelId, accessToken)`
- WHEN expand runs
- THEN exactly one `MetaPixel` row exists per distinct pair

#### Scenario: Lead backfill covers in-flight leads

- GIVEN a `NOT_CONTACTED` lead created before expand
- WHEN the backfill runs
- THEN its `metaPixelRef`, `landingId`, and `eventSourceUrl` are populated from
  the landing that historically owned its pixel
- AND a future `Contact` for that lead would fire on the backfilled snapshot

#### Scenario: Backfill is idempotent

- GIVEN expand + backfill already ran
- WHEN the backfill runs again
- THEN no duplicate `MetaPixel` rows are created and values are unchanged

#### Scenario: Old behavior intact during expand

- GIVEN the system is in the expand state (old columns still present)
- WHEN `POST /api/leads` and inbound processing run
- THEN they keep working with the old pixel-number routing

### Requirement: Coordinated Cutover

The cutover MUST deploy the `landingId`-only worker, the embed (Change B), and
swap ALL landings within one short window. After cutover, routing MUST be by
`landingId` and dispatches MUST read the lead snapshot.

#### Scenario: Routing flips to landingId

- GIVEN every active landing's embed is deployed and reachable
- WHEN the cutover completes
- THEN `POST /api/leads` routes solely by `landingId`
- AND CAPI events dispatch from `lead.metaPixel` + `lead.eventSourceUrl`

### Requirement: Contract Phase Tightens and Renames

After a verify window, the contract migration MUST set `Landing.metaPixelRef`,
`Lead.metaPixelRef`, `Lead.eventSourceUrl`, and `Lead.landingId` to NOT NULL with
`onDelete: Restrict`, drop the old scalars (`Landing.metaAccessToken`, old
`Landing.metaPixelId` number + its `@unique`, old `Lead` pixel-number column),
and rename `metaPixelRef → metaPixelId` on both `Landing` and `Lead`.

#### Scenario: Tighten and drop

- GIVEN expand + cutover completed and verified
- WHEN contract runs
- THEN the new FK columns are NOT NULL, old scalar columns are dropped, and
  `metaPixelRef` is renamed to `metaPixelId` on both tables

### Requirement: Continuity Invariant Across the Sequence

At NO point in the expand → cutover → contract sequence MUST lead creation or
inbound processing break.

#### Scenario: No break at any phase boundary

- GIVEN the migration progressing through expand, cutover, and contract
- WHEN a lead is created and an inbound message is processed at each phase
- THEN both succeed at every phase (old behavior pre-cutover, new behavior after)
