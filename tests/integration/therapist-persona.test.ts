/**
 * 治疗师角色系统测试
 */

import { describe, it, expect } from 'vitest';
import {
  THERAPIST_PROFILES,
  getTherapistProfile,
  getTherapistVoice,
  getRandomTherapist,
} from '@/lib/ai/persona/therapist-profiles';
import { buildSystemPrompt, type AdaptiveMode } from '@/lib/ai/persona-manager';

// =============================================================================
// Profile 完整性
// =============================================================================

describe('THERAPIST_PROFILES', () => {
  it('should have exactly 3 profiles', () => {
    expect(THERAPIST_PROFILES).toHaveLength(3);
  });

  it('all profiles should have required fields', () => {
    for (const p of THERAPIST_PROFILES) {
      expect(p.id).toBeTruthy();
      expect(p.name).toBeTruthy();
      expect(p.avatar).toBeTruthy();
      expect(p.style).toBeTruthy();
      expect(p.approach).toBeTruthy();
      expect(p.voiceTone).toBeTruthy();
      expect(p.greeting).toBeTruthy();
      expect(p.description).toBeTruthy();
    }
  });

  it('should have unique IDs', () => {
    const ids = THERAPIST_PROFILES.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('should have unique styles', () => {
    const styles = THERAPIST_PROFILES.map(p => p.style);
    expect(new Set(styles).size).toBe(styles.length);
  });

  it('profiles should match expected IDs', () => {
    const ids = THERAPIST_PROFILES.map(p => p.id);
    expect(ids).toContain('xiaowarm');
    expect(ids).toContain('mingyuan');
    expect(ids).toContain('qinghe');
  });
});

// =============================================================================
// getTherapistProfile
// =============================================================================

describe('getTherapistProfile', () => {
  it('should return profile for valid ID', () => {
    const profile = getTherapistProfile('xiaowarm');
    expect(profile).toBeDefined();
    expect(profile!.name).toBe('小温');
    expect(profile!.style).toBe('warm');
  });

  it('should return undefined for invalid ID', () => {
    expect(getTherapistProfile('nonexistent')).toBeUndefined();
  });
});

// =============================================================================
// getTherapistVoice
// =============================================================================

describe('getTherapistVoice', () => {
  it('should return voice prompt for valid ID', () => {
    const voice = getTherapistVoice('mingyuan');
    expect(voice).toContain('明远');
    expect(voice).toContain('THERAPIST PERSONA');
  });

  it('should return empty string for invalid ID', () => {
    expect(getTherapistVoice('nonexistent')).toBe('');
  });
});

// =============================================================================
// getRandomTherapist
// =============================================================================

describe('getRandomTherapist', () => {
  it('should return a valid profile', () => {
    const profile = getRandomTherapist();
    expect(profile).toBeDefined();
    expect(profile.id).toBeTruthy();
    const ids = THERAPIST_PROFILES.map(p => p.id);
    expect(ids).toContain(profile.id);
  });
});

// =============================================================================
// buildSystemPrompt with therapist integration
// =============================================================================

describe('buildSystemPrompt with therapist', () => {
  const basePrompt = '你是心理咨询师';
  const modes: AdaptiveMode[] = ['guardian', 'companion', 'guide', 'coach'];
  const therapistIds = ['xiaowarm', 'mingyuan', 'qinghe'];

  it('should work without therapist (backward compatible)', () => {
    const result = buildSystemPrompt(basePrompt, 'companion');
    expect(result).toContain(basePrompt);
    expect(result).toContain('COMPANION');
  });

  it('should work with undefined therapist', () => {
    const result = buildSystemPrompt(basePrompt, 'companion', undefined);
    expect(result).toContain(basePrompt);
  });

  it('should inject therapist voice when provided', () => {
    const result = buildSystemPrompt(basePrompt, 'companion', 'xiaowarm');
    expect(result).toContain(basePrompt);
    expect(result).toContain('COMPANION');
    expect(result).toContain('小温');
    expect(result).toContain('THERAPIST PERSONA');
  });

  // 12 种组合测试: 4 modes × 3 therapists
  describe('all mode × therapist combinations', () => {
    for (const mode of modes) {
      for (const therapistId of therapistIds) {
        it(`${mode} + ${therapistId} should produce valid prompt`, () => {
          const result = buildSystemPrompt(basePrompt, mode, therapistId);
          expect(result).toContain(basePrompt);
          expect(result).toContain(mode.toUpperCase());

          const profile = getTherapistProfile(therapistId)!;
          expect(result).toContain(profile.name);
        });
      }
    }
  });

  it('should include user preferences when provided', () => {
    const prefs = ['不要用"我理解"', '多用比喻'];
    const result = buildSystemPrompt(basePrompt, 'companion', 'xiaowarm', prefs);
    expect(result).toContain('不要用"我理解"');
    expect(result).toContain('多用比喻');
    expect(result).toContain('PREFERENCES');
  });
});
