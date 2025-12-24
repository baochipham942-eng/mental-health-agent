/**
 * SFBT (Solution-Focused Brief Therapy) Logic
 * 焦点解决短期治疗的核心提问生成器
 */

export interface SFBTContext {
    postScore: number; // 1-5 Scale
    exerciseName: string;
}

export function generateSFBTQuery(context: SFBTContext): string {
    const { postScore, exerciseName } = context;

    // 1-5 Scale Logic (InlineMoodRating uses 1-5)
    // 1=😣, 2=☹️, 3=😐, 4=🙂, 5=😁

    // 1. High Score (4-5) -> Assume Improvement/Good State -> EARs
    if (postScore >= 4) {
        return `(SFBT模式) 用户完成了${exerciseName}，当前情绪评分为 ${postScore}/5 (积极)。请使用"例外提问"或"评量问句"：哇！看起来状态不错。请问他是做了什么让现在的感觉比较舒服的？这说明哪部分练习对他最有效？`;
    }

    // 2. Medium Score (3) -> Neutral -> Coping
    else if (postScore === 3) {
        return `(SFBT模式) 用户完成了${exerciseName}，当前情绪评分为 3/5 (平静/一般)。请使用"应对提问"：肯定这份平静，询问他是如何做到保持平稳，没有让情绪变得更糟的？`;
    }

    // 3. Low Score (1-2) -> Distress -> Validation & Smallest Step
    else {
        return `(SFBT模式) 用户完成了${exerciseName}，当前情绪评分为 ${postScore}/5 (低落)。请使用"接纳与应对"：完全接纳他此刻的感受（不要强行以此为耻），并询问：即使感觉还没完全好，刚刚的练习里有没有哪怕一秒钟是稍微放松一点的？或者此刻能为自己做的一件最小的好事是什么？`;
    }
}
