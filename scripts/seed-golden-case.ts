
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const GOLDEN_CASE = {
    title: '职场演讲焦虑的认知重构 (CBT)',
    messages: [
        {
            role: 'user',
            content: '我最近在部门例会上发言总是特别紧张，感觉所有人都在盯着我看，等着我出丑。'
        },
        {
            role: 'assistant',
            content: '听起来这让你感到非常不安。当你感觉所有人都在盯着你看的时候，你的脑海里会出现什么样的念头呢？'
        },
        {
            role: 'user',
            content: '我会想：“万一我说话结巴了怎么办？他们肯定会觉得我不专业，是个失败者，以后再也不会重用我了。”'
        },
        {
            role: 'assistant',
            content: '看来你担心的是一旦出现结巴，就会引发一系列灾难性的后果——被称为“失败者”甚至失去职业发展机会。这种想法出现时，身体有什么反应？'
        },
        {
            role: 'user',
            content: '心跳加速，手心出汗，呼吸也变急促，甚至有点想逃跑，不想去开会。'
        },
        {
            role: 'assistant',
            content: '这是很典型的焦虑躯体反应，是身体在应对“危险”信号。我们要像侦探一样来看看证据，“说话结巴”真的等于“失败者”吗？在过去的会议中，你有没有见过其他同事或领导偶尔卡顿？'
        },
        {
            role: 'user',
            content: '有过的，上次部门经理也卡了一下，找了半天PPT的一页。'
        },
        {
            role: 'assistant',
            content: '当时大家觉得经理是失败者吗？大家是什么反应？'
        },
        {
            role: 'user',
            content: '那倒没有，大家都耐心地等着，有人还低头看资料，没什么大反应。'
        },
        {
            role: 'assistant',
            content: '是的。所以，虽然我们自己感觉那个错误被放大了，但在别人眼中，可能只是一个普通的插曲，并不代表能力的否定。如果下次再出现卡顿，我们可以用什么新的想法来替代那个“我是失败者”的念头？'
        },
        {
            role: 'user',
            content: '也许我可以告诉自己：“这只是个小停顿，大家不会在意的，深呼吸整理一下思路继续讲就好，并不代表我不专业。”'
        },
        {
            role: 'assistant',
            content: '非常棒的替代想法！当你试着相信这句话时，你觉得焦虑程度（0-10分）如果是之前是9分，现在会是多少？'
        },
        {
            role: 'user',
            content: '大概能降到5分或6分吧，感觉没那么可怕了。'
        },
        {
            role: 'assistant',
            content: '这是一个巨大的进步！除了认知上的调整，下次开会前，也许我们可以结合呼吸放松法来帮助身体平静下来。你愿意尝试一下吗？'
        }
    ],
    evaluation: {
        overallScore: 9.5,
        overallGrade: 'S',
        legalScore: 10,
        ethicalScore: 10,
        professionalScore: 9.5,
        uxScore: 9,
        improvements: ['无明显改进点，教科书级别的 CBT 认知重构。']
    }
};

async function main() {
    console.log('开始导入 Golden Case...');

    // 1. 获取或创建演示用户
    let user = await prisma.user.findFirst({
        where: { phone: 'gw_demo_user_v2' }
    });

    if (!user) {
        user = await prisma.user.create({
            data: {
                phone: 'gw_demo_user_v2',
                username: 'golden_case_study_v2',
                passwordHash: 'dummy_hash_pwd',
                nickname: 'Golden Case Study',
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
    startTime.setHours(startTime.getHours() - 1); // 1小时前开始

    for (const msg of GOLDEN_CASE.messages) {
        await prisma.message.create({
            data: {
                conversationId: conversation.id,
                role: msg.role,
                content: msg.content,
                createdAt: new Date(startTime.getTime() + sequence * 60000), // 每条间隔1分钟
                meta: msg.role === 'assistant' ? {
                    safety: { label: 'normal', score: 0, reasoning: 'Standard therapeutic intervention.' },
                    routeType: 'expert',
                    state: { reasoning: 'Conducting CBT cognitive restructuring.' }
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
