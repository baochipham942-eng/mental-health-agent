export const SKILL_CARDS = {
    breathing: {
        title: '4-7-8呼吸法',
        when: '思绪纷乱或焦虑时',
        effort: 'low' as const,
        widget: 'breathing',
        steps: [
            '找一个舒适的姿势坐好',
            '用鼻子吸气4秒',
            '屏住呼吸7秒',
            '用嘴缓慢呼气8秒',
            '重复3-4次'
        ],
    },
    meditation: {
        title: '5分钟正念冥想',
        when: '需要放松或专注时',
        effort: 'low' as const,
        widget: 'meditation',
        steps: [
            '找一个安静的地方坐下',
            '闭上眼睛，专注呼吸',
            '注意身体的感受',
            '当思绪飘走时，温柔地拉回',
            '保持5分钟'
        ],
    },
    grounding: {
        title: '五感着陆',
        when: '感到焦虑或恐慌时',
        effort: 'low' as const,
        widget: undefined,
        steps: [
            '说出你能看到的5样东西',
            '说出你能摸到的4样东西',
            '说出你能听到的3种声音',
            '说出你能闻到的2种气味',
            '说出你能尝到的1种味道'
        ],
    },
    reframing: {
        title: '认知重构练习',
        when: '当下陷入消极念头时',
        effort: 'medium' as const,
        widget: undefined,
        steps: [
            '识别当下的消极念头',
            '寻找支持这个念头的证据',
            '寻找反驳这个念头的证据',
            '尝试提出一个更平衡、客观的视角',
        ],
    },
    activation: {
        title: '行为激活小任务',
        when: '感到动力不足或情绪低落时',
        effort: 'low' as const,
        widget: undefined,
        steps: [
            '选择一件可以在5分钟内完成的小事',
            '立即去做，不要纠结感受',
            '完成后给自己一个微小的正反馈',
        ],
    },
    empty_chair: {
        title: '空椅子对话练习',
        when: '有未解的心结或强烈委屈时',
        effort: 'high' as const,
        widget: 'empty_chair',
        steps: [
            '设定对面椅子上坐着的人',
            '尽情宣泄你的真实感受',
            '互换位置，体验对方的视角',
            '重新整合你的感受'
        ],
    },
    mood_tracker: {
        title: '情绪记录',
        when: '感觉很糟但不清楚原因时',
        effort: 'low' as const,
        widget: 'mood_tracker',
        steps: [
            '停下来，觉察当下的感受',
            '选择一个最贴切的情绪词',
            '评估情绪的强烈程度',
            '记录触发情绪的想法或事件'
        ],
    },
    leaves_stream: {
        title: '溪流落叶',
        when: '反复纠结、被念头困扰时',
        effort: 'low' as const,
        widget: 'leaves_stream',
        steps: [] // Widget handles logical steps
    }
};

export type SkillType = keyof typeof SKILL_CARDS;

/**
 * 检测直接技能请求类型
 */
export function detectDirectSkillRequest(message: string): SkillType | null {
    const lowerMsg = message.toLowerCase();

    // 呼吸法
    if (/(进行|开始|我要|做个|练习|试试).*(呼吸|4.?7.?8|深呼吸)/.test(lowerMsg)) return 'breathing';
    // 冥想
    if (/(进行|开始|我要|做个|练习|试试).*(冥想|正念|静心)/.test(lowerMsg)) return 'meditation';
    // 着陆
    if (/(进行|开始|我要|做个|练习|试试).*(着陆|5.?4.?3.?2.?1)/.test(lowerMsg)) return 'grounding';
    // 重构
    if (/(进行|开始|我要|做个|练习|试试).*(认知重构|想法挑战)/.test(lowerMsg)) return 'reframing';
    // 行为激活
    if (/(进行|开始|我要|做个|练习|试试).*(行为激活|行动任务)/.test(lowerMsg)) return 'activation';
    // 空椅子
    if (/(进行|开始|我要|做个|练习|试试).*(空椅子|对话练习)/.test(lowerMsg)) return 'empty_chair';
    // 情绪记录 - 必须带有"记录"或"打卡"等动作词
    if (/(进行|开始|我要|做个|练习|打卡|试试).*(情绪记录|记录心情|心情记录|心情打卡)/.test(lowerMsg)) return 'mood_tracker';
    // 脱钩
    if (/(进行|开始|我要|做个|练习|试试).*(想法脱钩|溪流落叶|落叶练习)/.test(lowerMsg)) return 'leaves_stream';

    // 极度具体的指令
    if (/^4.?7.?8$/.test(lowerMsg)) return 'breathing';
    if (/^5.?4.?3.?2.?1$/.test(lowerMsg)) return 'grounding';

    return null;
}
