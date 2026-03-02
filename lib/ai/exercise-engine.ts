/**
 * 多轮交互练习引擎
 * breathing/meditation 保持前端 Widget 驱动（定时器型）
 * grounding/reframing/activation/empty_chair 升级为 AI 引导多轮对话
 */

export type GuidedExerciseType = 'grounding' | 'reframing' | 'activation' | 'empty_chair';
export type WidgetExerciseType = 'breathing' | 'meditation';
export type ExerciseType = GuidedExerciseType | WidgetExerciseType;

export interface ExerciseStage {
    step: number;
    instruction: string;  // AI 引导指令
    promptSuffix: string; // 注入到 system prompt 的补充上下文
}

export interface ExerciseDefinition {
    type: GuidedExerciseType;
    name: string;
    totalSteps: number;
    stages: ExerciseStage[];
    completionPrompt: string;  // 完成后的总结引导
}

// 是否为 AI 引导型练习
export function isGuidedExercise(type: string): type is GuidedExerciseType {
    return ['grounding', 'reframing', 'activation', 'empty_chair'].includes(type);
}

// =============================================================================
// 练习类型注册表
// =============================================================================

const EXERCISE_REGISTRY: Record<GuidedExerciseType, ExerciseDefinition> = {
    grounding: {
        type: 'grounding',
        name: '五感着陆',
        totalSteps: 5,
        stages: [
            {
                step: 1,
                instruction: '视觉着陆',
                promptSuffix: '引导用户观察周围环境，说出5样能看到的东西。用温和、慢节奏的语气，比如"现在，慢慢看看你的周围...能告诉我你看到了哪5样东西吗？什么颜色、什么形状都可以"'
            },
            {
                step: 2,
                instruction: '触觉着陆',
                promptSuffix: '引导用户感受4样能触摸到的东西。比如"很好，现在伸出手，摸摸你身边的东西...告诉我4样你现在能触碰到的，它们是什么质感？"'
            },
            {
                step: 3,
                instruction: '听觉着陆',
                promptSuffix: '引导用户聆听3种声音。"现在安静一下，仔细听...你能听到哪3种声音？远的、近的都算"'
            },
            {
                step: 4,
                instruction: '嗅觉着陆',
                promptSuffix: '引导用户闻2种气味。"深吸一口气...能闻到什么味道吗？告诉我2种"'
            },
            {
                step: 5,
                instruction: '味觉着陆',
                promptSuffix: '引导用户感受1种味道。"最后，感受一下嘴巴里的味道，或者喝一口水...那个味道是什么样的？"'
            }
        ],
        completionPrompt: '用户已完成五感着陆练习。温和地总结练习效果，询问现在感觉如何，是否比刚才更"回到了当下"。不要过度夸奖。'
    },

    reframing: {
        type: 'reframing',
        name: '认知重构',
        totalSteps: 4,
        stages: [
            {
                step: 1,
                instruction: '识别自动化思维',
                promptSuffix: '引导用户识别刚才的负面想法。"你刚才脑海里蹦出来的那个想法是什么？试着用一句话说出来，比如「我什么都做不好」"'
            },
            {
                step: 2,
                instruction: '检验证据',
                promptSuffix: '温和地引导用户检验这个想法的证据。"这个想法听起来很让你难受。我们一起看看——支持这个想法的证据有哪些？反驳它的证据又有哪些？"'
            },
            {
                step: 3,
                instruction: '寻找替代想法',
                promptSuffix: '引导用户寻找更平衡的替代想法。"如果你最好的朋友遇到同样的事，你会怎么跟TA说？试着用同样温柔的话对自己说"'
            },
            {
                step: 4,
                instruction: '感受变化',
                promptSuffix: '引导用户感受认知变化后的情绪变化。"现在再想想那个新的想法...和刚才相比，你的感受有什么不同吗？哪怕只有一点点变化也值得注意"'
            }
        ],
        completionPrompt: '用户已完成认知重构练习。简短总结用户发现了什么替代想法，肯定用户的勇气，提醒这种方法可以在日常中练习。'
    },

    activation: {
        type: 'activation',
        name: '行为激活',
        totalSteps: 3,
        stages: [
            {
                step: 1,
                instruction: '微小行动选择',
                promptSuffix: '用户正处于低动力状态。引导选择一个极小的行动。"我们不谈大目标。就现在这一刻——你能做到的最小的事是什么？比如：动一下手指、喝一口水、把被子往下拉一点点。选一个？"'
            },
            {
                step: 2,
                instruction: '执行与观察',
                promptSuffix: '用户已选择了一个微小行动。鼓励执行并观察感受。"好的，现在就试试看？做完后告诉我，你的身体有什么感觉？哪怕只是「还好」也行"'
            },
            {
                step: 3,
                instruction: '下一步（可选）',
                promptSuffix: '用户已完成微小行动。询问是否想再做一个稍微大一点的。"你做到了。感觉怎么样？如果你愿意，可以再试一个稍微大一点点的行动——比如坐起来，或者走到窗边。不勉强哦"'
            }
        ],
        completionPrompt: '用户已完成行为激活练习。肯定"从0到1"的突破，不要给压力。提醒用户这种微小行动积累起来会有变化。'
    },

    empty_chair: {
        type: 'empty_chair',
        name: '空椅子技术',
        totalSteps: 4,
        stages: [
            {
                step: 1,
                instruction: '设定情境',
                promptSuffix: '引导用户想象对面有一把空椅子。"想象在你对面有一把椅子，坐着的是...你心里最想对话的那个人。TA是谁？你愿意告诉我吗？"'
            },
            {
                step: 2,
                instruction: '表达未竟话语',
                promptSuffix: '鼓励用户对空椅子说话。"现在，对TA说出你一直想说但没说的话。不用顾虑措辞，就像TA真的坐在那里一样。你想说什么？"'
            },
            {
                step: 3,
                instruction: '角色互换',
                promptSuffix: '引导用户换位思考。"现在，试着坐到TA的位置上。如果你是TA，听到刚才那些话，TA可能会怎么回应？TA心里可能在想什么？"'
            },
            {
                step: 4,
                instruction: '整合与感受',
                promptSuffix: '引导用户整合体验。"回到你自己的位置。经历了这段对话，你现在的感受是什么？有什么新的理解或者释然的地方吗？"'
            }
        ],
        completionPrompt: '用户已完成空椅子练习。温和地帮助整合体验，肯定用户愿意面对这段关系的勇气。不要分析对错，只关注用户的感受。'
    }
};

// =============================================================================
// 公开 API
// =============================================================================

export function getExerciseDefinition(type: GuidedExerciseType): ExerciseDefinition {
    return EXERCISE_REGISTRY[type];
}

export function getStagePrompt(type: GuidedExerciseType, step: number): string | null {
    const def = EXERCISE_REGISTRY[type];
    if (!def) return null;

    if (step > def.totalSteps) {
        return def.completionPrompt;
    }

    const stage = def.stages.find(s => s.step === step);
    return stage?.promptSuffix || null;
}

export function buildExerciseSystemInjection(
    type: GuidedExerciseType,
    currentStep: number,
    totalSteps: number,
    metadata?: Record<string, any>
): string {
    const def = EXERCISE_REGISTRY[type];
    if (!def) return '';

    const isCompleted = currentStep > totalSteps;

    if (isCompleted) {
        return `\n\n**当前状态**：用户刚完成「${def.name}」练习。\n${def.completionPrompt}`;
    }

    const stage = def.stages.find(s => s.step === currentStep);
    if (!stage) return '';

    let injection = `\n\n**当前状态**：用户正在进行「${def.name}」练习 (第${currentStep}/${totalSteps}步 - ${stage.instruction})。\n${stage.promptSuffix}`;

    if (metadata?.previousResponses) {
        const responses = metadata.previousResponses as string[];
        if (responses.length > 0) {
            injection += `\n\n**用户之前的回答**：\n${responses.map((r, i) => `第${i + 1}步: ${r}`).join('\n')}`;
        }
    }

    return injection;
}

export function getAllExerciseTypes(): GuidedExerciseType[] {
    return Object.keys(EXERCISE_REGISTRY) as GuidedExerciseType[];
}
