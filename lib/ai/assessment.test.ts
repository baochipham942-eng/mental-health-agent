import { describe, expect, it } from 'vitest';
import { shouldRunAssessmentStreamingClassifier } from './assessment';

describe('shouldRunAssessmentStreamingClassifier', () => {
  it('skips the classifier on early turns', () => {
    expect(shouldRunAssessmentStreamingClassifier(2, 4)).toBe(false);
    expect(shouldRunAssessmentStreamingClassifier(3, 4)).toBe(false);
  });

  it('enables the classifier after the threshold', () => {
    expect(shouldRunAssessmentStreamingClassifier(4, 4)).toBe(true);
    expect(shouldRunAssessmentStreamingClassifier(6, 4)).toBe(true);
  });
});
