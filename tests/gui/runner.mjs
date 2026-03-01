/**
 * GUI 测试运行器
 *
 * 封装 GUIAgent 的通用测试执行逻辑：
 * - 步骤记录与日志
 * - 超时控制
 * - 结果汇总与断言
 */

import { GUIAgent, StatusEnum } from '@ui-tars/sdk';
import { NutJSOperator } from '@ui-tars/operator-nut-js';
import { getModelConfig, GUI_DEFAULTS } from './config.mjs';

/**
 * @typedef {Object} TestStep
 * @property {number} step
 * @property {string} action
 * @property {string} thought
 * @property {string} rawValue
 */

/**
 * @typedef {Object} TestResult
 * @property {boolean} success
 * @property {string} status - end | error | max_loop | user_stopped
 * @property {TestStep[]} steps
 * @property {number} durationMs
 * @property {string} [errorMsg]
 */

/**
 * 执行一个 GUI 测试用例
 *
 * @param {string} name - 测试名称
 * @param {string} instruction - 自然语言指令
 * @param {Object} [options]
 * @param {number} [options.maxLoopCount]
 * @param {number} [options.timeoutMs]
 * @param {(steps: TestStep[]) => boolean} [options.validate] - 自定义验证函数
 * @returns {Promise<TestResult>}
 */
export async function runGUITest(name, instruction, options = {}) {
    const {
        maxLoopCount = GUI_DEFAULTS.maxLoopCount,
        timeoutMs = GUI_DEFAULTS.timeoutMs,
        validate,
    } = options;

    console.log(`\n${'='.repeat(60)}`);
    console.log(`GUI 测试: ${name}`);
    console.log(`指令: ${instruction}`);
    console.log(`${'='.repeat(60)}\n`);

    const steps = [];
    let stepCount = 0;
    let finalStatus = 'unknown';
    let errorMsg = '';
    const startTime = Date.now();

    const abortController = new AbortController();
    const timeout = setTimeout(() => {
        console.log(`\n[超时] ${timeoutMs / 1000}s 已到，停止执行`);
        abortController.abort();
    }, timeoutMs);

    const operator = new NutJSOperator();

    const guiAgent = new GUIAgent({
        model: getModelConfig(),
        operator,
        signal: abortController.signal,
        maxLoopCount,
        loopIntervalInMs: GUI_DEFAULTS.loopIntervalInMs,

        onData: ({ data }) => {
            if (data.status === StatusEnum.RUNNING && data.conversations.length > 0) {
                for (const conv of data.conversations) {
                    stepCount++;
                    if (conv.from === 'human' && conv.screenshotBase64) {
                        const size = conv.screenshotContext?.size;
                        console.log(`  [${stepCount}] 截屏 (${size?.width}x${size?.height})`);
                    } else if (conv.from === 'gpt') {
                        const parsed = conv.predictionParsed?.[0];
                        const action = parsed?.action_type || 'unknown';
                        const thought = parsed?.thought || '';
                        console.log(`  [${stepCount}] ${action} - ${thought.substring(0, 100)}`);

                        steps.push({
                            step: stepCount,
                            action,
                            thought,
                            rawValue: conv.value?.substring(0, 300) || '',
                        });
                    }
                }
            }

            if ([StatusEnum.END, StatusEnum.ERROR, StatusEnum.MAX_LOOP, StatusEnum.USER_STOPPED].includes(data.status)) {
                finalStatus = data.status;
                if (data.errMsg) errorMsg = data.errMsg;
            }
        },

        onError: ({ error }) => {
            errorMsg = error.message || String(error);
            console.error(`  [错误] ${errorMsg}`);
        },
    });

    try {
        await guiAgent.run(instruction);
    } catch (err) {
        if (!errorMsg) errorMsg = err.message;
        console.error(`  [异常] ${err.message}`);
    } finally {
        clearTimeout(timeout);
    }

    const durationMs = Date.now() - startTime;
    const success = finalStatus === StatusEnum.END;

    // 自定义验证
    let validationPassed = true;
    if (validate && success) {
        validationPassed = validate(steps);
    }

    // 汇总
    console.log(`\n--- 测试结果: ${name} ---`);
    console.log(`  状态: ${finalStatus} ${success ? '(通过)' : '(失败)'}`);
    console.log(`  步数: ${steps.length}`);
    console.log(`  耗时: ${(durationMs / 1000).toFixed(1)}s`);
    if (errorMsg) console.log(`  错误: ${errorMsg}`);
    if (validate) console.log(`  验证: ${validationPassed ? '通过' : '失败'}`);
    console.log('');

    return {
        success: success && validationPassed,
        status: finalStatus,
        steps,
        durationMs,
        errorMsg: errorMsg || undefined,
    };
}

/**
 * 批量执行 GUI 测试
 *
 * @param {Array<{name: string, instruction: string, options?: Object}>} tests
 * @returns {Promise<{passed: number, failed: number, results: TestResult[]}>}
 */
export async function runGUITestSuite(tests) {
    console.log(`\n${'#'.repeat(60)}`);
    console.log(`# GUI 测试套件 - ${tests.length} 个用例`);
    console.log(`${'#'.repeat(60)}`);

    const results = [];
    for (const test of tests) {
        const result = await runGUITest(test.name, test.instruction, test.options);
        results.push({ ...test, result });
    }

    const passed = results.filter(r => r.result.success).length;
    const failed = results.length - passed;

    console.log(`\n${'#'.repeat(60)}`);
    console.log(`# 总结: ${passed} 通过, ${failed} 失败 (共 ${results.length})`);
    console.log(`${'#'.repeat(60)}`);
    for (const r of results) {
        const icon = r.result.success ? '  PASS' : '  FAIL';
        console.log(`${icon} | ${r.name} (${(r.result.durationMs / 1000).toFixed(1)}s, ${r.result.steps.length} 步)`);
    }
    console.log('');

    return { passed, failed, results };
}
