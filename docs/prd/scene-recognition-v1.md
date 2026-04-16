# Scene Recognition & WebSearch v1

> 目标：让 `mental` 在首个 triage LLM 节点就产出 `scene`，并在涉及动态外部事实时按需触发实时 websearch。

## 1. 这轮要回答的产品问题

- 如果系统先识别用户所处的现实场景，而不是只贴情绪标签，`被理解感` 会不会明显提升？
- `scene` 放在第一个 triage LLM 节点里，能不能在不显著拉长首轮响应的前提下稳定产出？
- 哪些问题只需要陪伴/教练判断，哪些问题必须补外部动态事实？
- 实时 websearch 应该在什么条件下自动触发，才不会把主链路做成“搜索助手”？
- scene 命中后，后续的 cohort / 场景计划 / 回访分发是否会更准？

## 2. 当前实现边界

- `scene`：由首个 triage LLM 节点直接输出，不再用本地规则做主判断。
- 兜底：若 triage 未返回可靠 `scene`，保守落到 `general_support`。
- `websearch`：当前接 OpenAI `Responses + web_search`。
- 自动触发策略：
  - `required`：自动实时搜索
  - `suggested`：默认不自动搜索，除非 `MENTAL_WEBSEARCH_AUTO_SUGGESTED=1`
- 搜索结果只作为外部事实上下文注入，不替代支持/教练回复本身。

## 3. 循证基础 / 产品假设 / 社区实验 / 核心指标 / 最小实验设计

| 循证基础 | 产品假设 | 社区实验 | 核心指标 | 最小实验设计 |
|---|---|---|---|---|
| 治疗联盟与“被理解感”稳定相关；个案概念化强调先理解现实处境，再决定干预。 | `scene` 比单纯 `emotion label` 更接近用户真实困扰结构。 | 每个母场景招 8-10 个共创用户，双盲评审“泛化回复 vs scene 回复”。 | `felt_understood`、继续说下去意愿、误判率 | 离线抽 150-200 条脱敏对话，比较 emotion-only vs scene-first 的人工评分。 |
| context/person-centered assessment 支持从症状导向转向处境导向。 | 把 `scene` 放在第一个 triage LLM 节点，可在不显著加时的前提下稳定产出。 | 共创 panel 标注 triage 的 scene 命中情况和误伤点。 | `scene agreement`、fallback 比例、首 token 延迟变化 | 在线灰度：只开 scene metadata，不改回复策略，先看时延和命中。 |
| JITAI/EMI 支持“在真实时刻给及时支持”；但 personalization 本身并未被强证据证明一定更优。 | `scene-aware` 的 action 建议，比通用建议更容易执行。 | 同一场景下比较“泛化下一步” vs “scene 下一步”。 | 建议采纳率、24h 完成率、次日回访率 | 先只改首轮 action block，不改整段回复。 |
| digital peer support / co-design 有可行性证据，但需要小步验证。 | `scene` 将来可作为 cohort 分发器；cohort 反过来又能喂给 scene taxonomy。 | 先做单场景 mini cohort，例如“职场边界修复 7 天”。 | 加入率、D3/D7 留存、`原来不只我这样` 评分 | v1 暂不做 cohort 功能，只保留路由接口和场景 metadata。 |
| 动态事实问题需要可靠外部来源，而不是模型猜测。 | `websearch` 应该是按需外挂，不该替代陪伴主链。 | 观察用户在哪些问题上会追问“官方怎么说/现在怎么规定”。 | `required` 占比、搜索成功率、引用来源数、搜索后回复帮助度 | 先对 `required` 自动搜索；`suggested` 默认手动/延迟触发。 |

## 4. Scene taxonomy v1

- `workplace_boundary`
  - 典型语境：职责边界被侵蚀、被甩锅、流程成本转嫁、被当文员/协调工具人
- `student_pressure`
  - 典型语境：考试、导师、论文、延毕、答辩、求职与自我怀疑
- `caregiver_burden`
  - 典型语境：带娃、照护家人、持续打断、家务叠加、guilt
- `general_support`
  - triage 未识别出高置信场景时的保守兜底

## 5. WebSearch 触发原则

应该自动搜索：
- 用户明确问“最新 / 现在 / 官方 / 怎么规定 / 文档 / API / schema / domain / 劳动法 / 校规”
- 模型回复如果不查就只能猜

默认不自动搜索：
- 纯情绪支持
- 单纯要被理解、被接住
- 可以先给结构化判断、再决定是否补事实的场景

回复时的硬边界：
- 永远不要假装“已经查过”
- 事实查证和教练判断要分开表达
- 搜索结果只做外部上下文，不替代陪伴式回复本身

## 6. 这轮实现落点

- `lib/ai/agents/triage-agent.ts`
  - triage 输出新增 `scene`
- `lib/ai/scene.ts`
  - scene 只接 triage 结果 + fallback
- `lib/ai/websearch.ts`
  - realtime websearch capability + OpenAI provider
- `app/api/chat/route.ts`
  - 输出 `scene/websearch` metadata，并在需要时执行实时搜索
- `app/api/chat/handlers.ts`
  - 把 scene playbook 和 websearch 结果注入 support prompt

## 7. 下一步

1. 用真实对话样本标注 `scene` 命中率，先做离线评估。
2. 跑一个只针对 `workplace_boundary` 的小流量实验，验证 `被理解感` 和 `action completion`。
3. 等 `scene` 命中稳定后，再把它接到 cohort / 计划制产品形态里。
