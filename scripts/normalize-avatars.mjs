
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const AVATAR_DIR = '/Users/linchen/Downloads/ai/心理疗愈agent/public/avatars';
const TARGET_SIZE = 1024;
const PADDING = 0.15; // 15% padding on each side -> 70% content size (716px)

async function processAvatars() {
    if (!fs.existsSync(AVATAR_DIR)) {
        console.error(`Avatar directory not found: ${AVATAR_DIR}`);
        return;
    }

    const files = fs.readdirSync(AVATAR_DIR).filter(f => f.match(/\.(png|jpg|jpeg)$/i));
    console.log(`Found ${files.length} avatars to process...`);

    for (const file of files) {
        const inputPath = path.join(AVATAR_DIR, file);
        const buffer = fs.readFileSync(inputPath);

        try {
            const image = sharp(buffer);
            const metadata = await image.metadata();

            // 1. Trim whitespace (tolerance for "near white" / light shadows)
            // threshold 45 is aggressive enough for JPEG artifacts but keeps the subject
            const threshold = file.match(/\.jpg$/i) ? 45 : 20;

            const trimmed = await image
                .trim({ threshold: threshold })
                .toBuffer();

            // Log trim result for debugging
            const trimmedMeta = await sharp(trimmed).metadata();
            console.log(`   [${file}] Trimmed: ${metadata.width}x${metadata.height} -> ${trimmedMeta.width}x${trimmedMeta.height}`);

            // 2. Resize to contain within TARGET_SIZE * (1 - 2*PADDING)
            const contentSize = Math.floor(TARGET_SIZE * (1 - PADDING * 2));

            const resized = await sharp(trimmed)
                .resize({
                    width: contentSize,
                    height: contentSize,
                    fit: 'contain',
                    background: { r: 255, g: 255, b: 255, alpha: 0 } // transparent fit
                })
                .toBuffer();

            // 3. Composite onto white square
            const outputPath = path.join(AVATAR_DIR, file.replace(/\.(jpg|jpeg)$/i, '.png')); // Ensure PNG extension

            await sharp({
                create: {
                    width: TARGET_SIZE,
                    height: TARGET_SIZE,
                    channels: 4,
                    background: { r: 255, g: 255, b: 255, alpha: 1 }
                }
            })
                .composite([{ input: resized }])
                .png()
                .toFile(outputPath);

            console.log(`✅ Normalized ${file}`);

            // If extension changed (jpg -> png), delete old file
            if (path.extname(inputPath).toLowerCase() !== '.png') {
                fs.unlinkSync(inputPath);
                console.log(`   Deleted old file ${file}`);
            }

        } catch (error) {
            console.error(`❌ Failed to process ${file}:`, error);
        }
    }
}

processAvatars();
