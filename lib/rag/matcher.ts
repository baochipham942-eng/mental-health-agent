/**
 * 资源匹配器
 * 基于规则的资源匹配逻辑
 */

import {
    AnyResource,
    RetrievalContext,
    ScoredResource,
    CrisisHotlineResource,
    PsychoEducationResource,
} from './types';
import { getResourceLoader } from './loader';

/**
 * 匹配权重配置
 */
const MATCH_WEIGHTS = {
    routeType: 30,      // 路由类型匹配权重
    riskLevel: 25,      // 风险等级匹配权重
    emotion: 20,        // 情绪匹配权重
    topic: 15,          // 主题匹配权重
    priority: 10,       // 资源优先级权重
};

/**
 * 资源匹配器类
 */
export class ResourceMatcher {
    /**
     * 根据上下文匹配资源
     */
    match(context: RetrievalContext, limit: number = 5): ScoredResource[] {
        const loader = getResourceLoader();
        const allResources = loader.getAllResources();

        const scoredResources: ScoredResource[] = [];

        for (const resource of allResources) {
            const { score, reasons } = this.calculateScore(resource, context);

            // 只保留有一定相关性的资源
            if (score > 0) {
                scoredResources.push({
                    resource,
                    score,
                    matchReasons: reasons,
                });
            }
        }

        // 按分数降序排序
        scoredResources.sort((a, b) => b.score - a.score);

        // 返回前 N 个
        return scoredResources.slice(0, limit);
    }

    /**
     * 计算资源与上下文的匹配分数
     */
    private calculateScore(
        resource: AnyResource,
        context: RetrievalContext
    ): { score: number; reasons: string[] } {
        let score = 0;
        const reasons: string[] = [];
        const applicability = resource.applicability;

        // 1. 路由类型匹配
        if (applicability.routeTypes?.includes(context.routeType)) {
            score += MATCH_WEIGHTS.routeType;
            reasons.push(`路由匹配: ${context.routeType}`);
        }

        // 2. 风险等级匹配
        if (context.riskLevel && context.riskLevel !== 'unknown') {
            if (applicability.riskLevels?.includes(context.riskLevel as any)) {
                score += MATCH_WEIGHTS.riskLevel;
                reasons.push(`风险等级匹配: ${context.riskLevel}`);
            }
        }

        // 3. 情绪匹配
        if (context.emotion && applicability.emotions) {
            const emotionLabel = context.emotion.label.toLowerCase();
            const matchedEmotion = applicability.emotions.find(
                (e) => emotionLabel.includes(e.toLowerCase()) || e.toLowerCase().includes(emotionLabel)
            );
            if (matchedEmotion) {
                // 情绪分数越高，匹配权重越高
                const emotionBoost = Math.min(context.emotion.score / 10, 1);
                score += MATCH_WEIGHTS.emotion * (0.5 + 0.5 * emotionBoost);
                reasons.push(`情绪匹配: ${matchedEmotion} (强度 ${context.emotion.score})`);
            }
        }

        // 4. 主题匹配
        if (applicability.topics && context.userMessage) {
            const message = context.userMessage.toLowerCase();
            const matchedTopics = applicability.topics.filter((topic) =>
                message.includes(topic.toLowerCase())
            );
            if (matchedTopics.length > 0) {
                // 匹配的主题越多，分数越高
                const topicBoost = Math.min(matchedTopics.length / 3, 1);
                score += MATCH_WEIGHTS.topic * (0.5 + 0.5 * topicBoost);
                reasons.push(`主题匹配: ${matchedTopics.join(', ')}`);
            }
        }

        // 5. 影响分数匹配
        if (
            context.impactScore !== undefined &&
            applicability.minImpact !== undefined
        ) {
            if (context.impactScore >= applicability.minImpact) {
                score += 5;
                reasons.push(`影响分数满足: ${context.impactScore} >= ${applicability.minImpact}`);
            }
        }

        // 6. 资源优先级加成
        score += (resource.priority / 10) * MATCH_WEIGHTS.priority;

        // 7. 特殊规则：危机路由强制匹配危机热线
        if (context.routeType === 'crisis' && resource.type === 'crisis_hotline') {
            score += 20;
            reasons.push('危机路由优先匹配热线');
        }

        return { score, reasons };
    }

    /**
     * 获取危机热线（用于 crisis 路由的快速获取）
     */
    getCrisisHotlines(limit: number = 3): CrisisHotlineResource[] {
        const loader = getResourceLoader();
        const hotlines = loader.loadHotlines();

        // 按优先级排序
        return hotlines
            .sort((a, b) => b.priority - a.priority)
            .slice(0, limit);
    }

    /**
     * 获取特定类别的教育资源
     */
    getEducationByCategory(category: string): PsychoEducationResource[] {
        const loader = getResourceLoader();
        const education = loader.loadEducationResources();

        return education.filter(
            (r) => r.category.toLowerCase() === category.toLowerCase()
        );
    }

    /**
     * 通过关键词搜索教育资源
     */
    searchEducation(query: string): PsychoEducationResource[] {
        const loader = getResourceLoader();
        const education = loader.loadEducationResources();
        const queryLower = query.toLowerCase();

        return education.filter((r) => {
            // 搜索标题、摘要和主题
            if (r.title.toLowerCase().includes(queryLower)) return true;
            if (r.summary.toLowerCase().includes(queryLower)) return true;
            if (r.applicability.topics?.some((t) => t.toLowerCase().includes(queryLower))) return true;
            return false;
        });
    }
}

// 导出单例实例
let matcherInstance: ResourceMatcher | null = null;

export function getResourceMatcher(): ResourceMatcher {
    if (!matcherInstance) {
        matcherInstance = new ResourceMatcher();
    }
    return matcherInstance;
}
