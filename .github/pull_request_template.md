<!--
Every PR should reference a spec and the tracking issue.
Delete lines that don't apply.
-->

## Spec + tracking

- Closes #<issue>
- Spec: [`docs/specs/<feature>.md`](../docs/specs/<feature>.md)

## What this changes

<Short summary of the change. What's different afterwards?>

## Acceptance criteria (from spec)

- [ ] <criterion 1>
- [ ] <criterion 2>

## Screenshots / preview

<Attach relevant screenshots, or point at the Vercel preview URL.>

## Review notes for the agent

<Optional: anything the reviewer should focus on or know that isn't obvious from the diff. E.g. "This intentionally leaves X for a follow-up; see docs/specs/<feature>.md §Non-goals.">

## Checklist

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test:unit` passes
- [ ] `pnpm test:e2e:smoke` passes locally
- [ ] Spec updated if the feature deviated from the original plan
