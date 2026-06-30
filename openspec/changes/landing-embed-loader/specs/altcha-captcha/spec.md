# Delta for altcha-captcha

## ADDED Requirements

### Requirement: Public Signed Challenge Endpoint

`GET /altcha/challenge` MUST be a public GET that returns a challenge signed with
`ALTCHA_HMAC_SECRET` (HMAC), with an expiry of roughly 10 minutes. The secret
MUST NOT be sent to the client — only the signed challenge.

#### Scenario: Challenge issued

- GIVEN a configured `ALTCHA_HMAC_SECRET`
- WHEN `GET /altcha/challenge` is called
- THEN it responds `200` with a signed challenge JSON whose expiry is ~10 minutes ahead

#### Scenario: Secret never leaves the server

- GIVEN a challenge response
- WHEN its body is inspected
- THEN it contains the signature/challenge fields but MUST NOT contain `ALTCHA_HMAC_SECRET`

### Requirement: Server-Side Solution Verification

The worker MUST verify a submitted Altcha payload server-side with
`verifySolution` against `ALTCHA_HMAC_SECRET`, checking expiry. A valid solution
MUST pass; an invalid signature or an expired challenge MUST be rejected with
`403`.

#### Scenario: Valid solution accepted

- GIVEN a payload solved against a currently-valid signed challenge
- WHEN `verifyCaptcha(payload, ip)` runs
- THEN it returns ok (verification passes)

#### Scenario: Invalid signature rejected

- GIVEN a payload whose signature does not match `ALTCHA_HMAC_SECRET`
- WHEN it is verified
- THEN the request is rejected with `403`

#### Scenario: Expired challenge rejected

- GIVEN a payload whose challenge expiry is in the past
- WHEN it is verified
- THEN the request is rejected with `403`

### Requirement: One-Time Anti-Replay Enforcement

Altcha payloads MUST be single-use. The worker MUST derive a replay key from the
challenge signature and store it once in Redis (`SET key NX EX <ttl>`, TTL =
challenge expiry). A second verification of the same payload MUST be rejected
with `403`.

#### Scenario: First use accepted, replay rejected

- GIVEN a valid payload verified once (its replay key stored in Redis)
- WHEN the same payload is submitted a second time
- THEN the second verification is rejected with `403` (replay)
