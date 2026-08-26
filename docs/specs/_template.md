# Spec: <feature name>

Tracking: #<issue-number>
Status: draft | in-progress | shipped
Owner: <name>

## Intent

<One paragraph. What user problem does this feature solve? Why now?>

## User stories

- As a <role>, I want to <action> so that <outcome>.
- ...

## Acceptance criteria

Each of these will become one Playwright test.

- [ ] <A verifiable behavior. E.g., "Registering with an already-used email shows an inline 'email taken' error and does not create a user.">
- [ ] ...

## Non-goals

- <Something a reasonable reader might expect but this feature explicitly does not do.>

## Data model delta

New models / new fields / migrations required.

```prisma
// example
model Article {
  id String @id @default(cuid())
  // ...
}
```

## API surface

| Method | Path                | Auth | Input (Zod)         | Output               |
| ------ | ------------------- | ---- | ------------------- | -------------------- |
| POST   | `/api/articles`     | Yes  | `CreateArticleInput` | `Article`            |
| ...    | ...                 | ...  | ...                 | ...                  |

## UI surface

- `/articles/new` — new article editor
- `/articles/[slug]` — reading view
- Components: `<ArticleEditor>`, `<ArticleCard>`, ...

## E2E test plan

- `e2e/tests/<feature>/*.spec.ts` — UI journeys
- `e2e/api/<feature>/*.spec.ts` — HTTP contract

## Open questions

- <Anything still undecided; block on user answer before implementing.>
