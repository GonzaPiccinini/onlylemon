# Delta for leads

## ADDED Requirements

### Requirement: Lead Creation Contract keyed by Landing

`POST /api/leads` MUST require `landingId` and MUST route solely by it. The
client `metaPixelId` MUST NOT influence routing or pixel resolution; the pixel
(number + access token, incl. CAPI) MUST be resolved server-side via the
`Landing → MetaPixel` FK.

#### Scenario: Missing landingId rejected

- GIVEN a request body without `landingId`
- WHEN `POST /api/leads` is called
- THEN it responds `400` with `{ message: 'Invalid body data', details }`
- AND no lead is created

#### Scenario: Unknown landing

- GIVEN a `landingId` that does not exist
- WHEN `POST /api/leads` is called
- THEN it responds `404` `{ message: 'Landing not found' }`

#### Scenario: Disabled landing hidden as not-found

- GIVEN a landing whose status is `DISABLED`
- WHEN `POST /api/leads` is called with its id
- THEN it responds `404` `{ message: 'Landing not found or disabled' }`
- AND never `403` (landing existence is not leaked)

#### Scenario: Duplicate fbc

- GIVEN an `fbc` already used by an existing lead
- WHEN `POST /api/leads` is called with that `fbc`
- THEN it responds `409`

#### Scenario: Fallback invariant violated

- GIVEN no cashier number is selectable AND the fallback phone pool (D3) is empty
- WHEN `POST /api/leads` is called for a valid enabled landing
- THEN it responds `500`

#### Scenario: Successful creation

- GIVEN a valid enabled `landingId`
- WHEN `POST /api/leads` is called
- THEN it responds `201` with `{ code, number }`

#### Scenario: Client-supplied pixel is ignored

- GIVEN a request that still carries a `metaPixelId` field
- WHEN `POST /api/leads` is called
- THEN routing and pixel resolution ignore it and use only `landingId`

### Requirement: Number Selection Keyed by Landing

Cashier-number selection (D1 cashiers on shift → D2 linked numbers → D3 fallback
phones) and deficit load-balancing MUST be keyed by `landingId`. The selection
algorithm itself MUST remain unchanged — only the key changes from pixel number
to `landingId`.

#### Scenario: Fallback chain resolves by landing

- GIVEN a landing with no cashiers on shift and no linked numbers
- WHEN a lead is created for it
- THEN a number is chosen from that landing's fallback phone pool (D3)

#### Scenario: Deficit count not conflated across a shared pixel

- GIVEN landings L1 and L2 both referencing the same `MetaPixel`
- AND L1 already has N contacted leads while L2 has 0
- WHEN a new lead is created for L2
- THEN the balancer counts only L2's leads (by `landingId`), never L1's

### Requirement: Attribution Snapshot on Lead Create

At create time the system MUST copy the landing's CURRENT pixel into
`Lead.metaPixelId` (FK → `MetaPixel.id`) and MUST snapshot `Landing.url` into
`Lead.eventSourceUrl`. These snapshots MUST NOT be re-resolved later from the
live landing.

#### Scenario: Snapshot captured at create

- GIVEN a landing referencing pixel P1 with url U1
- WHEN a lead is created for that landing
- THEN `Lead.metaPixelId` points to P1 AND `Lead.eventSourceUrl` equals U1

### Requirement: CAPI Dispatch from Lead Snapshot

Both CAPI events of a lead — `Lead` (at create) and `Contact` (later, on
WhatsApp inbound) — MUST resolve the pixel number and access token from
`lead.metaPixel.pixelId` / `lead.metaPixel.accessToken` and the source url from
`lead.eventSourceUrl`. Neither event MAY read the live landing.

#### Scenario: Both events use the same snapshot

- GIVEN a lead created with snapshot pixel P1 and url U1
- WHEN the `Lead` event fires and later the `Contact` event fires
- THEN both dispatch with P1's `pixelId` + `accessToken` and url U1

#### Scenario: Snapshot immunity to landing reassignment (critical)

- GIVEN a lead created with snapshot pixel P1 and url U1
- WHEN an admin reassigns the landing to pixel P2 and/or changes its url to U2
- AND the `Contact` event subsequently fires for that lead
- THEN it dispatches with P1 + U1, NOT P2/U2

#### Scenario: Token rotation on the same pixel row

- GIVEN a lead pinned to `MetaPixel` row M, whose `accessToken` is later rotated
- WHEN the `Contact` event fires
- THEN it uses the current `accessToken` of the pinned row M (the pin holds; the
  token reflects row M's live value)

#### Scenario: Access token never exposed

- GIVEN any publicly served payload, lead DTO, or embed JS
- WHEN it is produced
- THEN `MetaPixel.accessToken` MUST NOT appear anywhere in it
