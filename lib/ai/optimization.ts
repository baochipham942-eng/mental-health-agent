/**
 * Prompt 优化服务
 * 支持自动修改 prompt 文件，并在撤回时恢复
 */

import * as fs from 'fs';
import * as path from 'path';

const PROMPTS_FILE_PATH = path.join(process.cwd(), 'lib/ai/prompts.ts');
const BACKUP_DIR = path.join(process.cwd(), '.prompt-backups');

interface PromptModification {
    evaluationId: string;
    section: 'IDENTITY_PROMPT' | 'CBT_PROTOCOL_PROMPT' | 'SAFETY_PROMPT' | 'RAG_FORMATTING_PROMPT';
    originalContent: string;
    modifiedContent: string;
    appliedAt: Date;
}

// 确保备份目录存在
function ensureBackupDir() {
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
}

// 读取当前 prompts.ts 内容
export function readPromptsFile(): string {
    return fs.readFileSync(PROMPTS_FILE_PATH, 'utf-8');
}

// 写入 prompts.ts 内容
export function writePromptsFile(content: string): void {
    fs.writeFileSync(PROMPTS_FILE_PATH, content, 'utf-8');
}

// 保存备份
export function saveBackup(evaluationId: string, originalContent: string): string {
    ensureBackupDir();
    const backupPath = path.join(BACKUP_DIR, `${evaluationId}.backup`);
    fs.writeFileSync(backupPath, originalContent, 'utf-8');
    return backupPath;
}

// 读取备份
export function readBackup(evaluationId: string): string | null {
    const backupPath = path.join(BACKUP_DIR, `${evaluationId}.backup`);
    if (fs.existsSync(backupPath)) {
        return fs.readFileSync(backupPath, 'utf-8');
    }
    return null;
}

// 删除备份
export function deleteBackup(evaluationId: string): void {
    const backupPath = path.join(BACKUP_DIR, `${evaluationId}.backup`);
    if (fs.existsSync(backupPath)) {
        fs.unlinkSync(backupPath);
    }
}

// 根据改进建议生成修改后的 IDENTITY_PROMPT
function applyImprovementsToPrompt(originalPrompt: string, improvements: string[]): string {
    let modified = originalPrompt;

    improvements.forEach(imp => {
        // 1. AI 身份声明
        if ((imp.includes('AI局限性') || imp.includes('AI的局限性')) && !modified.includes('作为 AI 助手')) {
            modified = modified.trimEnd() + '\n在首轮回复中自然地表明身份："作为 AI 助手，我会尽力陪伴和支持你。"';
        }

        // 2. 共情表达多样化
        if (imp.includes('共情') && (imp.includes('重复') || imp.includes('多样化')) && !modified.includes('共情表达多样化')) {
            modified = modified.trimEnd() + '\n共情表达要多样化：避免重复使用"我理解"，可使用"这一定让你感到..."、"听起来..."等表达。';
        }

        // 3. 回复长度限制
        if (imp.includes('回复') && (imp.includes('简洁') || imp.includes('句'))) {
            modified = modified.replace('3-5 句', '3-4 句');
        }

        // 4. 专业帮助建议
        if (imp.includes('专业帮助') || imp.includes('严重情况')) {
            if (!modified.includes('寻求专业')) {
                modified = modified.trimEnd() + '\n当用户表现出持续严重症状时，主动建议寻求专业心理咨询师帮助。';
            }
        }
    });

    return modified;
}

// 应用改进建议到 prompts.ts 文件
export function applyImprovements(evaluationId: string, improvements: string[]): {
    success: boolean;
    error?: string;
    backupPath?: string;
} {
    try {
        const currentContent = readPromptsFile();

        // 保存备份
        const backupPath = saveBackup(evaluationId, currentContent);

        // 提取 IDENTITY_PROMPT 的内容
        const identityMatch = currentContent.match(/export const IDENTITY_PROMPT = `([^`]+)`/);
        if (!identityMatch) {
            return { success: false, error: 'Cannot find IDENTITY_PROMPT in prompts.ts' };
        }

        const originalIdentityPrompt = identityMatch[1];
        const modifiedIdentityPrompt = applyImprovementsToPrompt(originalIdentityPrompt, improvements);

        // 如果没有变化，不需要修改
        if (originalIdentityPrompt === modifiedIdentityPrompt) {
            deleteBackup(evaluationId);
            return { success: true }; // 无需修改
        }

        // 替换内容
        const newContent = currentContent.replace(
            /export const IDENTITY_PROMPT = `[^`]+`/,
            `export const IDENTITY_PROMPT = \`${modifiedIdentityPrompt}\``
        );

        writePromptsFile(newContent);

        console.log(`[PromptOptimization] Applied improvements for ${evaluationId}`);
        return { success: true, backupPath };

    } catch (error) {
        console.error('[PromptOptimization] Apply failed:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

// 撤回修改，恢复原始 prompt
export function revokeImprovements(evaluationId: string): {
    success: boolean;
    error?: string;
} {
    try {
        const backup = readBackup(evaluationId);

        if (!backup) {
            // 没有备份，可能从未修改过
            console.log(`[PromptOptimization] No backup found for ${evaluationId}, nothing to revoke`);
            return { success: true };
        }

        // 恢复备份
        writePromptsFile(backup);
        deleteBackup(evaluationId);

        console.log(`[PromptOptimization] Revoked improvements for ${evaluationId}`);
        return { success: true };

    } catch (error) {
        console.error('[PromptOptimization] Revoke failed:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

// 获取当前 IDENTITY_PROMPT 内容
export function getCurrentIdentityPrompt(): string | null {
    try {
        const content = readPromptsFile();
        const match = content.match(/export const IDENTITY_PROMPT = `([^`]+)`/);
        return match ? match[1] : null;
    } catch {
        return null;
    }
}
