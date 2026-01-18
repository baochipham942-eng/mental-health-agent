
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: process.env.DATABASE_URL,
        },
    },
    log: ['query', 'info', 'warn', 'error'],
});

async function main() {
    console.log('=== Deep Database Investigation ===\n');

    // 1. Test basic connection
    console.log('1. Testing basic connection...');
    try {
        const result = await prisma.$queryRaw`SELECT NOW() as time, current_database() as db`;
        console.log('   Connection OK:', result);
    } catch (e: any) {
        console.error('   Connection FAILED:', e.message);
        return;
    }

    // 2. Count all users
    console.log('\n2. Counting users...');
    const userCount = await prisma.user.count();
    console.log('   Total users:', userCount);

    // 3. List all users with their key fields
    console.log('\n3. Listing all users...');
    const users = await prisma.user.findMany({
        select: {
            id: true,
            username: true,
            phone: true,
            nickname: true,
            passwordHash: true,
            quickLoginToken: true,
            createdAt: true,
        }
    });

    for (const user of users) {
        console.log(`   - ${user.username} (phone: ${user.phone || 'N/A'})`);
        console.log(`     ID: ${user.id}`);
        console.log(`     Has password: ${!!user.passwordHash}`);
        console.log(`     Password hash length: ${user.passwordHash?.length || 0}`);
        console.log(`     Has quickLoginToken: ${!!user.quickLoginToken}`);
        console.log(`     Created: ${user.createdAt}`);
        console.log('');
    }

    // 4. Test password verification for a known user
    console.log('\n4. Testing password verification for user "demo"...');
    const demoUser = await prisma.user.findUnique({ where: { username: 'demo' } });
    if (demoUser) {
        console.log('   Demo user found');
        console.log('   Password hash:', demoUser.passwordHash?.substring(0, 20) + '...');

        // Test if bcrypt.compare works
        const testPassword = 'demo123'; // Common demo password
        try {
            const isValid = await bcrypt.compare(testPassword, demoUser.passwordHash);
            console.log(`   Password "demo123" valid: ${isValid}`);
        } catch (e: any) {
            console.error('   bcrypt.compare failed:', e.message);
        }
    } else {
        console.log('   Demo user NOT found');
    }

    // 5. Test finding user by phone (like login does)
    console.log('\n5. Testing findFirst with OR condition (like login)...');
    const testUsername = '18717878760'; // From screenshot
    const foundUser = await prisma.user.findFirst({
        where: {
            OR: [
                { username: testUsername },
                { phone: testUsername }
            ]
        }
    });

    if (foundUser) {
        console.log(`   User found: ${foundUser.username} (${foundUser.phone})`);
        console.log(`   Password hash exists: ${!!foundUser.passwordHash}`);
    } else {
        console.log(`   User "${testUsername}" NOT FOUND`);
    }

    // 6. Check invitation codes
    console.log('\n6. Checking invitation codes...');
    const codes = await prisma.invitationCode.findMany();
    console.log('   Total codes:', codes.length);
    for (const code of codes) {
        console.log(`   - ${code.code}: expires ${code.expiresAt}, used ${code.usedCount}/${code.maxUsages}`);
    }

    await prisma.$disconnect();
    console.log('\n=== Investigation Complete ===');
}

main().catch(console.error);
