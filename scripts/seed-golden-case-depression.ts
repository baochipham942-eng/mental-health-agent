
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const GOLDEN_CASE = {
    title: '抑郁情绪的行为激活 (CBT)',
    messages: [
        {
            role: 'user',
            content: '最近感觉整个人都被掏空了，什么都不想做，连刷牙都觉得累。'
        },
        {
            role: 'assistant',
            content: '听起来你现在即使是做最日常的小事也感到非常消耗，这种“被掏空”的感觉一定很难受。这种状态持续多久了？'
        },
        {
            role: 'user',
            content: '大概两周了吧。就是觉得没意义。以前喜欢的画画现在也不想动笔了。'
        },
        {
            role: 'assistant',
            content: '这种对以前喜欢的事情失去兴趣（快感缺失）是抑郁情绪很常见的表现，并不是因为你变懒了。你刚才说甚至觉得“没意义”，这种想法是一直都在吗？'
        },
        {
            role: 'user',
            content: '差不多。我觉得我就是个废人，这么简单的事情都做不到，以后肯定也没希望了。'
        },
        {
            role: 'assistant',
            content: '我听到了一个很严厉的自我评判——“废人”。你觉得是因为先有了抑郁的情绪导致做不动事，还是因为你是“废人”所以做不动事？这就像得了重感冒跑不动步一样。'
        },
        {
            role: 'user',
            content: '可能不是懒，但结果都一样，就是什么都做不成。'
        },
        {
            role: 'assistant',
            content: '结果看起来相似，但归因很重要。如果是生病了，我们需要的是照顾和康复，而不是责备。我们能不能试着做一个微小的实验，不求“做成”什么，只是动一动？'
        },
        {
            role: 'user',
            content: '那我该怎么办？我现在连床都不想下。'
        },
        {
            role: 'assistant',
            content: '那我们就不下床。看看床头有没有水杯？或者仅仅是伸展一下手指？我们在这个当下，给自己设定一个“比困难小一点点”的任务。'
        },
        {
            role: 'user',
            content: '喝杯水倒是不难，杯子就在床头。'
        },
        {
            role: 'assistant',
            content: '太好了，就这一个动作。当你喝下那口水的时候，试着去感受水的温度。这就足够了。愿意试试吗？'
        },
        {
            role: 'user',
            content: '好，我现在就喝一口。'
        },
        {
            role: 'assistant',
            content: '（等待）感觉怎么样？'
        },
        {
            role: 'user',
            content: '喝完了。感觉...喉咙湿润了一点，没那么干了。'
        },
        {
            role: 'assistant',
            content: '这一刻，你照顾了自己的身体。虽然只是一口水，但你打破了“什么都不做”的冻结状态。这就是改变的开始。我们要不要把这个小小的成功记录下来？'
        }
    ],
    evaluation: {
        overallScore: 9.3,
        overallGrade: 'S',
        legalScore: 10,
        ethicalScore: 10,
        professionalScore: 9.5,
        uxScore: 9,
        improvements: ['Behavioral Activation successfully applied. Good pacing.']
    }
};

async function main() {
    console.log('开始导入 Golden Case (Depression)...');

    // 1. 获取或创建演示用户
    let user = await prisma.user.findFirst({
        where: { phone: 'gw_demo_user_depression' }
    });

    if (!user) {
        user = await prisma.user.create({
            data: {
                phone: 'gw_demo_user_depression',
                username: 'golden_depression',
                passwordHash: 'dummy_hash_pwd',
                nickname: 'Golden Depression Case',
            }
        });
        console.log('创建了演示用户:', user.id);
    } else {
        console.log('使用现有用户:', user.id);
    }

    // 2. 创建会话
    const conversation = await prisma.conversation.create({
        data: {
            userId: user.id,
            title: GOLDEN_CASE.title,
            status: 'COMPLETED'
        }
    });
    console.log('创建了会话:', conversation.id);

    // 3. 插入消息
    let sequence = 0;
    const startTime = new Date();
    startTime.setHours(startTime.getHours() - 2);

    for (const msg of GOLDEN_CASE.messages) {
        await prisma.message.create({
            data: {
                conversationId: conversation.id,
                role: msg.role,
                content: msg.content,
                createdAt: new Date(startTime.getTime() + sequence * 60000),
                meta: msg.role === 'assistant' ? {
                    safety: { label: 'normal', score: 0, reasoning: 'Standard therapeutic intervention.' },
                    routeType: 'expert',
                    state: { reasoning: 'Conducting Behavioral Activation.' }
                } : undefined
            }
        });
        sequence++;
    }
    console.log(`插入了 ${sequence} 条消息`);

    // 4. 插入高分评估
    await prisma.conversationEvaluation.create({
        data: {
            conversationId: conversation.id,
            userId: user.id,
            overallScore: GOLDEN_CASE.evaluation.overallScore,
            overallGrade: GOLDEN_CASE.evaluation.overallGrade,

            legalScore: GOLDEN_CASE.evaluation.legalScore,
            legalIssues: [],

            ethicalScore: GOLDEN_CASE.evaluation.ethicalScore,
            ethicalIssues: [],

            professionalScore: GOLDEN_CASE.evaluation.professionalScore,
            professionalIssues: [],

            uxScore: GOLDEN_CASE.evaluation.uxScore,
            uxIssues: [],

            improvements: GOLDEN_CASE.evaluation.improvements,

            reviewStatus: 'ADOPTED',
            reviewedAt: new Date(),
            reviewedBy: 'Expert Panel'
        }
    });
    console.log('插入了 Golden Evaluation');

    console.log('Done!');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
