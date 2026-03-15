/**
 * PHQ-9 / GAD-7 问卷系统测试
 */

import { describe, it, expect } from 'vitest';
import {
  scoreQuestionnaire,
  getNextConversationalQuestion,
  parseUserResponse,
  detectQuestionnaireRequest,
  checkQ9Crisis,
  generateResultFeedback,
  getSeverityLabel,
  PHQ9_CONFIG,
  GAD7_CONFIG,
  getQuestionnaireConfig,
} from '@/lib/ai/assessment/questionnaire';

// =============================================================================
// scoreQuestionnaire
// =============================================================================

describe('scoreQuestionnaire', () => {
  describe('PHQ-9', () => {
    it('should score 0 as minimal', () => {
      const result = scoreQuestionnaire([0, 0, 0, 0, 0, 0, 0, 0, 0], 'phq9');
      expect(result.score).toBe(0);
      expect(result.severity).toBe('minimal');
    });

    it('should score 4 as minimal (upper boundary)', () => {
      const result = scoreQuestionnaire([1, 0, 1, 0, 1, 0, 1, 0, 0], 'phq9');
      expect(result.score).toBe(4);
      expect(result.severity).toBe('minimal');
    });

    it('should score 5 as mild (lower boundary)', () => {
      const result = scoreQuestionnaire([1, 1, 1, 1, 1, 0, 0, 0, 0], 'phq9');
      expect(result.score).toBe(5);
      expect(result.severity).toBe('mild');
    });

    it('should score 9 as mild (upper boundary)', () => {
      const result = scoreQuestionnaire([1, 1, 1, 1, 1, 1, 1, 1, 1], 'phq9');
      expect(result.score).toBe(9);
      expect(result.severity).toBe('mild');
    });

    it('should score 10 as moderate', () => {
      const result = scoreQuestionnaire([2, 1, 1, 1, 1, 1, 1, 1, 1], 'phq9');
      expect(result.score).toBe(10);
      expect(result.severity).toBe('moderate');
    });

    it('should score 14 as moderate (upper boundary)', () => {
      const result = scoreQuestionnaire([2, 2, 2, 2, 2, 2, 1, 1, 0], 'phq9');
      expect(result.score).toBe(14);
      expect(result.severity).toBe('moderate');
    });

    it('should score 15 as moderately_severe', () => {
      const result = scoreQuestionnaire([2, 2, 2, 2, 2, 2, 2, 1, 0], 'phq9');
      expect(result.score).toBe(15);
      expect(result.severity).toBe('moderately_severe');
    });

    it('should score 19 as moderately_severe (upper boundary)', () => {
      const result = scoreQuestionnaire([3, 2, 2, 2, 2, 2, 2, 2, 2], 'phq9');
      expect(result.score).toBe(19);
      expect(result.severity).toBe('moderately_severe');
    });

    it('should score 20 as severe', () => {
      const result = scoreQuestionnaire([3, 3, 2, 2, 2, 2, 2, 2, 2], 'phq9');
      expect(result.score).toBe(20);
      expect(result.severity).toBe('severe');
    });

    it('should score 27 as severe (maximum)', () => {
      const result = scoreQuestionnaire([3, 3, 3, 3, 3, 3, 3, 3, 3], 'phq9');
      expect(result.score).toBe(27);
      expect(result.severity).toBe('severe');
    });

    it('should throw for wrong number of responses', () => {
      expect(() => scoreQuestionnaire([0, 0], 'phq9')).toThrow();
    });
  });

  describe('GAD-7', () => {
    it('should score 0 as minimal', () => {
      const result = scoreQuestionnaire([0, 0, 0, 0, 0, 0, 0], 'gad7');
      expect(result.score).toBe(0);
      expect(result.severity).toBe('minimal');
    });

    it('should score 4 as minimal', () => {
      const result = scoreQuestionnaire([1, 1, 1, 1, 0, 0, 0], 'gad7');
      expect(result.score).toBe(4);
      expect(result.severity).toBe('minimal');
    });

    it('should score 5 as mild', () => {
      const result = scoreQuestionnaire([1, 1, 1, 1, 1, 0, 0], 'gad7');
      expect(result.score).toBe(5);
      expect(result.severity).toBe('mild');
    });

    it('should score 10 as moderate', () => {
      const result = scoreQuestionnaire([2, 2, 2, 2, 1, 1, 0], 'gad7');
      expect(result.score).toBe(10);
      expect(result.severity).toBe('moderate');
    });

    it('should score 15 as severe', () => {
      const result = scoreQuestionnaire([3, 3, 3, 2, 2, 1, 1], 'gad7');
      expect(result.score).toBe(15);
      expect(result.severity).toBe('severe');
    });

    it('should score 21 as severe (maximum)', () => {
      const result = scoreQuestionnaire([3, 3, 3, 3, 3, 3, 3], 'gad7');
      expect(result.score).toBe(21);
      expect(result.severity).toBe('severe');
    });

    it('should throw for wrong number of responses', () => {
      expect(() => scoreQuestionnaire([0], 'gad7')).toThrow();
    });
  });
});

// =============================================================================
// parseUserResponse
// =============================================================================

describe('parseUserResponse', () => {
  it('should parse direct numbers', () => {
    expect(parseUserResponse('0')).toBe(0);
    expect(parseUserResponse('1')).toBe(1);
    expect(parseUserResponse('2')).toBe(2);
    expect(parseUserResponse('3')).toBe(3);
  });

  it('should parse numbers with 分', () => {
    expect(parseUserResponse('0分')).toBe(0);
    expect(parseUserResponse('2分')).toBe(2);
  });

  it('should parse Chinese frequency descriptions', () => {
    expect(parseUserResponse('完全不会')).toBe(0);
    expect(parseUserResponse('没有')).toBe(0);
    expect(parseUserResponse('从来没有')).toBe(0);
    expect(parseUserResponse('好几天')).toBe(1);
    expect(parseUserResponse('偶尔')).toBe(1);
    expect(parseUserResponse('有时候')).toBe(1);
    expect(parseUserResponse('一半以上')).toBe(2);
    expect(parseUserResponse('经常')).toBe(2);
    expect(parseUserResponse('几乎每天')).toBe(3);
    expect(parseUserResponse('每天都是')).toBe(3);
    expect(parseUserResponse('总是')).toBe(3);
  });

  it('should parse semantic intensity', () => {
    expect(parseUserResponse('很严重')).toBe(3);
    expect(parseUserResponse('有点')).toBe(1);
    expect(parseUserResponse('一点点')).toBe(1);
  });

  it('should return null for unparseable input', () => {
    expect(parseUserResponse('我不知道怎么回答')).toBe(null);
    expect(parseUserResponse('请再说一遍')).toBe(null);
  });
});

// =============================================================================
// detectQuestionnaireRequest
// =============================================================================

describe('detectQuestionnaireRequest', () => {
  it('should detect PHQ-9 requests', () => {
    expect(detectQuestionnaireRequest('我想做个PHQ-9评估')).toBe('phq9');
    expect(detectQuestionnaireRequest('抑郁评估')).toBe('phq9');
    expect(detectQuestionnaireRequest('测试一下我的抑郁程度')).toBe('phq9');
  });

  it('should detect GAD-7 requests', () => {
    expect(detectQuestionnaireRequest('GAD-7')).toBe('gad7');
    expect(detectQuestionnaireRequest('焦虑评估')).toBe('gad7');
    expect(detectQuestionnaireRequest('测测焦虑')).toBe('gad7');
  });

  it('should detect new trigger words', () => {
    expect(detectQuestionnaireRequest('我想做个情绪健康度检查')).toBe('phq9');
    expect(detectQuestionnaireRequest('压力自评')).toBe('gad7');
    expect(detectQuestionnaireRequest('压力指数')).toBe('gad7');
  });

  it('should NOT trigger on generic/vague words (narrowed in Pilot)', () => {
    // 这些泛化触发词已被收窄，不再自动进入评估流程
    expect(detectQuestionnaireRequest('做个评估')).toBe(null);
    expect(detectQuestionnaireRequest('心理测试')).toBe(null);
    expect(detectQuestionnaireRequest('评估一下')).toBe(null);
    expect(detectQuestionnaireRequest('做个测试')).toBe(null);
    expect(detectQuestionnaireRequest('测试一下')).toBe(null);
    expect(detectQuestionnaireRequest('了解一下自己')).toBe(null);
    expect(detectQuestionnaireRequest('测一下')).toBe(null);
    expect(detectQuestionnaireRequest('看看自己状态')).toBe(null);
  });

  it('should return null for non-assessment messages', () => {
    expect(detectQuestionnaireRequest('你好')).toBe(null);
    expect(detectQuestionnaireRequest('我今天心情不好')).toBe(null);
    expect(detectQuestionnaireRequest('帮我做个深呼吸')).toBe(null);
  });
});

// =============================================================================
// checkQ9Crisis
// =============================================================================

describe('checkQ9Crisis', () => {
  it('should trigger crisis when Q9 >= 2', () => {
    expect(checkQ9Crisis([0, 0, 0, 0, 0, 0, 0, 0, 2])).toBe(true);
    expect(checkQ9Crisis([0, 0, 0, 0, 0, 0, 0, 0, 3])).toBe(true);
  });

  it('should not trigger crisis when Q9 < 2', () => {
    expect(checkQ9Crisis([0, 0, 0, 0, 0, 0, 0, 0, 0])).toBe(false);
    expect(checkQ9Crisis([0, 0, 0, 0, 0, 0, 0, 0, 1])).toBe(false);
  });

  it('should not trigger with incomplete responses', () => {
    expect(checkQ9Crisis([0, 0, 0])).toBe(false);
  });
});

// =============================================================================
// getNextConversationalQuestion
// =============================================================================

describe('getNextConversationalQuestion', () => {
  it('should return first question with introduction', () => {
    const q = getNextConversationalQuestion(PHQ9_CONFIG, 0);
    expect(q).toContain('9 个问题');
    expect(q).toContain('(1/9)');
  });

  it('should return subsequent questions with progress', () => {
    const q = getNextConversationalQuestion(PHQ9_CONFIG, 4);
    expect(q).toContain('(5/9)');
    expect(q).not.toContain('标准化');
  });

  it('should return null when all questions answered', () => {
    const q = getNextConversationalQuestion(PHQ9_CONFIG, 9);
    expect(q).toBeNull();
  });

  it('should work for GAD-7', () => {
    const q = getNextConversationalQuestion(GAD7_CONFIG, 0);
    expect(q).toContain('7 个问题');
  });
});

// =============================================================================
// Config integrity
// =============================================================================

describe('config integrity', () => {
  it('PHQ-9 should have 9 questions', () => {
    expect(PHQ9_CONFIG.questions).toHaveLength(9);
  });

  it('GAD-7 should have 7 questions', () => {
    expect(GAD7_CONFIG.questions).toHaveLength(7);
  });

  it('all questions should have id, text, and conversational', () => {
    for (const q of [...PHQ9_CONFIG.questions, ...GAD7_CONFIG.questions]) {
      expect(q.id).toBeTruthy();
      expect(q.text).toBeTruthy();
      expect(q.conversational).toBeTruthy();
    }
  });

  it('scoring ranges should cover all possible scores', () => {
    // PHQ-9: 0-27
    for (let i = 0; i <= 27; i++) {
      const found = PHQ9_CONFIG.scoring.find(s => i >= s.range[0] && i <= s.range[1]);
      expect(found).toBeTruthy();
    }
    // GAD-7: 0-21
    for (let i = 0; i <= 21; i++) {
      const found = GAD7_CONFIG.scoring.find(s => i >= s.range[0] && i <= s.range[1]);
      expect(found).toBeTruthy();
    }
  });
});

// =============================================================================
// generateResultFeedback & getSeverityLabel
// =============================================================================

describe('generateResultFeedback', () => {
  it('should generate feedback for all severities', () => {
    const severities = ['minimal', 'mild', 'moderate', 'moderately_severe', 'severe'] as const;
    const scores = [2, 7, 12, 17, 25];

    for (let i = 0; i < severities.length; i++) {
      const feedback = generateResultFeedback(scores[i], severities[i], 'phq9');
      expect(feedback).toContain('PHQ-9');
      expect(feedback).toContain(String(scores[i]));
    }
  });
});

describe('getSeverityLabel', () => {
  it('should return correct labels', () => {
    expect(getSeverityLabel('minimal', 'phq9')).toBe('正常范围');
    expect(getSeverityLabel('mild', 'phq9')).toContain('轻度');
    expect(getSeverityLabel('moderate', 'gad7')).toContain('中度');
    expect(getSeverityLabel('severe', 'gad7')).toContain('重度');
  });
});
