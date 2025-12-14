/**
 * Skill 系统类型定义
 */

/**
 * 风险等级
 */
export type RiskLevel = 'low' | 'medium' | 'high' | 'crisis';

/**
 * 情绪类型
 */
export type EmotionType = 'anxiety' | 'depression' | 'anger' | 'sadness' | 'fear' | 'neutral' | 'mixed';

/**
 * 持续时间
 */
export type Duration = 'days' | 'weeks' | 'months' | 'uncertain';

/**
 * 影响程度（0-10）
 */
export type ImpactLevel = number;

/**
 * Skill 适用性条件
 */
export interface SkillApplicability {
  /** 适用的风险等级（数组，至少匹配一个） */
  riskLevels?: RiskLevel[];
  /** 适用的情绪类型（数组，至少匹配一个） */
  emotions?: EmotionType[];
  /** 最小持续时间（可选） */
  minDuration?: Duration;
  /** 最小影响程度（0-10，可选） */
  minImpact?: ImpactLevel;
  /** 是否需要自伤念头信息（可选） */
  requiresRiskInfo?: boolean;
}

/**
 * Skill 槽位定义
 */
export interface SkillSlot {
  /** 槽位名称 */
  name: string;
  /** 槽位描述 */
  description: string;
  /** 默认值（可选） */
  defaultValue?: string;
  /** 槽位类型 */
  type: 'string' | 'number' | 'duration' | 'count';
}

/**
 * Skill 模板
 */
export interface SkillTemplates {
  /** 下一步清单模板（数组，每项是一个模板字符串，使用 {slotName} 占位符） */
  nextStepsLines: string[];
  /** ActionCard 模板 */
  actionCard: {
    title: string;
    steps: string[];
    when: string;
    effort: 'low' | 'medium' | 'high';
  };
}

/**
 * Skill 定义
 */
export interface Skill {
  /** Skill ID（唯一标识） */
  id: string;
  /** Skill 名称 */
  name: string;
  /** Skill 描述 */
  description: string;
  /** 标签（用于分类和搜索） */
  tags: string[];
  /** 适用性条件 */
  applicability: SkillApplicability;
  /** 槽位定义 */
  slots: SkillSlot[];
  /** 模板 */
  templates: SkillTemplates;
  /** 版本号（用于追踪和更新） */
  version?: string;
}

/**
 * 槽位值（填槽后的值）
 */
export type SlotValues = Record<string, string | number>;

/**
 * Skill 渲染结果
 */
export interface SkillRenderResult {
  /** 下一步清单（已填槽） */
  nextStepsLines: string[];
  /** ActionCard（已填槽） */
  actionCard: {
    title: string;
    steps: string[];
    when: string;
    effort: 'low' | 'medium' | 'high';
  };
}

/**
 * Skill 选择上下文（用于 select.ts）
 */
export interface SkillSelectionContext {
  /** 风险等级 */
  riskLevel: RiskLevel;
  /** 情绪类型 */
  emotion: EmotionType;
  /** 持续时间 */
  duration: Duration;
  /** 影响程度（0-10） */
  impact: ImpactLevel;
  /** 是否有自伤念头 */
  hasRiskThoughts?: boolean;
  /** 路由类型（用于兼容） */
  routeType?: 'crisis' | 'assessment' | 'support';
}

/**
 * Skill 选择结果
 */
export interface SkillSelection {
  /** 选中的 Skill ID */
  skillId: string;
  /** 选择原因 */
  reason: string;
  /** 槽位值 */
  slotValues: SlotValues;
}
