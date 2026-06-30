# Delta for landing

## ADDED Requirements

### Requirement: Pixel Selector via FK

The landing admin form MUST select a `MetaPixel` by FK (`Landing.metaPixelId →
MetaPixel.id`) instead of the scalar `metaPixelId` (number) + `metaAccessToken`
fields. Changing a landing's pixel MUST be done by reassigning the FK to ANOTHER
`MetaPixel` row, not by editing a pixel number in place. The `accessToken` MUST
NOT appear in any landing DTO.

#### Scenario: Assign a pixel via the selector

- GIVEN an existing `MetaPixel` P
- WHEN the admin selects P for a landing and saves
- THEN `Landing.metaPixelId` references P
- AND the landing DTO contains no `accessToken`

#### Scenario: Change a landing's pixel by reassigning the FK

- GIVEN a landing referencing pixel P1
- WHEN the admin selects pixel P2 for that landing and saves
- THEN `Landing.metaPixelId` now references P2 (P1's row is untouched)

### Requirement: Per-Landing WhatsApp Messages

`Landing.whatsappMessages` MUST be a per-landing, editable list of strings
(replacing the previously hardcoded array). It defaults to an empty array and is
served for the embed (Change B) to consume. The whole list is replaced
atomically on save.

Validation rules (applied server-side on PUT/PATCH, before persistence):
1. Each message is trimmed of leading/trailing whitespace.
2. Messages that are empty or whitespace-only (after trim) are **discarded**.
3. At most **5** messages are accepted after discarding empties; more than 5 is
   rejected with a validation error.
4. Each message MUST be at most **250 characters** after trim; longer messages
   are rejected with a validation error.

#### Scenario: Edit the messages list

- GIVEN a landing with `whatsappMessages` ["a", "b"]
- WHEN the admin saves the list as ["x", "y", "z"]
- THEN `Landing.whatsappMessages` equals ["x", "y", "z"]

#### Scenario: Default empty list

- GIVEN a landing created without specifying messages
- WHEN it is persisted
- THEN `whatsappMessages` is an empty array

#### Scenario: Empty messages discarded

- GIVEN a submission `["Hello", "", "  ", "World"]`
- WHEN the landing is saved
- THEN `Landing.whatsappMessages` equals `["Hello", "World"]`
- AND no validation error is returned

#### Scenario: More than 5 messages rejected

- GIVEN a submission containing 6 non-empty messages (after trimming)
- WHEN the landing is saved
- THEN a validation error is returned (400) and no update is persisted

#### Scenario: Discard empties before counting

- GIVEN a submission with 4 non-empty messages plus 3 empty strings (7 raw)
- WHEN the landing is saved
- THEN the empties are discarded first, leaving 4 messages, which is accepted

#### Scenario: Message exceeding 250 characters rejected

- GIVEN a submission containing one message of 251 or more characters
- WHEN the landing is saved
- THEN a validation error is returned and no update is persisted

#### Scenario: Messages trimmed before persistence

- GIVEN a submission `["  Hello  ", " World "]`
- WHEN the landing is saved
- THEN `Landing.whatsappMessages` equals `["Hello", "World"]`

### Requirement: Landing URL Stays Non-Unique

`Landing.url` MUST remain non-unique; multiple landings MAY share the same url.

#### Scenario: Two landings with the same url

- GIVEN landing L1 with url U
- WHEN landing L2 is created with the same url U
- THEN both persist successfully (no uniqueness conflict)
