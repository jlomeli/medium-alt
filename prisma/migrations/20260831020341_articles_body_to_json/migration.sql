-- Migrate Article.body from TEXT (plain string) to JSONB (Tiptap doc).
--
-- Per docs/specs/articles-editor.md § Migration: existing rows are
-- converted paragraph-per-blank-line so no author's content is lost.
-- Prisma's default scaffold would DROP + ADD, wiping data; this
-- hand-authored version does a three-step swap under the transaction
-- Prisma migrate wraps around us.

-- 1. Add the new column (nullable during the fill step).
ALTER TABLE "Article" ADD COLUMN "body_json" JSONB;

-- 2. Convert each row's plain-text body to a Tiptap doc. Paragraphs
--    split on runs of ≥1 blank line; an empty (all-whitespace) body
--    becomes a doc with a single empty paragraph.
UPDATE "Article" a
SET "body_json" = jsonb_build_object(
  'type', 'doc',
  'content', COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'type', 'paragraph',
          'content', jsonb_build_array(
            jsonb_build_object('type', 'text', 'text', para)
          )
        )
      )
      FROM regexp_split_to_table(a."body", E'\n{2,}') AS para
      WHERE length(para) > 0
    ),
    jsonb_build_array(
      jsonb_build_object('type', 'paragraph')
    )
  )
);

-- 3. Enforce NOT NULL, drop the old column, rename.
ALTER TABLE "Article" ALTER COLUMN "body_json" SET NOT NULL;
ALTER TABLE "Article" DROP COLUMN "body";
ALTER TABLE "Article" RENAME COLUMN "body_json" TO "body";
