#!/usr/bin/env node
/**
 * The two things a person ever does to the store by hand.
 *
 *   npm run db:migrate   apply every migration that has not been applied
 *   npm run db:seed      create the named accounts, from passwords in the env
 *
 * Migrations are run from here rather than at build time on purpose: #18 §1
 * forbids the build depending on anything outside the repo, and a build that
 * reaches for Neon is a build that fails when Neon is asleep.
 *
 * Both commands are idempotent. Running either twice is a no-op that says so.
 */
import { existsSync } from 'node:fs';

import { getDb, runMigrations } from '../src/lib/db/client.js';
import { createUser, listUsers, normaliseUsername } from '../src/lib/admin/users.js';

// `astro dev` reads `.env.local` through Vite; a plain node script does not, so
// it is loaded here. Without it `DATABASE_URL` is absent and the whole point of
// the command — writing to the real Neon database — silently becomes an
// ephemeral one.
if (existsSync('.env.local')) process.loadEnvFile('.env.local');

/**
 * The people who get accounts, and the variable each one's password comes from.
 *
 * A password is never defaulted or generated: an account whose variable is unset
 * is skipped and reported. A default password on a live admin is the same thing
 * as no password, and this is the account that edits the giving link.
 */
const SEED_ACCOUNTS = [
  { username: 'jill', displayName: 'Jill Kilker', passwordVar: 'SEED_JILL_PASSWORD' },
  { username: 'george', displayName: 'George Jensen', passwordVar: 'SEED_GEORGE_PASSWORD' },
  // The developer's build-time account. Named through the environment so it is
  // obviously not one of the school's, and deleted from the Users screen at
  // handoff (#18 §4).
  {
    username: process.env.SEED_DEV_USERNAME ?? 'developer',
    displayName: process.env.SEED_DEV_NAME ?? 'Site developer',
    passwordVar: 'SEED_DEV_PASSWORD',
  },
];

const command = process.argv[2];

if (command === 'migrate') await migrate();
else if (command === 'seed') await seed();
else {
  console.error('Usage: node scripts/db.mjs <migrate|seed>');
  process.exit(2);
}

async function migrate() {
  describeTarget();
  const applied = await runMigrations(await getDb());
  console.log(
    applied.length === 0
      ? 'Already up to date — no migrations to apply.'
      : `Applied ${applied.length} migration(s): ${applied.join(', ')}`,
  );
}

async function seed() {
  describeTarget();
  const db = await getDb();
  const existing = new Set((await listUsers(db)).map((user) => user.username));

  let created = 0;
  for (const account of SEED_ACCOUNTS) {
    const username = normaliseUsername(account.username);
    if (existing.has(username)) {
      console.log(`- ${username}: already exists, left alone.`);
      continue;
    }

    const password = process.env[account.passwordVar];
    if (!password) {
      console.log(`- ${username}: skipped, ${account.passwordVar} is not set.`);
      continue;
    }

    await createUser(db, { username, displayName: account.displayName, password });
    console.log(`- ${username}: created as "${account.displayName}".`);
    created += 1;
  }

  console.log(created === 0 ? 'No accounts created.' : `Created ${created} account(s).`);
  if ((await listUsers(db)).length === 0) {
    console.error(
      'There are no accounts at all. Set the SEED_*_PASSWORD variables and run this again — otherwise the only way in is break-glass, which is meant to stay cold.',
    );
    process.exit(1);
  }
}

/** Say out loud which database is about to be written to. Never the credentials. */
function describeTarget() {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) {
    console.error(
      'DATABASE_URL is not set. Pull it with `vercel env pull .env.local`, or set it in the shell — refusing to "migrate" a database that vanishes when this process ends.',
    );
    process.exit(1);
  }
  console.log(`Target: ${new URL(url).host}`);
}
