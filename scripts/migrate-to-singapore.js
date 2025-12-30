// 数据库迁移脚本：从美国东部迁移到新加坡
// 使用原始 SQL 直接连接，避免环境变量干扰
const { Client } = require('pg');

const OLD_DATABASE_URL = "postgresql://neondb_owner:npg_i4wXSFkBIW6x@ep-snowy-bird-ahi67rrf-pooler.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require";
const NEW_DATABASE_URL = "postgresql://neondb_owner:npg_TaNS79hMoRCU@ep-mute-resonance-a10pw66s-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require";

// 需要迁移的表（按依赖顺序）
const TABLES = [
    'User',
    'InvitationCode',
    'Conversation',
    'Message',
    'MessageFeedback',
    'UserMemory',
    'SessionSummary',
    'ConversationEvaluation',
    'AssessmentReport',
    'ActionPlan',
    'ExerciseLog',
    'MemoryExtractionLog',
    'PromptOptimizationLog',
    'OptimizationEvent',
    'GoldenExample'
];

async function migrate() {
    console.log('📦 开始数据迁移...\n');

    const oldClient = new Client({ connectionString: OLD_DATABASE_URL });
    const newClient = new Client({ connectionString: NEW_DATABASE_URL });

    try {
        await oldClient.connect();
        console.log('✅ 已连接旧数据库 (美国东部)');

        await newClient.connect();
        console.log('✅ 已连接新数据库 (新加坡)\n');

        for (const table of TABLES) {
            try {
                // 获取旧数据
                const result = await oldClient.query(`SELECT * FROM "${table}"`);
                const rows = result.rows;
                console.log(`📋 ${table}: 找到 ${rows.length} 条记录`);

                if (rows.length === 0) continue;

                // 获取列名
                const columns = Object.keys(rows[0]);
                const columnList = columns.map(c => `"${c}"`).join(', ');

                // 插入新数据库
                let inserted = 0;
                let skipped = 0;

                for (const row of rows) {
                    try {
                        const values = columns.map((_, i) => `$${i + 1}`).join(', ');
                        const params = columns.map(c => row[c]);

                        await newClient.query(
                            `INSERT INTO "${table}" (${columnList}) VALUES (${values}) ON CONFLICT DO NOTHING`,
                            params
                        );
                        inserted++;
                    } catch (err) {
                        skipped++;
                        if (skipped <= 3) {
                            console.log(`   ⚠️ 跳过: ${err.message.substring(0, 50)}...`);
                        }
                    }
                }

                console.log(`   ✅ 插入 ${inserted} 条, 跳过 ${skipped} 条\n`);
            } catch (err) {
                console.log(`   ⚠️ 表 ${table} 迁移失败: ${err.message}\n`);
            }
        }

        console.log('🎉 迁移完成！');

    } catch (error) {
        console.error('❌ 迁移失败:', error.message);
    } finally {
        await oldClient.end();
        await newClient.end();
    }
}

migrate();
