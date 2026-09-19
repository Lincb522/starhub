#!/usr/bin/env node
import { syncGitHubStarRecords } from "./lib/github-star-sync.mjs";

function option(name) {
  const prefix = `--${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

const databasePath = option("db") || process.env.DATABASE_PATH;
const repoFullNames = option("repos")?.split(",").map((value) => value.trim()).filter(Boolean);
const dryRun = process.argv.includes("--dry-run");

try {
  const result = await syncGitHubStarRecords({ databasePath, repoFullNames, dryRun });
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), ...result }));
  if (result.availability?.errors.length) process.exitCode = 1;
} catch (error) {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    error: error instanceof Error ? error.message : String(error),
  }));
  process.exitCode = 1;
}
