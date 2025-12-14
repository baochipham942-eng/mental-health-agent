/**
 * Skill 注册表
 * 包含所有可用的 Skills
 */

import { Skill } from './types';

/**
 * 所有注册的 Skills
 */
export const SKILLS: Skill[] = [
  // 1. 呼吸放松（基础稳定化技能）
  {
    id: 'breathing-relaxation',
    name: '呼吸放松',
    description: '通过深呼吸练习帮助缓解焦虑和压力',
    tags: ['breathing', 'relaxation', 'grounding', 'self-care'],
    applicability: {
      riskLevels: ['low', 'medium'],
      emotions: ['anxiety', 'fear'],
      minImpact: 3,
    },
    slots: [
      { name: 'breathCount', description: '呼吸次数', type: 'count', defaultValue: '5' },
      { name: 'breathDuration', description: '每次呼吸时长（秒）', type: 'number', defaultValue: '4' },
      { name: 'practiceDuration', description: '练习持续时间（天）', type: 'duration', defaultValue: '7' },
      { name: 'triggerTime', description: '触发时机', type: 'string', defaultValue: '当焦虑情绪出现时' },
    ],
    templates: {
      nextStepsLines: [
        '{triggerTime}，进行呼吸练习{breathDuration}秒×{breathCount}次，持续{practiceDuration}天；完成标准：至少5次。',
      ],
      actionCard: {
        title: '呼吸稳定练习',
        steps: [
          '吸气{breathDuration}秒×{breathCount}次',
          '呼气{breathDuration}秒×{breathCount}次',
          '重复{practiceDuration}天×1轮',
        ],
        when: '{triggerTime}',
        effort: 'low',
      },
    },
  },

  // 2. 正念觉察（中等强度稳定化）
  {
    id: 'mindfulness-grounding',
    name: '正念觉察',
    description: '通过正念练习增强自我觉察能力',
    tags: ['mindfulness', 'grounding', 'self-care'],
    applicability: {
      riskLevels: ['low', 'medium'],
      emotions: ['anxiety', 'depression', 'mixed'],
      minImpact: 4,
    },
    slots: [
      { name: 'duration', description: '练习时长（分钟）', type: 'number', defaultValue: '5' },
      { name: 'frequency', description: '练习频率（次/天）', type: 'count', defaultValue: '2' },
      { name: 'practiceDays', description: '持续天数', type: 'duration', defaultValue: '7' },
      { name: 'triggerTime', description: '触发时机', type: 'string', defaultValue: '白天任意时段' },
    ],
    templates: {
      nextStepsLines: [
        '{triggerTime}进行{duration}分钟正念冥想，每天{frequency}次，持续{practiceDays}天；完成标准：至少10次。',
      ],
      actionCard: {
        title: '正念觉察练习',
        steps: [
          '坐下专注呼吸{duration}分钟',
          '观察思绪不评判×1次',
          '记录觉察感受×{frequency}次',
          '持续{practiceDays}天',
        ],
        when: '{triggerTime}',
        effort: 'medium',
      },
    },
  },

  // 3. 情绪记录（症状追踪）
  {
    id: 'emotion-tracking',
    name: '情绪记录',
    description: '通过记录情绪帮助识别模式和触发因素',
    tags: ['tracking', 'journaling', 'self-care'],
    applicability: {
      riskLevels: ['low', 'medium'],
      emotions: ['anxiety', 'depression', 'mixed'],
      minImpact: 4,
    },
    slots: [
      { name: 'itemCount', description: '记录条目数', type: 'count', defaultValue: '3' },
      { name: 'frequency', description: '记录频率（次/天）', type: 'count', defaultValue: '1' },
      { name: 'trackingDays', description: '追踪天数', type: 'duration', defaultValue: '7' },
      { name: 'triggerTime', description: '触发时机', type: 'string', defaultValue: '每晚睡前' },
    ],
    templates: {
      nextStepsLines: [
        '{triggerTime}记录{itemCount}条情绪感受×{frequency}次，持续{trackingDays}天；完成标准：至少5天。',
      ],
      actionCard: {
        title: '情绪记录练习',
        steps: [
          '写下{itemCount}条情绪×{frequency}次',
          '标记{itemCount}项触发因素×1次',
          '评分情绪强度0-10分×1次',
          '持续{trackingDays}天观察',
        ],
        when: '{triggerTime}',
        effort: 'low',
      },
    },
  },

  // 4. 想法记录（认知重构准备）
  {
    id: 'thought-recording',
    name: '想法记录',
    description: '记录负面想法，为认知重构做准备',
    tags: ['cognition', 'journaling', 'self-care'],
    applicability: {
      riskLevels: ['low', 'medium'],
      emotions: ['anxiety', 'depression'],
      minImpact: 5,
    },
    slots: [
      { name: 'thoughtCount', description: '想法条数', type: 'count', defaultValue: '3' },
      { name: 'recordingFrequency', description: '记录频率（次/天）', type: 'count', defaultValue: '1' },
      { name: 'practiceDays', description: '练习天数', type: 'duration', defaultValue: '7' },
      { name: 'triggerTime', description: '触发时机', type: 'string', defaultValue: '当负面想法出现时' },
    ],
    templates: {
      nextStepsLines: [
        '{triggerTime}写下{thoughtCount}条具体担心×{recordingFrequency}次，持续{practiceDays}天；完成标准：至少记录5次。',
      ],
      actionCard: {
        title: '想法记录练习',
        steps: [
          '写下{thoughtCount}条担心×{recordingFrequency}次',
          '标记1项可行动项×1次',
          '记录1条替代想法×1次',
          '持续{practiceDays}天观察',
        ],
        when: '{triggerTime}',
        effort: 'medium',
      },
    },
  },

  // 5. 身体觉察（grounding 技术）
  {
    id: 'body-awareness',
    name: '身体觉察',
    description: '通过身体觉察练习增强当下感',
    tags: ['grounding', 'body', 'self-care'],
    applicability: {
      riskLevels: ['low', 'medium'],
      emotions: ['anxiety', 'fear', 'mixed'],
      minImpact: 4,
    },
    slots: [
      { name: 'duration', description: '练习时长（分钟）', type: 'number', defaultValue: '3' },
      { name: 'frequency', description: '练习频率（次/天）', type: 'count', defaultValue: '2' },
      { name: 'practiceDays', description: '持续天数', type: 'duration', defaultValue: '5' },
      { name: 'triggerTime', description: '触发时机', type: 'string', defaultValue: '当感到紧张时' },
    ],
    templates: {
      nextStepsLines: [
        '{triggerTime}进行{duration}分钟身体扫描，每天{frequency}次，持续{practiceDays}天；完成标准：至少8次。',
      ],
      actionCard: {
        title: '身体觉察练习',
        steps: [
          '从头到脚扫描身体{duration}分钟',
          '标记3个紧张部位×1次',
          '深呼吸放松×5次',
          '持续{practiceDays}天',
        ],
        when: '{triggerTime}',
        effort: 'low',
      },
    },
  },

  // 6. 求助准备（中等风险支持）
  {
    id: 'support-preparation',
    name: '求助准备',
    description: '帮助用户准备向他人求助',
    tags: ['support', 'social', 'medium-risk'],
    applicability: {
      riskLevels: ['medium'],
      emotions: ['depression', 'anxiety', 'mixed'],
      minImpact: 6,
    },
    slots: [
      { name: 'contactCount', description: '联系人数量', type: 'count', defaultValue: '1' },
      { name: 'messageCount', description: '消息条数', type: 'count', defaultValue: '1' },
      { name: 'triggerTime', description: '触发时机', type: 'string', defaultValue: '本周内' },
    ],
    templates: {
      nextStepsLines: [
        '{triggerTime}向{contactCount}位信任的人发{messageCount}条求助消息；完成标准：至少发送{messageCount}条。',
      ],
      actionCard: {
        title: '求助准备',
        steps: [
          '列出{contactCount}位信任联系人×1次',
          '写下{messageCount}条求助短信×1次',
          '发送给{contactCount}人×1次',
          '记录对方回应×1次',
        ],
        when: '{triggerTime}',
        effort: 'medium',
      },
    },
  },

  // 7. 就医准备（高风险/urgent）
  {
    id: 'medical-preparation',
    name: '就医准备',
    description: '帮助用户准备专业医疗评估',
    tags: ['medical', 'urgent', 'high-risk'],
    applicability: {
      riskLevels: ['high'],
      emotions: ['depression', 'anxiety', 'mixed'],
      minImpact: 7,
    },
    slots: [
      { name: 'preparationDays', description: '准备天数', type: 'duration', defaultValue: '3' },
      { name: 'itemCount', description: '准备项数量', type: 'count', defaultValue: '3' },
      { name: 'triggerTime', description: '触发时机', type: 'string', defaultValue: '本周内' },
    ],
    templates: {
      nextStepsLines: [
        '{triggerTime}整理{itemCount}项就医材料，在{preparationDays}天内完成预约；完成标准：至少完成预约。',
      ],
      actionCard: {
        title: '就医准备',
        steps: [
          '列出{itemCount}项症状清单×1次',
          '标记{itemCount}项就医材料×1次',
          '查找1家医院联系方式×1次',
          '{preparationDays}天内完成预约',
        ],
        when: '{triggerTime}',
        effort: 'high',
      },
    },
  },

  // 8. 紧急稳定化（crisis 前准备）
  {
    id: 'crisis-stabilization',
    name: '紧急稳定化',
    description: '危机情况下的紧急稳定化技能',
    tags: ['crisis', 'urgent', 'stabilization'],
    applicability: {
      riskLevels: ['high', 'crisis'],
      emotions: ['anxiety', 'depression', 'mixed'],
      minImpact: 8,
    },
    slots: [
      { name: 'breathCount', description: '呼吸次数', type: 'count', defaultValue: '5' },
      { name: 'contactCount', description: '联系人数量', type: 'count', defaultValue: '1' },
      { name: 'triggerTime', description: '触发时机', type: 'string', defaultValue: '当感到失控时' },
    ],
    templates: {
      nextStepsLines: [
        '{triggerTime}立即进行呼吸练习{breathCount}次，并联系{contactCount}位信任的人；完成标准：完成呼吸练习并发送求助。',
      ],
      actionCard: {
        title: '紧急稳定化',
        steps: [
          '深呼吸{breathCount}次×1次',
          '联系{contactCount}位信任人×1次',
          '拨打热线电话×1次',
          '离开危险环境×1次',
        ],
        when: '{triggerTime}',
        effort: 'low',
      },
    },
  },
];

/**
 * 根据 ID 查找 Skill
 */
export function getSkillById(id: string): Skill | undefined {
  return SKILLS.find(skill => skill.id === id);
}

/**
 * 获取所有 Skills
 */
export function getAllSkills(): Skill[] {
  return SKILLS;
}
