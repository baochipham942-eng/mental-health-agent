# 问诊分流逻辑全景图

```mermaid
graph TD
    Start([用户消息]) --> StateCheck{当前状态?}
    
    %% 状态优先处理
    StateCheck -- "in_crisis" --> CrisisStateCheck{包含安全退出信号?}
    CrisisStateCheck -- 是 --> SupportRoute[Support: 降级/正向支持]
    CrisisStateCheck -- 否 --> CrisisMaintain[Crisis: 维持干预 (Follow-up)]
    
    StateCheck -- "awaiting_followup" --> CombineMsg[组合 History 回答]
    CombineMsg --> IntentCheck
    
    StateCheck -- "normal/undefined" --> IntentCheck
    
    %% 意图判定 (Hybrid Layer)
    subgraph IntentCheck [核心意图判定 (Hybrid)]
        direction TB
        L1{Layer 1: 本地词库}
        L2{Layer 2: LLM 检测}
        
        L1 -- 命中 Action/Ideation --> IsCrisis[判定: Crisis]
        L1 -- 未命中 --> L2
        
        L2 -- High/Medium Conf --> IsCrisis
        L2 -- Low Conf/False --> RuleCheck{规则分流}
        
        RuleCheck -- 命中 Positive/Venting --> IsSupport[判定: Support]
        RuleCheck -- 其他 --> IsAssess[判定: Assessment]
    end
    
    %% 路由分发
    IsCrisis --> RouteCrisis[Crisis Route]
    IsSupport --> RouteSupport[Support Route]
    IsAssess --> RouteAssessment[Assessment Route]
    
    %% Crisis Route 执行
    RouteCrisis --> CrisisExec{是否多轮?}
    CrisisExec -- 首轮 --> CrisisInit[Prompt: CRISIS_PROMPT]
    CrisisExec -- 多轮 --> CrisisFollow[Prompt: CRISIS_FOLLOWUP_PROMPT]
    CrisisInit --> SetCrisisState[Set State: in_crisis]
    CrisisFollow --> SetCrisisState
    
    %% Support Route 执行
    RouteSupport --> SupportExec[Prompt: SUPPORT_PROMPT]
    SupportExec --> SetNormalState[Set State: normal]
    
    %% Assessment Route 执行
    RouteAssessment --> AssessStage{阶段判定}
    AssessStage -- "Intake" --> AssessIntake[生成苏格拉底问题]
    AssessStage -- "Gap Check" --> AssessGap[生成追问/确认]
    AssessStage -- "Conclusion" --> AssessConclude[生成结论 & ActionCards]
    
    AssessIntake --> SetFollowState[Set State: awaiting_followup]
    AssessGap --> SetFollowState
    AssessConclude --> SetNormalState
```
