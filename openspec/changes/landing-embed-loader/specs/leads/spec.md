# Delta for leads

> Coordinates with **Change A — `pixel-normalization-rekey`**, which re-keys
> `POST /api/leads` to `landingId`. This delta only adds the captcha field change
> and its verification; both edits to `leads/http.ts` land in the same cutover
> deploy (Change A Fase 2 + Change B).

## ADDED Requirements

### Requirement: Captcha Verification on Lead Creation

`POST /api/leads` MUST require an `altcha` field carrying the base64 Altcha
payload (replacing the prior captcha-token field). The payload MUST be verified
server-side before a lead is created: a missing field MUST be rejected, and a
failed verification (invalid / expired / replay) MUST be rejected — without
creating a lead.

#### Scenario: Missing altcha rejected

- GIVEN a `POST /api/leads` body with a valid `landingId` but no `altcha` field
- WHEN the request is handled
- THEN it responds `400` (invalid body) and no lead is created

#### Scenario: Failed verification rejected

- GIVEN a body with `landingId` and an `altcha` payload that fails verification (invalid, expired, or replayed)
- WHEN the request is handled
- THEN it responds `403` and no lead is created

#### Scenario: Valid altcha proceeds to creation

- GIVEN a valid enabled `landingId` and an `altcha` payload that verifies (first use)
- WHEN `POST /api/leads` is called
- THEN captcha verification passes and lead creation proceeds (`201 { code, number }` per the Change A contract)
