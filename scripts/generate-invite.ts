import { prisma } from '../lib/db/prisma';
import crypto from 'crypto';

/**
 * Generate a random alphanumeric code of length 6
 * Uppercase letters and numbers, excluding confusing characters (0, O, 1, I)
 */
function generateCode(): string {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 6; i++) {
        const randomIndex = crypto.randomInt(0, chars.length);
        code += chars[randomIndex];
    }
    return code;
}

async function main() {
    const args = process.argv.slice(2);
    const count = parseInt(args[0]) || 1;
    const maxUsages = parseInt(args[1]) || 5; // Default 5 usages per code
    const daysValid = parseInt(args[2]) || 1; // Default 1 day
    const channel = args[3] || 'default';

    console.log(`Generating ${count} codes with max usages: ${maxUsages}, valid for ${daysValid} days...`);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + daysValid);

    const codes = [];

    for (let i = 0; i < count; i++) {
        let code = generateCode();
        // Simple collision check (rare for 6 chars but possible)
        while (await prisma.invitationCode.findUnique({ where: { code } })) {
            code = generateCode();
        }

        const invite = await prisma.invitationCode.create({
            data: {
                code,
                maxUsages,
                expiresAt,
                channel,
                type: 'REGISTRATION'
            }
        });
        codes.push(invite);
    }

    console.log('\n✅ Generated Invitation Codes:');
    console.table(codes.map(c => ({
        Code: c.code,
        MaxUsages: c.maxUsages,
        Expires: c.expiresAt.toLocaleString(),
        Channel: c.channel
    })));
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
