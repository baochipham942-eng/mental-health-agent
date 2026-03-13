import 'dotenv/config';
const { Client } = require('pg');
import { buildMemoryFingerprint } from '../lib/memory/fingerprint';

type ProfileMemoryRow = {
  id: string;
  userId: string;
  kind: string;
  fingerprint: string | null;
  content: string;
  priority: number;
  confidence: number;
  sourceConversationId: string | null;
  supersedes: string | null;
  lastConfirmedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function pickPrimary(rows: ProfileMemoryRow[]): ProfileMemoryRow {
  return [...rows].sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    if (b.content.length !== a.content.length) return b.content.length - a.content.length;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  })[0];
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  const client = new Client({ connectionString });
  await client.connect();

  const rowsRes = await client.query(`
    SELECT
      id,
      "userId",
      kind,
      fingerprint,
      content,
      priority,
      confidence,
      "sourceConversationId",
      supersedes,
      "lastConfirmedAt",
      "deletedAt",
      "createdAt",
      "updatedAt"
    FROM "ProfileMemory"
    WHERE "deletedAt" IS NULL
    ORDER BY "userId", kind, "updatedAt" DESC
  `);

  const rows = rowsRes.rows as ProfileMemoryRow[];
  const groups = new Map<string, ProfileMemoryRow[]>();

  for (const row of rows) {
    const fingerprint = row.fingerprint || buildMemoryFingerprint(row.kind as any, row.content);
    const key = `${row.userId}::${row.kind}::${fingerprint}`;
    const next = { ...row, fingerprint };
    const list = groups.get(key) || [];
    list.push(next);
    groups.set(key, list);
  }

  let updatedFingerprints = 0;
  let mergedGroups = 0;
  let deletedRows = 0;

  await client.query('BEGIN');
  try {
    for (const groupRows of groups.values()) {
      const primary = pickPrimary(groupRows);
      const mergedContent = [...groupRows].sort((a, b) => b.content.length - a.content.length)[0].content;
      const maxConfidence = Math.max(...groupRows.map((row) => Number(row.confidence)));
      const maxPriority = Math.max(...groupRows.map((row) => Number(row.priority)));
      const latestRow = [...groupRows].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )[0];
      const latestConfirmed = groupRows
        .map((row) => row.lastConfirmedAt)
        .filter(Boolean)
        .sort()
        .at(-1);

      await client.query(
        `UPDATE "ProfileMemory"
         SET fingerprint = $2,
             content = $3,
             confidence = $4,
             priority = $5,
             "sourceConversationId" = $6,
             "lastConfirmedAt" = COALESCE($7::timestamp, "lastConfirmedAt"),
             "updatedAt" = NOW()
         WHERE id = $1`,
        [
          primary.id,
          primary.fingerprint,
          mergedContent,
          maxConfidence,
          maxPriority,
          latestRow.sourceConversationId,
          latestConfirmed,
        ]
      );
      updatedFingerprints++;

      const duplicates = groupRows.filter((row) => row.id !== primary.id);
      if (duplicates.length > 0) {
        mergedGroups++;
      }

      for (const duplicate of duplicates) {
        await client.query(
          `UPDATE "ProfileMemory"
           SET fingerprint = $2,
               supersedes = $3,
               "deletedAt" = NOW(),
               "updatedAt" = NOW()
           WHERE id = $1`,
          [duplicate.id, duplicate.fingerprint, primary.id]
        );
        deletedRows++;
      }
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }

  console.log(
    JSON.stringify(
      {
        totalRows: rows.length,
        groups: groups.size,
        updatedFingerprints,
        mergedGroups,
        softDeletedRows: deletedRows,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error('\nMemory V2 compact failed');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
