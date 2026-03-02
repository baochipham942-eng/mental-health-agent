/**
 * 工具定义系统
 * UI_TOOLS (OpenAI 格式) 为唯一真理源，SDK_TOOLS 自动推导生成
 */
import { z, type ZodTypeAny } from 'zod';
import { tool } from 'ai';

// =============================================================================
// UI_TOOLS — 唯一真理源 (OpenAI function calling 格式)
// =============================================================================

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
                                widget: { type: 'string', enum: ['mood_tracker', 'breathing', 'meditation'] }
                            },
                            required: ['title', 'steps', 'when', 'effort']
                        },
                        description: '配套的行动建议卡片'
                    }
                },
                required: ['summary', 'riskAndTriage', 'nextStepList', 'actionCards']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'recommend_skill_card',
            description: '向用户推荐心理调节技能卡片（Action Card）。支持的技能类型：1.呼吸练习(breathing) 2.正念冥想(meditation) 3.空椅子技术(empty_chair, 用于处理未竟情感) 4.情绪记录(mood_tracker)。当用户症状匹配时主动调用。',
            parameters: {
                type: 'object',
                properties: {
                    card: {
                        type: 'object',
                        properties: {
                            title: { type: 'string', description: '卡片标题，如"4-7-8呼吸法"' },
                            steps: { type: 'array', items: { type: 'string' }, description: '简练的步骤列表，每步不超过15字' },
                            when: { type: 'string', description: '适用场景，如"焦虑时"' },
                            effort: { type: 'string', enum: ['low', 'medium', 'high'], description: '所需精力' },
                            widget: { type: 'string', enum: ['mood_tracker', 'breathing', 'meditation', 'empty_chair'], description: '关联的交互组件' }
                        },
                        required: ['title', 'steps', 'when', 'effort']
                    }
                },
                required: ['card']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'start_guided_exercise',
            description: '启动AI引导的多轮交互练习。适用于需要AI逐步引导的练习类型：grounding(五感着陆)、reframing(认知重构)、activation(行为激活)、empty_chair(空椅子技术)。',
            parameters: {
                type: 'object',
                properties: {
                    exerciseType: {
                        type: 'string',
                        enum: ['grounding', 'reframing', 'activation', 'empty_chair'],
                        description: '练习类型'
                    },
                    context: {
                        type: 'string',
                        description: '触发练习的上下文（用户当前困扰）'
                    }
                },
                required: ['exerciseType']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'continue_exercise',
            description: '继续进行中的多轮交互练习，推进到下一步骤。',
            parameters: {
                type: 'object',
                properties: {
                    exerciseId: {
                        type: 'string',
                        description: '练习状态ID'
                    },
                    userResponse: {
                        type: 'string',
                        description: '用户对当前步骤的回应'
                    },
                    nextStep: {
                        type: 'integer',
                        description: '下一步骤编号'
                    }
                },
                required: ['exerciseId', 'userResponse', 'nextStep']
            }
        }
    }
] as const;

// 类型辅助
export type UITool = (typeof UI_TOOLS)[number];
export type UIToolName = UITool['function']['name'];

// =============================================================================
// JSON Schema → Zod 自动转换器
// =============================================================================

type JsonSchemaProperty = {
    type?: string;
    enum?: readonly string[];
    description?: string;
    items?: JsonSchemaProperty;
    properties?: Record<string, JsonSchemaProperty>;
    required?: readonly string[];
};

function jsonSchemaToZod(schema: JsonSchemaProperty, isRequired: boolean = true): ZodTypeAny {
    let zodType: ZodTypeAny;

    switch (schema.type) {
        case 'string':
            zodType = schema.enum
                ? z.enum(schema.enum as [string, ...string[]])
                : z.string();
            break;
        case 'integer':
        case 'number':
            zodType = z.number();
            break;
        case 'boolean':
            zodType = z.boolean();
            break;
        case 'array':
            zodType = z.array(schema.items ? jsonSchemaToZod(schema.items) : z.any());
            break;
        case 'object': {
            if (!schema.properties) {
                zodType = z.object({});
                break;
            }
            const shape: Record<string, ZodTypeAny> = {};
            const requiredFields = new Set(schema.required || []);
            for (const [key, prop] of Object.entries(schema.properties)) {
                shape[key] = jsonSchemaToZod(prop, requiredFields.has(key));
            }
            zodType = z.object(shape);
            break;
        }
        default:
            zodType = z.any();
    }

    if (schema.description) {
        zodType = zodType.describe(schema.description);
    }

    if (!isRequired) {
        zodType = zodType.optional();
    }

    return zodType;
}

// =============================================================================
// SDK_TOOLS — 从 UI_TOOLS 自动推导 (Vercel AI SDK 格式)
// =============================================================================

function deriveSDKTools(): Record<string, ReturnType<typeof tool>> {
    const result: Record<string, ReturnType<typeof tool>> = {};

    for (const uiTool of UI_TOOLS) {
        const { name, description, parameters } = uiTool.function;
        const requiredFields = new Set<string>(parameters.required as unknown as string[] || []);
        const shape: Record<string, ZodTypeAny> = {};

        for (const [key, prop] of Object.entries(parameters.properties as Record<string, JsonSchemaProperty>)) {
            shape[key] = jsonSchemaToZod(prop, requiredFields.has(key));
        }

        result[name] = tool({
            description,
            parameters: z.object(shape),
        });
    }

    return result;
}

export const SDK_TOOLS = deriveSDKTools();
