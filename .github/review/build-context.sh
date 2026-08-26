#!/usr/bin/env bash
# Build the context bundle handed to the reviewing Claude.
#
# This is the piece to iterate on early. What we feed the reviewer largely
# determines what the review is worth. See docs/workflow.md.
#
# Env in:
#   PR_NUMBER, PR_TITLE, PR_BODY, BASE_SHA, HEAD_SHA, PREVIEW_URL, GH_TOKEN
# Output: the assembled review context on stdout (markdown).

set -euo pipefail

echo "# PR ${PR_NUMBER}: ${PR_TITLE}"
echo
echo "## PR body"
echo
echo "${PR_BODY:-<no body>}"
echo

# --- Linked spec, if the PR body references one ------------------------------
echo "## Linked spec"
echo
SPEC_PATH=$(printf '%s\n' "${PR_BODY:-}" | grep -oE 'docs/specs/[a-z0-9_-]+\.md' | head -n1 || true)
if [ -n "$SPEC_PATH" ] && [ -f "$SPEC_PATH" ]; then
  echo "\`$SPEC_PATH\`:"
  echo
  echo '```markdown'
  cat "$SPEC_PATH"
  echo '```'
else
  echo "_No spec linked in PR body. This should probably fail the review._"
fi
echo

# --- Coding standards --------------------------------------------------------
echo "## Coding standards (excerpt)"
echo
if [ -f CODING_STANDARDS.md ]; then
  echo '```markdown'
  cat CODING_STANDARDS.md
  echo '```'
fi
echo

# --- Diff --------------------------------------------------------------------
echo "## Diff"
echo
echo '```diff'
git diff "${BASE_SHA}...${HEAD_SHA}" -- . ':(exclude)pnpm-lock.yaml'
echo '```'
echo

# --- File tree of changed files ---------------------------------------------
echo "## Changed files"
echo
echo '```'
git diff --name-status "${BASE_SHA}...${HEAD_SHA}"
echo '```'
echo

echo "## Preview URL"
echo
echo "${PREVIEW_URL:-<not available yet>}"
