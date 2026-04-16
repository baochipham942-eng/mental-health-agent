export type SceneId =
  | 'workplace_boundary'
  | 'student_pressure'
  | 'caregiver_burden'
  | 'general_support';

export type SceneRole = 'knowledge_worker' | 'student' | 'caregiver' | 'unknown';
export type SceneIntent = 'vent' | 'sensemaking' | 'prep' | 'action' | 'support';

export interface TriageSceneSignal {
  id?: SceneId;
  role?: SceneRole;
  conflict?: string;
  intent?: SceneIntent;
  confidence?: number;
}

export interface SceneContext {
  id: SceneId;
  label: string;
  role: SceneRole;
  conflict: string;
  intent: SceneIntent;
  confidence: number;
  reasons: string[];
  source: 'fallback' | 'triage';
}

interface ResolveSceneContextInput {
  message: string;
  triageScene?: TriageSceneSignal | null;
}

const SCENE_LABELS: Record<SceneId, string> = {
  workplace_boundary: '职场边界与职责侵蚀',
  student_pressure: '学生压力与自我怀疑',
  caregiver_burden: '照护负担与 guilt',
  general_support: '通用支持',
};

const SCENE_CONFLICTS: Record<SceneId, string> = {
  workplace_boundary: '角色边界被侵蚀，流程或责任成本被转嫁到用户身上',
  student_pressure: '学业/评价压力和自我价值绑得太紧，容易把一次结果看成自我失败',
  caregiver_burden: '长期照护、持续打断和 guilt 叠加，用户很难为自己保留恢复空间',
  general_support: '当前现实场景还不够明确，先轻接住，再澄清正在卡住的生活处境',
};

function normalizeSceneId(sceneId?: string): SceneId | null {
  if (!sceneId) return null;
  return ['workplace_boundary', 'student_pressure', 'caregiver_burden', 'general_support'].includes(sceneId)
    ? (sceneId as SceneId)
    : null;
}

function clampConfidence(score?: number): number {
  if (typeof score !== 'number' || Number.isNaN(score)) return 0.35;
  return Math.max(0.2, Math.min(0.95, Number(score.toFixed(2))));
}

export function buildFallbackSceneContext(): SceneContext {
  return {
    id: 'general_support',
    label: SCENE_LABELS.general_support,
    role: 'unknown',
    conflict: SCENE_CONFLICTS.general_support,
    intent: 'support',
    confidence: 0.35,
    reasons: ['triage 未返回可靠场景信号，保守兜底为 general_support'],
    source: 'fallback',
  };
}

export function resolveSceneContext(input: ResolveSceneContextInput): SceneContext {
  const sceneId = normalizeSceneId(input.triageScene?.id);
  if (!sceneId) {
    return buildFallbackSceneContext();
  }

  return {
    id: sceneId,
    label: SCENE_LABELS[sceneId],
    role: input.triageScene?.role || 'unknown',
    conflict: input.triageScene?.conflict || SCENE_CONFLICTS[sceneId],
    intent: input.triageScene?.intent || 'support',
    confidence: clampConfidence(input.triageScene?.confidence),
    reasons: ['场景识别来自首个 triage LLM 节点'],
    source: 'triage',
  };
}

export function buildSceneSystemInjection(scene: SceneContext): string | undefined {
  if (scene.id === 'general_support') {
    return [
      '**场景理解（v1）**：',
      '- triage 暂未识别出高置信现实场景，先接住，不要急着套术语或给宽泛建议。',
      '- 如果需要提问，优先问一个轻量澄清问题，帮助定位用户卡住的是工作、学业、照护还是关系处境。',
      '- 不要把用户的痛苦只翻译成情绪词，尽量先命名现实处境。',
    ].join('\n');
  }

  const playbooks: Record<Exclude<SceneId, 'general_support'>, string[]> = {
    workplace_boundary: [
      '- 先命名这是职责边界/流程成本问题，不要只做情绪安抚。',
      '- 区分用户是在想发泄、想判断结构问题，还是想准备一句对外表达。',
      '- 如果给建议，优先给一小步澄清/对齐/表达动作，而不是抽象地让用户休息。',
    ],
    student_pressure: [
      '- 先看到评价压力和自我价值绑在一起，不要只给鸡汤式鼓励。',
      '- 优先帮用户缩小到一个可完成的小步，降低“全有或全无”的失败感。',
      '- 如果用户在考前或答辩前，先做稳住和准备，不急着深挖人格问题。',
    ],
    caregiver_burden: [
      '- 先承认长期照护、持续打断和 guilt 的累积感，不要道德化用户。',
      '- 避免默认用户“应该更坚强”或“再坚持一下”。',
      '- 如果给建议，优先微恢复、支持请求或负担命名，而不是再加任务。',
    ],
  };

  return [
    '**场景理解（v1）**：',
    `- 当前高置信场景：${scene.label}（role=${scene.role}，intent=${scene.intent}，confidence=${scene.confidence}）。`,
    `- 结构性矛盾：${scene.conflict}`,
    ...playbooks[scene.id as Exclude<SceneId, 'general_support'>],
  ].join('\n');
}
