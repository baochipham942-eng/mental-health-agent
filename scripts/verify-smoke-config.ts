/**
 * 配置校验脚本
 * 校验关键配置，支持 warn/strict 模式
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

/**
 * 加载 .env.local 文件
 */
function loadEnvLocal() {
  const envLocalPath = path.join(process.cwd(), '.env.local');
  if (fs.existsSync(envLocalPath)) {
    const content = fs.readFileSync(envLocalPath, 'utf-8');
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      // 跳过注释和空行
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      // 解析 KEY=VALUE 格式
      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        // 移除引号（如果有）
        if ((value.startsWith('"') && value.endsWith('"')) || 
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        // 只在环境变量未设置时设置（避免覆盖已存在的环境变量）
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  }
}

// 在脚本开始时加载 .env.local
loadEnvLocal();

interface ConfigCheck {
  name: string;
  value: string | number | boolean;
  expected?: string | number | boolean | RegExp;
  severity: 'error' | 'warning';
  message: string;
}

interface ConfigFile {
  nodeVersion?: string;
  npmVersion?: string;
  model?: string;
  apiUrl?: string;
  temperature?: number;
  maxTokens?: number;
  conclusionTemperature?: number;
  conclusionMaxTokens?: number;
  smokeConclusionP50Ms?: number;
  envVars?: Record<string, string>;
}

/**
 * 读取配置文件（如果存在）
 */
function loadConfigFile(): ConfigFile | null {
  const configPath = process.env.SMOKE_EXPECTED_CONFIG_JSON || path.join(process.cwd(), 'smoke.config.json');
  
  if (fs.existsSync(configPath)) {
    try {
      const content = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.warn(`⚠️  无法读取配置文件 ${configPath}: ${error}`);
      return null;
    }
  }
  
  return null;
}

/**
 * 检查 Node/npm 版本
 */
function checkNodeNpmVersions(expectedConfig: ConfigFile | null): ConfigCheck[] {
  const checks: ConfigCheck[] = [];
  
  const nodeVersion = process.version;
  const nodeVersionMatch = nodeVersion.match(/v(\d+)\.(\d+)\.(\d+)/);
  const nodeMajor = nodeVersionMatch ? parseInt(nodeVersionMatch[1], 10) : 0;
  const nodeMinor = nodeVersionMatch ? parseInt(nodeVersionMatch[2], 10) : 0;
  
  let npmVersion = 'unknown';
  try {
    npmVersion = execSync('npm -v', { encoding: 'utf-8', stdio: 'pipe' }).trim();
  } catch (e) {
    // 忽略
  }
  
  // 检查 Node 版本（至少 18.x）
  if (nodeMajor < 18) {
    checks.push({
      name: 'node_version',
      value: nodeVersion,
      expected: '>= 18.0.0',
      severity: 'error',
      message: `Node.js 版本过低（${nodeVersion}），建议使用 >= 18.0.0`,
    });
  } else if (expectedConfig?.nodeVersion && nodeVersion !== expectedConfig.nodeVersion) {
    checks.push({
      name: 'node_version',
      value: nodeVersion,
      expected: expectedConfig.nodeVersion,
      severity: 'warning',
      message: `Node.js 版本不匹配（实际: ${nodeVersion}, 期望: ${expectedConfig.nodeVersion}）`,
    });
  }
  
  // 检查 npm 版本（至少 9.x）
  const npmVersionMatch = npmVersion.match(/(\d+)\.(\d+)\.(\d+)/);
  const npmMajor = npmVersionMatch ? parseInt(npmVersionMatch[1], 10) : 0;
  if (npmMajor < 9 && npmVersion !== 'unknown') {
    checks.push({
      name: 'npm_version',
      value: npmVersion,
      expected: '>= 9.0.0',
      severity: 'error',
      message: `npm 版本过低（${npmVersion}），建议使用 >= 9.0.0`,
    });
  } else if (expectedConfig?.npmVersion && npmVersion !== expectedConfig.npmVersion) {
    checks.push({
      name: 'npm_version',
      value: npmVersion,
      expected: expectedConfig.npmVersion,
      severity: 'warning',
      message: `npm 版本不匹配（实际: ${npmVersion}, 期望: ${expectedConfig.npmVersion}）`,
    });
  }
  
  return checks;
}

/**
 * 检查 Git 状态
 */
function checkGitStatus(): ConfigCheck[] {
  const checks: ConfigCheck[] = [];
  
  try {
    const gitStatusOutput = execSync('git status --porcelain', { encoding: 'utf-8', stdio: 'pipe' }).trim();
    const isDirty = gitStatusOutput && gitStatusOutput.length > 0;
    
    if (isDirty) {
      checks.push({
        name: 'git_status',
        value: 'dirty',
        expected: 'clean',
        severity: 'warning',
        message: 'Git 工作区有未提交的更改，可能影响测试结果的可重复性',
      });
    }
  } catch (e) {
    // 忽略 git 命令失败
  }
  
  return checks;
}

/**
 * 检查 LLM 配置
 */
function checkLLMConfig(expectedConfig: ConfigFile | null): ConfigCheck[] {
  const checks: ConfigCheck[] = [];
  
  // 从代码中读取默认值（硬编码）
  const model = process.env.DEEPSEEK_CHAT_MODEL || 'deepseek-v4-flash';
  const defaultTemperature = 0.7;
  const defaultMaxTokens = 2000;
  const conclusionTemperature = 0.3;
  const conclusionMaxTokens = 300;
  
  // API 配置
  const apiBaseUrl = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions';
  const apiKeyPresent = !!process.env.DEEPSEEK_API_KEY;
  const apiKeyValue = apiKeyPresent 
    ? `${process.env.DEEPSEEK_API_KEY!.substring(0, Math.min(8, process.env.DEEPSEEK_API_KEY!.length))}...` 
    : '[未设置]';
  
  // 检查 API Key
  if (!apiKeyPresent) {
    checks.push({
      name: 'api_key',
      value: '[未设置]',
      expected: '[已设置]',
      severity: 'error',
      message: 'DEEPSEEK_API_KEY 未设置，无法运行测试',
    });
  }
  
  // 检查配置是否匹配期望值
  if (expectedConfig) {
    if (expectedConfig.model && model !== expectedConfig.model) {
      checks.push({
        name: 'model',
        value: model,
        expected: expectedConfig.model,
        severity: 'warning',
        message: `模型不匹配（实际: ${model}, 期望: ${expectedConfig.model}）`,
      });
    }
    
    if (expectedConfig.apiUrl && apiBaseUrl !== expectedConfig.apiUrl) {
      checks.push({
        name: 'api_url',
        value: apiBaseUrl,
        expected: expectedConfig.apiUrl,
        severity: 'warning',
        message: `API URL 不匹配（实际: ${apiBaseUrl}, 期望: ${expectedConfig.apiUrl}）`,
      });
    }
    
    if (expectedConfig.conclusionTemperature !== undefined && 
        conclusionTemperature !== expectedConfig.conclusionTemperature) {
      checks.push({
        name: 'conclusion_temperature',
        value: conclusionTemperature,
        expected: expectedConfig.conclusionTemperature,
        severity: 'warning',
        message: `Conclusion Temperature 不匹配（实际: ${conclusionTemperature}, 期望: ${expectedConfig.conclusionTemperature}）`,
      });
    }
    
    if (expectedConfig.conclusionMaxTokens !== undefined && 
        conclusionMaxTokens !== expectedConfig.conclusionMaxTokens) {
      checks.push({
        name: 'conclusion_max_tokens',
        value: conclusionMaxTokens,
        expected: expectedConfig.conclusionMaxTokens,
        severity: 'warning',
        message: `Conclusion Max Tokens 不匹配（实际: ${conclusionMaxTokens}, 期望: ${expectedConfig.conclusionMaxTokens}）`,
      });
    }
  }
  
  return checks;
}

/**
 * 检查环境变量
 */
function checkEnvVars(expectedConfig: ConfigFile | null): ConfigCheck[] {
  const checks: ConfigCheck[] = [];
  
  const keyEnvVars = {
    DEBUG_PROMPTS: process.env.DEBUG_PROMPTS || '[未设置]',
    GATE_FIX: process.env.GATE_FIX !== '0' ? 'enabled (default)' : 'disabled',
    CONCLUSION_INCLUDE_HISTORY: process.env.CONCLUSION_INCLUDE_HISTORY || '[未设置]',
    SKILL_MODE: process.env.SKILL_MODE || 'off',
    SMOKE_CONCLUSION_P50_MS: process.env.SMOKE_CONCLUSION_P50_MS || '9500 (default)',
  };
  
  // 检查 SMOKE_CONCLUSION_P50_MS 阈值
  const p50Threshold = parseInt(process.env.SMOKE_CONCLUSION_P50_MS || '9500', 10);
  if (expectedConfig?.smokeConclusionP50Ms && p50Threshold !== expectedConfig.smokeConclusionP50Ms) {
    checks.push({
      name: 'smoke_conclusion_p50_ms',
      value: p50Threshold,
      expected: expectedConfig.smokeConclusionP50Ms,
      severity: 'warning',
      message: `SMOKE_CONCLUSION_P50_MS 阈值不匹配（实际: ${p50Threshold}ms, 期望: ${expectedConfig.smokeConclusionP50Ms}ms）`,
    });
  }
  
  // 检查环境变量是否匹配期望值
  if (expectedConfig?.envVars) {
    Object.entries(expectedConfig.envVars).forEach(([key, expectedValue]) => {
      const actualValue = keyEnvVars[key as keyof typeof keyEnvVars] || process.env[key] || '[未设置]';
      if (actualValue !== expectedValue) {
        checks.push({
          name: `env_${key.toLowerCase()}`,
          value: actualValue,
          expected: expectedValue,
          severity: 'warning',
          message: `环境变量 ${key} 不匹配（实际: ${actualValue}, 期望: ${expectedValue}）`,
        });
      }
    });
  }
  
  return checks;
}

/**
 * 打印配置信息
 */
function printConfiguration() {
  // Git 信息
  let gitHash = 'unknown';
  let gitStatusClean = true;
  try {
    gitHash = execSync('git rev-parse HEAD', { encoding: 'utf-8', stdio: 'pipe' }).trim();
    const gitStatusOutput = execSync('git status --porcelain', { encoding: 'utf-8', stdio: 'pipe' }).trim();
    gitStatusClean = !gitStatusOutput || gitStatusOutput.length === 0;
  } catch (e) {
    // 忽略 git 命令失败
    gitStatusClean = false;
  }

  // Node/npm 版本
  const nodeVersion = process.version;
  let npmVersion = 'unknown';
  try {
    npmVersion = execSync('npm -v', { encoding: 'utf-8', stdio: 'pipe' }).trim();
  } catch (e) {
    // 忽略 npm 命令失败
  }

  // LLM 配置
  const model = process.env.DEEPSEEK_CHAT_MODEL || 'deepseek-v4-flash';
  const defaultTemperature = 0.7;
  const defaultMaxTokens = 2000;
  const conclusionTemperature = 0.3;
  const conclusionMaxTokens = 300;

  // API 配置
  const apiBaseUrl = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions';
  const apiKeyPresent = !!process.env.DEEPSEEK_API_KEY;
  const apiKeyValue = apiKeyPresent 
    ? `${process.env.DEEPSEEK_API_KEY!.substring(0, Math.min(8, process.env.DEEPSEEK_API_KEY!.length))}...` 
    : '[未设置]';

  // 测试配置
  const smokeBaseUrl = 'http://localhost:3000/api/chat';
  const p50Threshold = parseInt(process.env.SMOKE_CONCLUSION_P50_MS || '9500', 10);

  // 环境变量
  const envVars = {
    NODE_ENV: process.env.NODE_ENV || 'undefined',
    CASE: process.env.CASE || '[未设置]',
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY ? '[已设置]' : '[未设置]',
    DEBUG_PROMPTS: process.env.DEBUG_PROMPTS || '[未设置]',
    GATE_FIX: process.env.GATE_FIX !== '0' ? 'enabled (default)' : 'disabled',
    CONCLUSION_INCLUDE_HISTORY: process.env.CONCLUSION_INCLUDE_HISTORY || '[未设置]',
    SKILL_MODE: process.env.SKILL_MODE || 'off',
    SMOKE_CONCLUSION_P50_MS: process.env.SMOKE_CONCLUSION_P50_MS || '9500 (default)',
  };

  console.log('\n' + '='.repeat(80));
  console.log('📋 配置信息');
  console.log('='.repeat(80));
  
  console.log('\n🔧 环境信息:');
  console.log(`   Node.js: ${nodeVersion}`);
  console.log(`   npm: ${npmVersion}`);
  console.log(`   Git Hash: ${gitHash}`);
  console.log(`   Git Status: ${gitStatusClean ? 'clean' : '有未提交更改'}`);
  
  console.log('\n🤖 LLM 配置:');
  console.log(`   Model: ${model}`);
  console.log(`   API URL: ${apiBaseUrl}`);
  console.log(`   API Key: ${apiKeyValue}`);
  console.log(`   默认 Temperature: ${defaultTemperature}`);
  console.log(`   默认 Max Tokens: ${defaultMaxTokens}`);
  console.log(`   Conclusion Temperature: ${conclusionTemperature}`);
  console.log(`   Conclusion Max Tokens: ${conclusionMaxTokens}`);
  
  console.log('\n🧪 测试配置:');
  console.log(`   API Base URL: ${smokeBaseUrl}`);
  console.log(`   P50 Threshold: ${p50Threshold}ms`);
  
  // 环境变量区块单独展示，突出显示 DEEPSEEK_API_KEY
  console.log('\n🔑 环境变量:');
  console.log(`   DEEPSEEK_API_KEY: ${envVars.DEEPSEEK_API_KEY}`);
  console.log(`   NODE_ENV: ${envVars.NODE_ENV}`);
  console.log(`   CASE: ${envVars.CASE}`);
  console.log(`   DEBUG_PROMPTS: ${envVars.DEBUG_PROMPTS}`);
  console.log(`   GATE_FIX: ${envVars.GATE_FIX}`);
  console.log(`   CONCLUSION_INCLUDE_HISTORY: ${envVars.CONCLUSION_INCLUDE_HISTORY}`);
  console.log(`   SKILL_MODE: ${envVars.SKILL_MODE}`);
  console.log(`   SMOKE_CONCLUSION_P50_MS: ${envVars.SMOKE_CONCLUSION_P50_MS}`);
  
  console.log('\n' + '='.repeat(80));
  console.log('');
}

/**
 * 主函数
 */
function main() {
  const strictMode = process.env.SMOKE_STRICT_CONFIG === '1';
  
  // 打印配置信息
  printConfiguration();
  
  // 加载期望配置（如果存在）
  const expectedConfig = loadConfigFile();
  if (expectedConfig) {
    console.log('📄 已加载期望配置文件\n');
  }
  
  // 执行所有检查
  const allChecks: ConfigCheck[] = [
    ...checkNodeNpmVersions(expectedConfig),
    ...checkGitStatus(),
    ...checkLLMConfig(expectedConfig),
    ...checkEnvVars(expectedConfig),
  ];
  
  // 分类错误和警告
  const errors = allChecks.filter(c => c.severity === 'error');
  const warnings = allChecks.filter(c => c.severity === 'warning');
  
  // 输出结果
  if (errors.length > 0) {
    console.log('❌ 配置错误:');
    errors.forEach(check => {
      console.log(`   - ${check.name}: ${check.message}`);
      
      // 为 DEEPSEEK_API_KEY 缺失提供可操作的修复提示
      if (check.name === 'api_key') {
        console.log('');
        console.log('   💡 如何修复:');
        console.log('');
        console.log('   【本地环境修复步骤】');
        console.log('   1. 在项目根目录创建或编辑 .env.local 文件');
        console.log('   2. 添加以下内容（替换 your_api_key_here 为你的实际 API Key）:');
        console.log('');
        console.log('      DEEPSEEK_API_KEY=your_api_key_here');
        console.log('');
        console.log('   3. 如果 npm run dev 正在运行，需要重启开发服务器:');
        console.log('      - 按 Ctrl+C 停止当前服务器');
        console.log('      - 重新运行 npm run dev');
        console.log('');
        console.log('   【CI 环境修复步骤】');
        console.log('   GitHub Actions:');
        console.log('     1. 进入仓库 Settings > Secrets and variables > Actions');
        console.log('     2. 点击 "New repository secret"');
        console.log('     3. Name: DEEPSEEK_API_KEY');
        console.log('     4. Secret: 你的 API Key');
        console.log('     5. 点击 "Add secret"');
        console.log('');
        console.log('   Vercel:');
        console.log('     1. 进入项目 Settings > Environment Variables');
        console.log('     2. 添加变量:');
        console.log('        - Key: DEEPSEEK_API_KEY');
        console.log('        - Value: 你的 API Key');
        console.log('        - Environment: Production, Preview, Development（根据需要选择）');
        console.log('     3. 点击 "Save"');
        console.log('');
        console.log('   其他 CI 系统:');
        console.log('     在 CI 系统的环境变量/Secret 配置中添加 DEEPSEEK_API_KEY');
        console.log('');
      }
    });
    console.log('');
  }
  
  if (warnings.length > 0) {
    console.log('⚠️  配置警告:');
    warnings.forEach(check => {
      console.log(`   - ${check.name}: ${check.message}`);
    });
    console.log('');
  }
  
  if (errors.length === 0 && warnings.length === 0) {
    console.log('✅ 所有配置检查通过\n');
  }
  
  // 根据模式决定是否退出
  if (strictMode && (errors.length > 0 || warnings.length > 0)) {
    console.log('❌ 严格模式：发现配置差异，退出\n');
    process.exit(1);
  } else if (errors.length > 0) {
    console.log('❌ 发现配置错误，退出\n');
    process.exit(1);
  } else {
    console.log('✅ 配置校验完成\n');
  }
}

// 运行
main();
