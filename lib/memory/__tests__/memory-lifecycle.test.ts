/**
 * 记忆系统完整生命周期 E2E 测试
 *
 * 覆盖：提取 → 候选保存 → 合并去重 → 上下文注入 → 会话摘要 → Session Metadata
 * Mock 层：Prisma DB + LLM API，保留全部业务逻辑
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ====== Mock 外部依赖 ======

// Mock LLM
const mockGenerateStructured = vi.fn();
vi.mock('@/lib/llm', () => ({
  generateStructured: (...args: any[]) => mockGenerateStructured(...args),
  chatCompletion: vi.fn().mockResolvedValue({ reply: '对话摘要文本' }),
  getMemoryLlmProvider: vi.fn().mockReturnValue(undefined),
}));
vi.mock('@/lib/ai/deepseek', () => ({
  chatCompletion: vi.fn().mockResolvedValue({ reply: '对话摘要文本' }),
}));

// In-memory DB 模拟
let profileMemoryStore: any[] = [];
let memoryCandidateStore: any[] = [];
let sessionSummaryV2Store: any[] = [];
let userStore: any[] = [];
let conversationStore: any[] = [];
let idCounter = 0;
const nextId = () => `cuid_${++idCounter}`;

function matchesWhere(row: any, where: any): boolean {
  for (const [key, val] of Object.entries(where || {})) {
    if (val === null) {
      // null 匹配 null 和 undefined（Prisma 语义：字段为空）
      if (row[key] !== null && row[key] !== undefined) return false;
    } else if (typeof val === 'object' && val !== null) {
      // 跳过复杂查询条件（如 { gte: ... }）
      continue;
    } else if (val !== undefined) {
      if (row[key] !== val) return false;
    }
  }
  return true;
}

function createDelegate(store: any[]) {
  return {
    findMany: vi.fn(({ where, orderBy, take }: any = {}) => {
      let results = store.filter((row) => matchesWhere(row, where));
      if (take) results = results.slice(0, take);
      return Promise.resolve(results);
    }),
    findUnique: vi.fn(({ where }: any) => {
      const row = store.find((r) => {
        for (const [key, val] of Object.entries(where)) {
          if (r[key] !== val) return false;
        }
        return true;
      });
      return Promise.resolve(row || null);
    }),
    findFirst: vi.fn(({ where }: any = {}) => {
      const row = store.find((r) => {
        for (const [key, val] of Object.entries(where || {})) {
          if (val === null && r[key] !== null) return false;
          if (val !== null && val !== undefined && r[key] !== val) return false;
        }
        return true;
      });
      return Promise.resolve(row || null);
    }),
    create: vi.fn(({ data }: any) => {
      const row = { id: nextId(), createdAt: new Date(), updatedAt: new Date(), ...data };
      store.push(row);
      return Promise.resolve(row);
    }),
    createMany: vi.fn(({ data }: any) => {
      for (const d of data) {
        store.push({ id: nextId(), createdAt: new Date(), updatedAt: new Date(), ...d });
      }
      return Promise.resolve({ count: data.length });
    }),
    update: vi.fn(({ where, data }: any) => {
      const row = store.find((r) => {
        for (const [key, val] of Object.entries(where)) {
          if (r[key] !== val) return false;
        }
        return true;
      });
      if (row) Object.assign(row, data, { updatedAt: new Date() });
      return Promise.resolve(row);
    }),
    updateMany: vi.fn(({ where, data }: any) => {
      let count = 0;
      for (const row of store) {
        let match = true;
        for (const [key, val] of Object.entries(where)) {
          if (row[key] !== val) { match = false; break; }
        }
        if (match) { Object.assign(row, data); count++; }
      }
      return Promise.resolve({ count });
    }),
    upsert: vi.fn(({ where, create, update }: any) => {
      const existing = store.find((r) => {
        for (const [key, val] of Object.entries(where)) {
          if (r[key] !== val) return false;
        }
        return true;
      });
      if (existing) {
        Object.assign(existing, update, { updatedAt: new Date() });
        return Promise.resolve(existing);
      }
      const row = { id: nextId(), createdAt: new Date(), updatedAt: new Date(), ...create };
      store.push(row);
      return Promise.resolve(row);
    }),
    count: vi.fn(({ where }: any = {}) => {
      return Promise.resolve(store.filter((r) => {
        for (const [key, val] of Object.entries(where || {})) {
          if (r[key] !== val) return false;
        }
        return true;
      }).length);
    }),
    deleteMany: vi.fn(({ where }: any = {}) => {
      const before = store.length;
      const toKeep = store.filter((r) => {
        for (const [key, val] of Object.entries(where || {})) {
          if (r[key] !== val) return true;
        }
        return false;
      });
      store.length = 0;
      store.push(...toKeep);
      return Promise.resolve({ count: before - store.length });
    }),
  };
}

// Mock 缓存层（测试中不需要真实缓存行为）
vi.mock('../memory-cache', () => ({
  memoryCache: {
    get: vi.fn().mockReturnValue(null),
    set: vi.fn(),
    invalidate: vi.fn(),
    clear: vi.fn(),
  },
  MemoryCache: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    profileMemory: createDelegate(profileMemoryStore),
    memoryCandidate: createDelegate(memoryCandidateStore),
    sessionSummaryV2: createDelegate(sessionSummaryV2Store),
    user: {
      findUnique: vi.fn(({ where }: any) => {
        const user = userStore.find((u) => u.id === where.id);
        return Promise.resolve(user || null);
      }),
      update: vi.fn(({ where, data }: any) => {
        const user = userStore.find((u) => u.id === where.id);
        if (user) {
          if (data.sessionCount?.increment) {
            user.sessionCount = (user.sessionCount || 0) + data.sessionCount.increment;
          }
          const { sessionCount: _sc, ...rest } = data;
          Object.assign(user, rest);
        }
        return Promise.resolve(user);
      }),
    },
    conversation: {
      findUnique: vi.fn(({ where, include }: any) => {
        const conv = conversationStore.find((c) => c.id === where.id);
        return Promise.resolve(conv || null);
      }),
    },
  },
}));

// ====== 导入被测模块 ======
import { MemoryCandidateService } from '../memory-candidate-service';
import { ProfileMemoryMergeService } from '../profile-memory-merge-service';
import { MemoryContextService } from '../memory-context-service';
import { SessionSummaryV2Writer } from '../session-summary-v2-writer';
import { updateSessionMetadata, getSessionMetadata, formatSessionMetadata } from '../session-metadata';
import { buildMemoryFingerprint } from '../fingerprint';

// ====== 测试数据 ======
const TEST_USER_ID = 'user-test-001';
const TEST_CONV_ID = 'conv-test-001';

function seedUser() {
  userStore.push({
    id: TEST_USER_ID,
    sessionCount: 0,
    lastSessionAt: null,
    avgSessionHour: null,
    activeStreak: 0,
    lastActiveDateStr: null,
  });
}

function seedConversation(messages: Array<{ role: string; content: string }>) {
  conversationStore.push({
    id: TEST_CONV_ID,
    userId: TEST_USER_ID,
    messages: messages.map((m, i) => ({
      id: `msg-${i}`,
      role: m.role,
      content: m.content,
      createdAt: new Date(),
    })),
  });
}

// ====== 测试开始 ======

beforeEach(() => {
  vi.clearAllMocks();
  profileMemoryStore.length = 0;
  memoryCandidateStore.length = 0;
  sessionSummaryV2Store.length = 0;
  userStore.length = 0;
  conversationStore.length = 0;
  idCounter = 0;
});

// ============================================================
// Phase 1: 提取 + 候选保存
// ============================================================

describe('Phase 1: 记忆提取与候选保存', () => {
  it('从对话中提取记忆并保存为候选', async () => {
    // 准备：一段包含个人信息的对话
    seedConversation([
      { role: 'user', content: '最近工作压力很大，领导总是批评我' },
      { role: 'assistant', content: '听起来你承受了不少压力' },
      { role: 'user', content: '是的，每次汇报前都很焦虑，胸口发紧' },
      { role: 'assistant', content: '这种身体反应很常见' },
    ]);

    // Mock LLM 返回提取结果
    mockGenerateStructured.mockResolvedValueOnce({
      memories: [
        { topic: 'trigger_warning', content: '工作汇报前感到焦虑，胸口发紧', confidence: 0.9 },
        { topic: 'personal_context', content: '领导经常批评用户', confidence: 0.85 },
      ],
    });

    const service = new MemoryCandidateService();
    const extracted = await service.extractAndSave(TEST_CONV_ID);

    // 验证提取结果
    expect(extracted).toHaveLength(2);
    expect(extracted[0].topic).toBe('trigger_warning');

    // 验证候选已保存到 DB
    expect(memoryCandidateStore).toHaveLength(2);
    expect(memoryCandidateStore[0].kind).toBe('trigger'); // topic → kind 映射
    expect(memoryCandidateStore[1].kind).toBe('identity');
    expect(memoryCandidateStore[0].status).toBeUndefined(); // createMany 不设 status 默认
  });

  it('消息不足 2 条时不提取', async () => {
    conversationStore.push({
      id: TEST_CONV_ID,
      userId: TEST_USER_ID,
      messages: [{ id: 'msg-0', role: 'user', content: '你好', createdAt: new Date() }],
    });

    const service = new MemoryCandidateService();
    const extracted = await service.extractAndSave(TEST_CONV_ID);

    expect(extracted).toHaveLength(0);
    expect(mockGenerateStructured).not.toHaveBeenCalled();
  });
});

// ============================================================
// Phase 2: 合并去重
// ============================================================

describe('Phase 2: ProfileMemory 合并去重', () => {
  it('新记忆 → 创建 ProfileMemory', async () => {
    const service = new ProfileMemoryMergeService();
    await service.mergeExtractedMemories(TEST_USER_ID, TEST_CONV_ID, [
      { topic: 'trigger_warning', content: '工作汇报前感到焦虑，胸口发紧', confidence: 0.9 },
    ]);

    expect(profileMemoryStore).toHaveLength(1);
    expect(profileMemoryStore[0].kind).toBe('trigger');
    expect(profileMemoryStore[0].priority).toBe(90); // trigger 优先级
    expect(profileMemoryStore[0].fingerprint).toBe('trigger:工作汇报:胸口发紧');
  });

  it('指纹匹配 → 更新已有记录（取更长内容）', async () => {
    // 已有一条短记忆，指纹与新记忆完全一致
    profileMemoryStore.push({
      id: 'existing-1',
      userId: TEST_USER_ID,
      kind: 'trigger',
      content: '工作汇报时胸口发紧',
      confidence: 0.8,
      fingerprint: 'trigger:工作汇报:胸口发紧', // 与新记忆指纹一致
      deletedAt: null,
      updatedAt: new Date(),
    });

    const service = new ProfileMemoryMergeService();
    // 新记忆指纹也是 trigger:工作汇报:胸口发紧
    await service.mergeExtractedMemories(TEST_USER_ID, TEST_CONV_ID, [
      { topic: 'trigger_warning', content: '每次工作汇报前都很焦虑，胸口发紧，手心出汗', confidence: 0.95 },
    ]);

    // 不应创建新记录
    expect(profileMemoryStore).toHaveLength(1);
    // 内容应更新为更长的版本
    expect(profileMemoryStore[0].content).toBe('每次工作汇报前都很焦虑，胸口发紧，手心出汗');
    expect(profileMemoryStore[0].confidence).toBe(0.95);
  });

  it('近似重复（>60% overlap）→ 内容更丰富时更新', async () => {
    // 已有短记忆：token ["用户", "保时捷", "工作"]
    profileMemoryStore.push({
      id: 'existing-2',
      userId: TEST_USER_ID,
      kind: 'identity',
      content: '用户在保时捷公司工作很久了',
      confidence: 0.7,
      fingerprint: 'identity:用户在保时捷公司工作很久了',
      deletedAt: null,
      updatedAt: new Date(),
    });

    const service = new ProfileMemoryMergeService();
    // 新记忆更长但共享大量 token → overlap > 60%
    await service.mergeExtractedMemories(TEST_USER_ID, TEST_CONV_ID, [
      { topic: 'personal_context', content: '用户在保时捷公司工作很久了，负责数字化部门的共享服务', confidence: 0.9 },
    ]);

    expect(profileMemoryStore).toHaveLength(1);
    // 更长的内容应覆盖（长度超过 1.1x 触发更新）
    expect(profileMemoryStore[0].content).toContain('数字化部门');
  });

  it('完全不同的记忆 → 创建新记录', async () => {
    profileMemoryStore.push({
      id: 'existing-3',
      userId: TEST_USER_ID,
      kind: 'trigger',
      content: '工作汇报时焦虑',
      confidence: 0.8,
      fingerprint: 'trigger:工作汇报:焦虑',
      deletedAt: null,
      updatedAt: new Date(),
    });

    const service = new ProfileMemoryMergeService();
    await service.mergeExtractedMemories(TEST_USER_ID, TEST_CONV_ID, [
      { topic: 'coping_preference', content: '深呼吸练习对用户有效', confidence: 0.85 },
    ]);

    expect(profileMemoryStore).toHaveLength(2);
    expect(profileMemoryStore[1].kind).toBe('coping');
  });

  it('候选状态随合并结果更新', async () => {
    memoryCandidateStore.push({
      id: 'cand-1',
      userId: TEST_USER_ID,
      conversationId: TEST_CONV_ID,
      content: '深呼吸练习对用户有效',
      status: 'pending',
    });

    const service = new ProfileMemoryMergeService();
    await service.mergeExtractedMemories(TEST_USER_ID, TEST_CONV_ID, [
      { topic: 'coping_preference', content: '深呼吸练习对用户有效', confidence: 0.85 },
    ]);

    expect(memoryCandidateStore[0].status).toBe('merged');
  });
});

// ============================================================
// Phase 3: 上下文注入
// ============================================================

describe('Phase 3: 记忆上下文注入', () => {
  it('组装 ProfileMemory + SessionSummary + SessionMetadata 注入文本', async () => {
    // 准备数据
    profileMemoryStore.push(
      {
        id: 'pm-1', userId: TEST_USER_ID, kind: 'trigger',
        content: '工作汇报前焦虑', priority: 90, confidence: 0.9,
        deletedAt: null, updatedAt: new Date(), sourceConversationId: null,
      },
      {
        id: 'pm-2', userId: TEST_USER_ID, kind: 'coping',
        content: '深呼吸练习有效', priority: 75, confidence: 0.85,
        deletedAt: null, updatedAt: new Date(), sourceConversationId: null,
      },
    );
    sessionSummaryV2Store.push({
      id: 'ss-1', userId: TEST_USER_ID, conversationId: 'conv-old',
      summary: '上次讨论了工作压力和应对方法',
      createdAt: new Date(),
    });
    seedUser();
    userStore[0].sessionCount = 5;
    userStore[0].activeStreak = 3;

    const service = new MemoryContextService();
    const result = await service.getContext(TEST_USER_ID, '今天又要汇报了');

    // 验证返回结构
    expect(result.source).toBe('memory-v2');
    expect(result.profileMemories).toHaveLength(2);
    expect(result.recentSummaries).toHaveLength(1);

    // 验证注入文本包含关键内容
    expect(result.injectedText).toContain('用户稳定信息');
    expect(result.injectedText).toContain('trigger');
    expect(result.injectedText).toContain('最近会话摘要');
    expect(result.injectedText).toContain('记忆使用指南');

    // 验证 metrics
    expect(result.metrics).toBeDefined();
    expect(result.metrics!.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('无记忆时返回空注入文本', async () => {
    seedUser();

    const service = new MemoryContextService();
    const result = await service.getContext(TEST_USER_ID, '你好');

    expect(result.injectedText).toBe('');
    expect(result.profileMemories).toHaveLength(0);
    expect(result.recentSummaries).toHaveLength(0);
  });

  it('探索工坊记忆带标注', async () => {
    profileMemoryStore.push({
      id: 'pm-lab', userId: TEST_USER_ID, kind: 'identity',
      content: '用户对存在主义哲学感兴趣', priority: 60, confidence: 0.8,
      deletedAt: null, updatedAt: new Date(),
      sourceConversationId: 'lab_mentor_socrates',
    });
    seedUser();

    const service = new MemoryContextService();
    const result = await service.getContext(TEST_USER_ID, '哲学');

    expect(result.injectedText).toContain('探索工坊发现');
  });
});

// ============================================================
// Phase 4: 会话摘要
// ============================================================

describe('Phase 4: 会话摘要写入', () => {
  it('创建新摘要', async () => {
    const writer = new SessionSummaryV2Writer();
    await writer.upsert({
      userId: TEST_USER_ID,
      conversationId: TEST_CONV_ID,
      summary: '讨论了工作压力，练习了深呼吸',
      emotionLabel: '焦虑',
      emotionScore: 6,
      keyTopics: ['工作压力', '呼吸练习'],
    });

    expect(sessionSummaryV2Store).toHaveLength(1);
    expect(sessionSummaryV2Store[0].summary).toBe('讨论了工作压力，练习了深呼吸');
    expect(sessionSummaryV2Store[0].emotionLabel).toBe('焦虑');
  });

  it('同一会话再次 upsert → 更新而非创建', async () => {
    sessionSummaryV2Store.push({
      id: 'ss-existing',
      userId: TEST_USER_ID,
      conversationId: TEST_CONV_ID,
      summary: '旧摘要',
      emotionLabel: null,
      emotionScore: null,
    });

    const writer = new SessionSummaryV2Writer();
    await writer.upsert({
      userId: TEST_USER_ID,
      conversationId: TEST_CONV_ID,
      summary: '更新后的摘要',
      emotionLabel: '平静',
      emotionScore: 3,
    });

    expect(sessionSummaryV2Store).toHaveLength(1);
    expect(sessionSummaryV2Store[0].summary).toBe('更新后的摘要');
  });

  it('只传 summary 不覆盖已有的 emotion 数据', async () => {
    sessionSummaryV2Store.push({
      id: 'ss-with-emotion',
      userId: TEST_USER_ID,
      conversationId: TEST_CONV_ID,
      summary: '旧摘要',
      emotionLabel: '焦虑',
      emotionScore: 7,
    });

    const writer = new SessionSummaryV2Writer();
    await writer.upsert({
      userId: TEST_USER_ID,
      conversationId: TEST_CONV_ID,
      summary: '新的压缩摘要',
      // 不传 emotionLabel/emotionScore
    });

    expect(sessionSummaryV2Store[0].summary).toBe('新的压缩摘要');
    // emotion 字段不应被覆盖为 null
    expect(sessionSummaryV2Store[0].emotionLabel).toBe('焦虑');
    expect(sessionSummaryV2Store[0].emotionScore).toBe(7);
  });
});

// ============================================================
// Phase 5: Session Metadata
// ============================================================

describe('Phase 5: Session Metadata 追踪', () => {
  it('首次会话 → sessionCount=1', async () => {
    seedUser();

    const meta = await updateSessionMetadata(TEST_USER_ID);

    expect(meta.sessionCount).toBe(1);
    // 首次会话 lastActiveDateStr 为 null，gapDays=0 被视为"同一天"
    // streak 保持初始值 0（isNewDay=true 但 gapDays=0 分支不变更）
    expect(meta.activeStreak).toBe(0);
  });

  it('连续两天 → activeStreak 递增', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    userStore.push({
      id: TEST_USER_ID,
      sessionCount: 3,
      lastSessionAt: yesterday,
      avgSessionHour: 21,
      activeStreak: 2,
      lastActiveDateStr: yesterdayStr,
    });

    const meta = await updateSessionMetadata(TEST_USER_ID);

    expect(meta.activeStreak).toBe(3);
    expect(meta.sessionCount).toBe(4);
  });

  it('间隔 3 天 → activeStreak 重置为 1', async () => {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const threeDaysAgoStr = threeDaysAgo.toISOString().slice(0, 10);

    userStore.push({
      id: TEST_USER_ID,
      sessionCount: 10,
      lastSessionAt: threeDaysAgo,
      avgSessionHour: 14,
      activeStreak: 5,
      lastActiveDateStr: threeDaysAgoStr,
    });

    const meta = await updateSessionMetadata(TEST_USER_ID);

    expect(meta.activeStreak).toBe(1);
    expect(meta.gapDays).toBe(3);
  });

  it('avgSessionHour 加权移动平均（α=0.3）', async () => {
    userStore.push({
      id: TEST_USER_ID,
      sessionCount: 5,
      lastSessionAt: new Date(),
      avgSessionHour: 20.0, // 之前平均 20 点
      activeStreak: 1,
      lastActiveDateStr: new Date().toISOString().slice(0, 10),
    });

    const meta = await updateSessionMetadata(TEST_USER_ID);

    // newAvg = 20 * 0.7 + currentHour * 0.3
    const expectedAvg = 20 * 0.7 + new Date().getHours() * 0.3;
    expect(meta.avgSessionHour).toBeCloseTo(Math.round(expectedAvg * 10) / 10, 1);
  });

  it('formatSessionMetadata 生成行为信号文本', () => {
    // 新用户
    expect(formatSessionMetadata({
      sessionCount: 2, lastSessionAt: new Date(),
      avgSessionHour: 14, activeStreak: 1, gapDays: 0,
    })).toContain('第 2 次对话');

    // 深夜用户 + 连续活跃
    const text = formatSessionMetadata({
      sessionCount: 15, lastSessionAt: new Date(),
      avgSessionHour: 23.5, activeStreak: 5, gapDays: 0,
    });
    expect(text).toContain('深夜使用');
    expect(text).toContain('连续使用');

    // 久未回来
    expect(formatSessionMetadata({
      sessionCount: 8, lastSessionAt: new Date(),
      avgSessionHour: 10, activeStreak: 1, gapDays: 10,
    })).toContain('10 天');
  });
});

// ============================================================
// Phase 6: 指纹生成
// ============================================================

describe('Phase 6: 记忆指纹', () => {
  it('trigger 类型 → subject:symptom 格式', () => {
    expect(buildMemoryFingerprint('trigger', '工作汇报时胸口发紧'))
      .toBe('trigger:工作汇报:胸口发紧');
  });

  it('preference 类型 → avoid:prefer 格式', () => {
    expect(buildMemoryFingerprint('preference', '不喜欢强势命令式，希望先被理解'))
      .toBe('preference:强势:先被理解');
  });

  it('coping 类型 → coping 格式', () => {
    expect(buildMemoryFingerprint('coping', '通过深呼吸缓解焦虑'))
      .toBe('coping:呼吸');
  });

  it('relationship 类型 → target 格式', () => {
    expect(buildMemoryFingerprint('relationship', '和妈妈关系紧张'))
      .toBe('relationship:妈妈');
  });

  it('identity 类型 → 前 40 字符', () => {
    const fp = buildMemoryFingerprint('identity', '用户在上海工作');
    expect(fp).toMatch(/^identity:/);
  });

  it('相同语义生成相同指纹', () => {
    const fp1 = buildMemoryFingerprint('trigger', '工作汇报让我焦虑');
    const fp2 = buildMemoryFingerprint('trigger', '每次工作汇报都焦虑');
    expect(fp1).toBe(fp2); // 都提取到 工作汇报 + 焦虑
  });
});

// ============================================================
// Phase 7: 端到端完整流程
// ============================================================

describe('Phase 7: 完整生命周期（提取→候选→合并→注入）', () => {
  it('一轮对话产生的记忆能在下轮注入', async () => {
    // Step 1: 准备对话
    seedConversation([
      { role: 'user', content: '我很害怕每次给领导汇报工作' },
      { role: 'assistant', content: '听起来汇报工作给你带来了很大的压力' },
      { role: 'user', content: '对，每次汇报前胸口就发紧' },
      { role: 'assistant', content: '这种身体反应是焦虑的常见表现' },
    ]);
    seedUser();

    // Step 2: LLM 返回提取结果
    mockGenerateStructured.mockResolvedValueOnce({
      memories: [
        { topic: 'trigger_warning', content: '工作汇报前感到焦虑，胸口发紧', confidence: 0.9 },
      ],
    });

    // Step 3: 提取 + 保存候选
    const candidateService = new MemoryCandidateService();
    const extracted = await candidateService.extractAndSave(TEST_CONV_ID);
    expect(extracted).toHaveLength(1);

    // Step 4: 合并到 ProfileMemory
    const mergeService = new ProfileMemoryMergeService();
    await mergeService.mergeExtractedMemories(TEST_USER_ID, TEST_CONV_ID, extracted);
    expect(profileMemoryStore).toHaveLength(1);
    expect(profileMemoryStore[0].kind).toBe('trigger');

    // Step 5: 写入会话摘要
    const writer = new SessionSummaryV2Writer();
    await writer.upsert({
      userId: TEST_USER_ID,
      conversationId: TEST_CONV_ID,
      summary: '用户讨论了工作汇报焦虑和身体反应',
      emotionLabel: '焦虑',
      emotionScore: 7,
    });

    // Step 6: 更新 Session Metadata
    await updateSessionMetadata(TEST_USER_ID);

    // Step 7: 下一轮对话获取上下文 → 记忆被注入
    const contextService = new MemoryContextService();
    const context = await contextService.getContext(TEST_USER_ID, '今天又要汇报了');

    expect(context.profileMemories).toHaveLength(1);
    expect(context.profileMemories[0].content).toContain('焦虑');
    expect(context.recentSummaries).toHaveLength(1);
    expect(context.injectedText).toContain('用户稳定信息');
    expect(context.injectedText).toContain('trigger');
    expect(context.injectedText).toContain('用户行为模式'); // Session Metadata
  });
});
