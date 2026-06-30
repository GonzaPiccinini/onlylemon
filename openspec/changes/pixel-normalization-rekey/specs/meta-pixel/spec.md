# Delta for meta-pixel

## ADDED Requirements

### Requirement: MetaPixel CRUD

The admin MUST be able to create, edit, and list `MetaPixel` records with fields
`pixelId` (the Meta pixel number, unique), `accessToken` (server-side secret),
and optional `label`. The `accessToken` MUST NEVER be returned raw in any
response (masked or omitted in DTOs).

#### Scenario: Create a pixel

- GIVEN valid `{ pixelId, accessToken, label }`
- WHEN the admin creates a `MetaPixel`
- THEN it is persisted and listable
- AND the response does NOT contain the raw `accessToken`

#### Scenario: Duplicate pixelId rejected

- GIVEN an existing `MetaPixel` with `pixelId` "X"
- WHEN the admin creates another with `pixelId` "X"
- THEN creation is rejected (uniqueness violation)

#### Scenario: Token masked on read

- GIVEN an existing `MetaPixel`
- WHEN it is listed or fetched via the admin API
- THEN `accessToken` is masked or omitted, never the raw secret

### Requirement: Pixel Sharing Across Landings

A single `MetaPixel` MUST be shareable by multiple landings with no restriction
and no confirm-gate. Routing is by `landingId`, so sharing is never ambiguous.

#### Scenario: One pixel, many landings

- GIVEN a `MetaPixel` P
- WHEN two or more landings are assigned to P
- THEN all assignments succeed with no confirmation prompt or migration gate

### Requirement: Delete Restricted by References

Deleting a `MetaPixel` referenced by any landing or lead MUST be blocked
(`onDelete: Restrict`). The admin MUST surface a clear, friendly block message.

#### Scenario: Delete blocked while referenced

- GIVEN a `MetaPixel` referenced by at least one landing or lead
- WHEN the admin attempts to delete it
- THEN deletion is blocked with a clear message explaining the references

#### Scenario: Delete allowed when unreferenced

- GIVEN a `MetaPixel` with no referencing landings or leads
- WHEN the admin deletes it
- THEN deletion succeeds

### Requirement: Edit and Delete Guards by Reference State

The mutability of `MetaPixel` fields and the ability to delete a row depend on
what references the row. `accessToken` and `label` are **always editable**
because tokens expire/rotate and labels are cosmetic — changing them does not
affect historical attribution. `pixelId` (the Meta pixel number) is
**quasi-immutable once any lead is pinned to the row**: editing it in-place
would retro-change the attribution of all pinned leads. Delete is **blocked
whenever any landing or lead references the row** (`onDelete: Restrict`).

| Reference state | Edit `pixelId` | Edit `accessToken` / `label` | Delete |
|-----------------|---------------|------------------------------|--------|
| 0 landings, 0 leads | ✅ allowed | ✅ allowed | ✅ allowed |
| ≥1 landing, 0 leads | ✅ allowed | ✅ allowed | ❌ Restrict |
| ≥1 lead (regardless of landings) | ❌ blocked | ✅ allowed | ❌ Restrict |

#### Scenario: Unreferenced pixel — fully editable and deletable

- GIVEN a `MetaPixel` with no landings and no leads referencing it
- WHEN the admin edits any field including `pixelId` or deletes it
- THEN all operations succeed

#### Scenario: Landing-only reference — pixelId editable, delete blocked

- GIVEN a `MetaPixel` referenced by one or more landings but by no leads
- WHEN the admin edits `pixelId`
- THEN the change is accepted
- GIVEN the same pixel
- WHEN the admin attempts to delete it
- THEN deletion is blocked with a clear message explaining the references

#### Scenario: Lead reference — pixelId frozen, accessToken/label editable, delete blocked

- GIVEN a `MetaPixel` row M referenced by one or more leads
- WHEN the admin attempts to change M's `pixelId` number
- THEN the change is blocked with an explanation (editing in-place would retro-change pinned leads)
- WHEN the admin changes M's `accessToken` or `label`
- THEN the change succeeds
- WHEN the admin attempts to delete M
- THEN deletion is blocked

#### Scenario: accessToken rotation always succeeds

- GIVEN a `MetaPixel` referenced by any number of leads
- WHEN the admin rotates its `accessToken`
- THEN the update succeeds
- AND future CAPI dispatches for leads pinned to that row use the new token
  (the pin holds to the `MetaPixel.id` row; the live `accessToken` value is read
  at dispatch time — consistent with the snapshot-immunity design)
