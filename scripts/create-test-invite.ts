
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function generateCode(length: number) {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

async function main() {
    const code = generateCode(6);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 1); // Valid for 1 day

    const invite = await prisma.invitationCode.create({
        data: {
            code: code,
            maxUsages: 1, // Limit 1
            expiresAt: expiresAt,
            channel: 'TEST_CASE',
            type: 'REGISTRATION'
        }
    });

    console.log(`INVITE_CODE:${invite.code}`);
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
