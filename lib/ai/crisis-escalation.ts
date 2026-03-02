import { prisma } from '@/lib/db/prisma';

/**
 * 创建危机升级记录并发送通知
 */
export async function createCrisisEscalation(params: {
    userId: string;
    conversationId: string;
    triggerMessage: string;
    riskLevel: 'urgent' | 'crisis';
    safetyScore: number;
}): Promise<string> {
    const escalation = await prisma.crisisEscalation.create({
        data: params,
    });

    // Telegram 通知（fire-and-forget）
    sendTelegramNotification(params).catch(e =>
        console.error('[CrisisEscalation] Telegram notification failed:', e)
    );

    return escalation.id;
}

/**
 * 发送 Telegram 危机通知
 */
async function sendTelegramNotification(params: {
    userId: string;
    riskLevel: string;
    triggerMessage: string;
}): Promise<void> {
    const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
    const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

    const emoji = params.riskLevel === 'crisis' ? '\u{1F6A8}' : '\u{26A0}\u{FE0F}';
    const text = `${emoji} 危机升级通知\n\n风险等级: ${params.riskLevel.toUpperCase()}\n用户ID: ${params.userId}\n触发消息: ${params.triggerMessage.slice(0, 200)}`;

    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            chat_id: TELEGRAM_CHAT_ID,
            text,
            parse_mode: 'HTML',
        }),
    });
}
