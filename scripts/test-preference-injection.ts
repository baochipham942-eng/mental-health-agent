
import { buildSystemPrompt } from '../lib/ai/persona-manager';

const base = "BASE PROMPT";
const mode = "coach";
const prefs = ["Don't use metaphors", "Be direct"];

const result = buildSystemPrompt(base, mode, prefs);

console.log('----- Result -----');
console.log(result);
console.log('------------------');

if (result.includes('[USER PREFERENCES & CONSTRAINTS]') &&
    result.includes("Don't use metaphors") &&
    result.includes("Be direct")) {
    console.log("✅ YES: Preferences injected.");
} else {
    console.log("❌ NO: Preferences missing.");
    process.exit(1);
}
