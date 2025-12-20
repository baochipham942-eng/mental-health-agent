/**
 * UI 相关的工具定义
 */

export const UI_TOOLS = [
    {
        type: 'function',
        function: {
            name: 'show_quick_replies',
            description: '在对话框中展示快捷回复按钮。用于需要用户进行明确选项选择的场景，如 0-10 量表评分、三选一风险确认等。',
            parameters: {
                type: 'object',
                properties: {
                    mode: {
                        type: 'string',
                        enum: ['riskChoice', 'scale0to10', 'optionChoice'],
                        description: '快捷回复的模式：riskChoice (自伤风险选择), scale0to10 (0-10评分量表), optionChoice (自定义选项选择)'
                    },
                    options: {
                        type: 'array',
                        items: { type: 'string' },
                        description: '在 optionChoice 模式下显示的自定义选项内容'
                    }
                },
                required: ['mode']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'render_assessment_report',
            description: '生成并渲染完整的心理评估初筛报告。当已收集完 SCEB 要素并准备结束正式评估时调用。',
            parameters: {
                type: 'object',
                properties: {
                    summary: {
                        type: 'string',
                        description: '初筛总结，包含主诉、持续时间、影响程度'
                    },
                    riskAndTriage: {
                        type: 'string',
                        description: '风险评估与分流建议：crisis/urgent/self-care'
                    },
                    nextStepList: {
                        type: 'array',
                        items: { type: 'string' },
                        description: '2-3 条下一步的具体建议清单'
                    },
                    actionCards: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                title: { type: 'string' },
                                steps: { type: 'array', items: { type: 'string' } },
                                when: { type: 'string' },
                                effort: { type: 'string', enum: ['low', 'medium', 'high'] },
                                widget: { type: 'string', enum: ['mood_tracker', 'breathing'] }
                            },
                            required: ['title', 'steps', 'when', 'effort']
                        },
                        description: '配套的行动建议卡片'
                    }
                },
                required: ['summary', 'riskAndTriage', 'nextStepList', 'actionCards']
            }
        }
    }
];
