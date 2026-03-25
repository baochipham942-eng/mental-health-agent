/**
 * Eval 模块事件总线
 *
 * 解耦业务代码（lib/actions）对 eval 模块的反向依赖。
 * 业务代码只 emit 事件，eval 模块在 init.ts 中注册监听。
 */

import { EventEmitter } from 'events';

export interface EvalLowScorePayload {
  conversationId: string;
  overallScore: number;
  overallGrade: string;
  issues: string[];
}

export interface EvalEventMap {
  'evaluation:low-score': EvalLowScorePayload;
}

class EvalEventBus extends EventEmitter {
  emit<K extends keyof EvalEventMap>(event: K, payload: EvalEventMap[K]): boolean {
    return super.emit(event, payload);
  }

  on<K extends keyof EvalEventMap>(event: K, listener: (payload: EvalEventMap[K]) => void): this {
    return super.on(event, listener);
  }
}

export const evalEvents = new EvalEventBus();
