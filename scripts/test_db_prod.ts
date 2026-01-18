
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: process.env.DATABASE_URL,
        },
    },
    log: ['info', 'query', 'warn', 'error'],
});

async function main() {
    console.log('Testing DB connection...');
    try {
        const userCount = await prisma.user.count();
        console.log(`Connection successful. User count: ${userCount}`);
    } catch (error: any) {
        console.error('DB Connection failed!');
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Error code:', error.code);
        if (error.meta) {
            console.error('Error meta:', error.meta);
        }
    } finally {
        await prisma.$disconnect();
    }
}

main();
