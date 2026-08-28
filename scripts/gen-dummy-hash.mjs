#!/usr/bin/env node
/**
 * Regenerate the DUMMY_PASSWORD_HASH constant in lib/auth/password.ts.
 *
 * Rarely needed — only if the hash needs to be rotated (e.g. argon2 params
 * change). The plaintext is intentionally invariant so nothing else relies
 * on the exact hash bytes; any argon2id hash of any plaintext works.
 *
 * Usage: node scripts/gen-dummy-hash.mjs
 */
import argon2 from "argon2";

const PLAINTEXT = "dummy-never-matches-a-real-password";
const hash = await argon2.hash(PLAINTEXT, { type: argon2.argon2id });
console.log(hash);
