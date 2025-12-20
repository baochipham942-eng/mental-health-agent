/**
 * 护栏系统入口
 * 
 * 提供输入/输出安全检测能力
 */

export { guardInput, getBlockedResponse, type InputGuardResult } from './input-guard';
export { guardOutput, type OutputGuardResult } from './output-guard';
