import 'dotenv/config';
const { Client } = require('pg');

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  const client = new Client({ connectionString });
  await client.connect();

  const counts = await client.query(`
    SELECT 'MemoryCandidate' AS table_name, COUNT(*)::int AS count FROM "MemoryCandidate"
    UNION ALL
    SELECT 'ProfileMemory(active)' AS table_name, COUNT(*)::int AS count FROM "ProfileMemory" WHERE "deletedAt" IS NULL
    UNION ALL
    SELECT 'ProfileMemory(deleted)' AS table_name, COUNT(*)::int AS count FROM "ProfileMemory" WHERE "deletedAt" IS NOT NULL
    UNION ALL
    SELECT 'SessionSummaryV2' AS table_name, COUNT(*)::int AS count FROM "SessionSummaryV2"
  `);

  const latestCandidates = await client.query(`
    SELECT "kind", "content", "status", "createdAt"
    FROM "MemoryCandidate"
    ORDER BY "createdAt" DESC
    LIMIT 5
  `);

  const latestProfiles = await client.query(`
    SELECT "kind", "content", "priority", "updatedAt"
    FROM "ProfileMemory"
    WHERE "deletedAt" IS NULL
    ORDER BY "updatedAt" DESC
    LIMIT 5
  `);

  const latestSummaries = await client.query(`
    SELECT "conversationId", LEFT(summary, 120) AS summary_preview, "createdAt"
    FROM "SessionSummaryV2"
    ORDER BY "createdAt" DESC
    LIMIT 3
  `);

  console.log('== Memory V2 Status ==');
  console.log('\n[counts]');
  console.log(JSON.stringify(counts.rows, null, 2));
  console.log('\n[latest candidates]');
  console.log(JSON.stringify(latestCandidates.rows, null, 2));
  console.log('\n[latest profile memories]');
  console.log(JSON.stringify(latestProfiles.rows, null, 2));
  console.log('\n[latest summaries]');
  console.log(JSON.stringify(latestSummaries.rows, null, 2));

  await client.end();
}

main().catch((error) => {
  console.error('\nMemory V2 status failed');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
