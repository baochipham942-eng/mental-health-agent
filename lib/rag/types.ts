/**
 * RAG 系统类型定义
 * 用于心理健康资源的检索和推荐
 */

/**
 * 资源类型枚举
 */
export type ResourceType =
    | 'crisis_hotline'      // 危机热线
    | 'psycho_education'    // 心理教育文章
    | 'assessment_tool'     // 评估工具/量表
    | 'coping_strategy'     // 应对策略
    | 'local_service';      // 本地服务

/**
 * 资源适用性条件
 */
export interface ResourceApplicability {
    /** 适用的路由类型 */
    routeTypes?: ('crisis' | 'assessment' | 'support')[];
    /** 适用的风险等级 */
    riskLevels?: ('low' | 'medium' | 'high' | 'crisis')[];
    /** 适用的情绪类型 */
    emotions?: string[];
    /** 适用的主题/关键词 */
    topics?: string[];
    /** 最小影响分数 (0-10) */
    minImpact?: number;
}

/**
 * 基础资源接口
 */
export interface Resource {
    id: string;
    type: ResourceType;
    title: string;
    description: string;
    applicability: ResourceApplicability;
    priority: number;  // 1-10, 数字越大优先级越高
    createdAt?: string;
    updatedAt?: string;
}

/**
 * 危机热线资源
 */
export interface CrisisHotlineResource extends Resource {
    type: 'crisis_hotline';
    phone: string;
    hours: string;  // e.g., "24小时" or "9:00-21:00"
    region?: string;
    languages?: string[];
}

/**
 * 心理教育资源
 */
export interface PsychoEducationResource extends Resource {
    type: 'psycho_education';
    content: string;       // Markdown 格式的完整内容
    summary: string;       // 简短摘要（用于匹配和展示）
    category: string;      // e.g., "焦虑", "抑郁", "睡眠"
    readingTime: number;   // 预计阅读时间（分钟）
}

/**
 * 应对策略资源
 */
export interface CopingStrategyResource extends Resource {
    type: 'coping_strategy';
    technique: string;     // 技术名称
    steps: string[];       // 具体步骤
    duration: string;      // 预计用时
    difficulty: 'easy' | 'medium' | 'hard';
}

/**
 * 本地服务资源
 */
export interface LocalServiceResource extends Resource {
    type: 'local_service';
    address?: string;
    phone?: string;
    website?: string;
    serviceType: string;   // e.g., "医院", "咨询中心"
}

/**
 * 所有资源类型的联合类型
 */
export type AnyResource =
    | CrisisHotlineResource
    | PsychoEducationResource
    | CopingStrategyResource
    | LocalServiceResource;

/**
 * 检索上下文
 */
export interface RetrievalContext {
    /** 路由类型 */
    routeType: 'crisis' | 'assessment' | 'support';
    /** 风险等级 */
    riskLevel?: 'low' | 'medium' | 'high' | 'crisis' | 'unknown';
    /** 情绪信息 */
    emotion?: {
        label: string;
        score: number;
    };
    /** 从用户消息提取的主题/关键词 */
    topics?: string[];
    /** 影响分数 (0-10) */
    impactScore?: number;
    /** 用户消息（用于关键词匹配） */
    userMessage?: string;
}

/**
 * 带评分的资源
 */
export interface ScoredResource {
    resource: AnyResource;
    score: number;           // 匹配分数 (0-100)
    matchReasons: string[];  // 匹配原因（用于调试和解释）
}

/**
 * 检索结果
 */
export interface RetrievalResult {
    /** 匹配的资源列表（已排序） */
    resources: ScoredResource[];
    /** 格式化后的 Prompt 注入内容 */
    formattedContext: string;
    /** 检索耗时（毫秒） */
    retrievalTime?: number;
}

/**
 * 资源索引（用于 education/index.json 等）
 */
export interface ResourceIndex {
    version: string;
    lastUpdated: string;
    resources: Array<{
        id: string;
        file: string;
        title: string;
        category: string;
    }>;
}

/**
 * 热线数据文件格式
 */
export interface HotlinesData {
    version: string;
    lastUpdated: string;
    hotlines: CrisisHotlineResource[];
}

/**
 * 应对策略数据文件格式
 */
export interface StrategiesData {
    version: string;
    lastUpdated: string;
    strategies: CopingStrategyResource[];
}

