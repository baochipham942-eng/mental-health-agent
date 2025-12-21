/**
 * 资源服务
 * RAG 系统的对外主接口
 */

import {
    RetrievalContext,
    RetrievalResult,
    ScoredResource,
    CrisisHotlineResource,
    PsychoEducationResource,
    AnyResource,
} from './types';
import { getResourceLoader, ResourceLoader } from './loader';
import { getResourceMatcher, ResourceMatcher } from './matcher';

/**
 * 资源服务类
 * 提供资源检索和格式化功能
 */
export class ResourceService {
    private loader: ResourceLoader;
    private matcher: ResourceMatcher;

    constructor() {
        this.loader = getResourceLoader();
        this.matcher = getResourceMatcher();
    }

    /**
     * 根据上下文检索相关资源
     */
    retrieve(context: RetrievalContext, limit: number = 3): RetrievalResult {
        const startTime = Date.now();

        // 使用匹配器获取相关资源
        const resources = this.matcher.match(context, limit);

        // 格式化为 Prompt 注入内容
        const formattedContext = this.formatForPrompt(resources);

        return {
            resources,
            formattedContext,
            retrievalTime: Date.now() - startTime,
        };
    }

    /**
     * 获取危机热线（用于 crisis 路由）
     */
    getCrisisHotlines(limit: number = 3): CrisisHotlineResource[] {
        return this.matcher.getCrisisHotlines(limit);
    }

    /**
     * 获取特定主题的教育资源
     */
    getEducationByTopic(topic: string): PsychoEducationResource[] {
        return this.matcher.searchEducation(topic);
    }

    /**
     * 格式化资源为 Prompt 注入格式
     */
    formatForPrompt(resources: ScoredResource[]): string {
        if (resources.length === 0) {
            return '';
        }

        const sections: string[] = [];

        // 分组资源
        const hotlines = resources.filter((r) => r.resource.type === 'crisis_hotline');
        const education = resources.filter((r) => r.resource.type === 'psycho_education');
        const strategies = resources.filter((r) => r.resource.type === 'coping_strategy');

        // 格式化危机热线
        if (hotlines.length > 0) {
            const hotlineLines = hotlines.map((r) => {
                const h = r.resource as CrisisHotlineResource;
                return `- ${h.title}: ${h.phone} (${h.hours})`;
            });
            sections.push(`### 危机热线\n${hotlineLines.join('\n')}`);
        }

        // 格式化教育资源
        if (education.length > 0) {
            const eduLines = education.map((r) => {
                const e = r.resource as PsychoEducationResource;
                // 提取内容的前 200 字作为摘要
                const excerpt = e.summary || e.content.substring(0, 200).replace(/\n/g, ' ');
                return `**${e.title}**\n${excerpt}`;
            });
            sections.push(`### 相关知识\n${eduLines.join('\n\n')}`);
        }

        // 格式化应对策略
        if (strategies.length > 0) {
            const strategyLines = strategies.map((r) => {
                const s = r.resource as any; // Cast to access steps
                const steps = s.steps && Array.isArray(s.steps)
                    ? s.steps.map((step: string, idx: number) => `    ${idx + 1}. ${step}`).join('\n')
                    : '';
                return `#### ${s.title}\n- 描述: ${s.description}\n- 步骤:\n${steps}`;
            });
            sections.push(`### 推荐的应对策略（请优先基于此生成 Action Cards）\n${strategyLines.join('\n\n')}`);
        }

        return `## 可用专业参考资源
以下是来自“心灵树洞”专业知识库的内容。在回复时，请务必遵循以下格式规范：

1. **显性标识**: 在引用下方内容的段落前，必须标注 \`【心理百科】\` 或 \`【知识卡片】\`。
2. **权威引导**: 使用“查阅了我们的专业知识库...”、“根据心理百科的建议...”等话术自然衔接。
3. **溯源声明**: 在整条回复的末尾（所有工具调用之后），请独立一行添加：\`*来源：心灵树洞专业知识库 | 认知行为疗法（CBT）实践指南*\`。

---
${sections.join('\n\n')}
---

请整合上述资源，为用户提供专业且有据可查的回复。`;
    }

    /**
     * 格式化危机热线为简洁格式（用于危机响应）
     */
    formatHotlinesForCrisis(hotlines: CrisisHotlineResource[]): string {
        if (hotlines.length === 0) {
            return '';
        }

        const lines = hotlines.map((h) => `📞 ${h.title}: ${h.phone} (${h.hours})`);
        return `**紧急求助热线**\n${lines.join('\n')}`;
    }

    /**
     * 根据 ID 获取资源
     */
    getResourceById(id: string): AnyResource | undefined {
        return this.loader.getResourceById(id);
    }

    /**
     * 获取所有资源（用于调试）
     */
    getAllResources(): AnyResource[] {
        return this.loader.getAllResources();
    }

    /**
     * 清除缓存
     */
    clearCache(): void {
        this.loader.clearCache();
    }
}

// 导出单例实例
let serviceInstance: ResourceService | null = null;

export function getResourceService(): ResourceService {
    if (!serviceInstance) {
        serviceInstance = new ResourceService();
    }
    return serviceInstance;
}
