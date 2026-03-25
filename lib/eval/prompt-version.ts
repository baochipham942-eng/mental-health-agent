/**
 * Sprint 3: Prompt 版本管理服务
 * 版本注册、查询、diff、评分聚合
 */

import {
    findPromptVersionByHash,
    findLatestPromptVersion,
    createPromptVersion as dbCreatePromptVersion,
    findAllPromptVersions,
    findPromptVersionHistory,
    findVersionEvaluations,
} from './data-bridge';
import * as crypto from 'crypto';
import { evalEvents } from './eval-events';

/**
 * 注册一个 Prompt 版本（自动去重）
 */
export async function registerPrompt(
    name: string,
    content: string,
    metadata?: { author?: string; description?: string; changeReason?: string }
): Promise<{ id: string; isNew: boolean }> {
    const hash = crypto.createHash('sha256').update(content).digest('hex');

    // 检查是否已存在相同内容
    const existing = await findPromptVersionByHash(hash);
    if (existing) {
        evalEvents.emit('prompt:version-registered', {
            versionId: existing.id,
            name,
            isNew: false,
        });
        return { id: existing.id, isNew: false };
    }

    // 查找同名的最新版本作为 parent
    const latestSameName = await findLatestPromptVersion(name);

    const created = await dbCreatePromptVersion({
        name,
        content,
        hash,
        parentId: latestSameName?.id || null,
        metadata,
    });

    // 发射新版本注册事件，触发自动评测
    evalEvents.emit('prompt:version-registered', {
        versionId: created.id,
        name,
        isNew: true,
    });

    return { id: created.id, isNew: true };
}

/**
 * 获取指定名称的最新版本
 */
export async function getCurrentVersion(name: string) {
    return findLatestPromptVersion(name);
}

/**
 * 获取所有 Prompt 名称及其最新版本
 */
export async function listPromptNames() {
    const all = await findAllPromptVersions();

    // 按 name 分组，取最新
    const nameMap = new Map<string, typeof all[0]>();
    for (const v of all) {
        if (!nameMap.has(v.name)) {
            nameMap.set(v.name, v);
        }
    }
    return Array.from(nameMap.values());
}

/**
 * 获取指定名称的版本历史
 */
export async function getVersionHistory(name: string) {
    return findPromptVersionHistory(name);
}

/**
 * 文本 diff（简单逐行对比）
 */
export function diffVersions(contentA: string, contentB: string): {
    added: string[];
    removed: string[];
    unchanged: number;
} {
    const linesA = contentA.split('\n');
    const linesB = contentB.split('\n');
    const setA = new Set(linesA);
    const setB = new Set(linesB);

    const added = linesB.filter(l => !setA.has(l));
    const removed = linesA.filter(l => !setB.has(l));
    const unchanged = linesA.filter(l => setB.has(l)).length;

    return { added, removed, unchanged };
}

/**
 * 获取某版本关联的评分聚合
 */
export async function getVersionScores(versionId: string) {
    const evaluations = findVersionEvaluations(versionId);

    if (evaluations.length === 0) {
        return { count: 0, avgScore: 0, gradeDistribution: {} };
    }

    const totalScore = evaluations.reduce((sum, e) => sum + e.overallScore, 0);
    const gradeDistribution: Record<string, number> = {};
    for (const e of evaluations) {
        gradeDistribution[e.overallGrade] = (gradeDistribution[e.overallGrade] || 0) + 1;
    }

    return {
        count: evaluations.length,
        avgScore: Math.round((totalScore / evaluations.length) * 10) / 10,
        gradeDistribution,
    };
}
