import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

function createTempDbPath(): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mental-trace-eval-'));
  return path.join(tempDir, 'trace-eval.db');
}

describe('trace eval db', () => {
  afterEach(() => {
    vi.resetModules();
    delete process.env.EVAL_DB_PATH;
  });

  it('writes and reads expected scene/websearch truth labels', async () => {
    process.env.EVAL_DB_PATH = createTempDbPath();
    const { writeTraceEval, getTraceEvals, updateTraceEvalLabels, getTraceStats } = await import('./db');

    writeTraceEval(
      {
        conversationId: 'conv-trace-1',
        steps: [],
        traceScore: 0.9,
        traceGrade: 'A',
        evaluatedBy: 'test-model',
        evaluatedAt: new Date().toISOString(),
      },
      {
        traceJson: '[]',
        userMessage: '这类字段改动通常谁来建卡？',
        aiReply: '我先帮你拆一下责任边界。',
        evalSource: 'manual',
        expectedSceneId: 'workplace_boundary',
        expectedWebSearchNeed: 'suggested',
        expectedShouldSearch: true,
      },
    );

    const [row] = getTraceEvals({ conversationId: 'conv-trace-1', limit: 1 });

    expect(row).toBeDefined();
    expect(row.expected_scene_id).toBe('workplace_boundary');
    expect(row.expected_websearch_need).toBe('suggested');
    expect(row.expected_should_search).toBe(1);

    const updated = updateTraceEvalLabels({
      conversationId: 'conv-trace-1',
      expectedSceneId: 'student_pressure',
      expectedWebSearchNeed: 'required',
      expectedShouldSearch: false,
    });

    expect(updated).toBeDefined();
    expect(updated?.expected_scene_id).toBe('student_pressure');
    expect(updated?.expected_websearch_need).toBe('required');
    expect(updated?.expected_should_search).toBe(0);

    const stats = getTraceStats();
    expect(stats.truthMatchRates.scene.labeled).toBe(1);
    expect(stats.truthMatchRates.scene.matched).toBe(0);
    expect(stats.truthMatchRates.scene.mismatched).toBe(1);
    expect(stats.truthMatchRates.webSearchNeed.labeled).toBe(1);
    expect(stats.truthMatchRates.webSearchNeed.matched).toBe(0);
    expect(stats.truthMatchRates.webSearchNeed.mismatched).toBe(1);
    expect(stats.truthMatchRates.shouldSearch.labeled).toBe(1);
    expect(stats.truthMatchRates.shouldSearch.matched).toBe(0);
    expect(stats.truthMatchRates.shouldSearch.mismatched).toBe(1);

    writeTraceEval(
      {
        conversationId: 'conv-trace-2',
        steps: [],
        traceScore: 0.6,
        traceGrade: 'B',
        evaluatedBy: 'test-model',
        evaluatedAt: new Date().toISOString(),
      },
      {
        traceJson: '[]',
        userMessage: '我现在只想被陪一下',
        aiReply: '我先陪你把这口气顺下来。',
        evalSource: 'manual',
      },
    );

    const filteredStats = getTraceStats({ grade: 'A' });
    expect(filteredStats.total).toBe(1);
    expect(filteredStats.gradeDistribution.A).toBe(1);
    expect(filteredStats.gradeDistribution.B).toBeUndefined();
  });
});
