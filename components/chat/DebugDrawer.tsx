'use client';

import { useState } from 'react';

import { Session } from 'next-auth';
import { useChatStore } from '@/store/chatStore';
import type { Message } from '@/types/chat';

interface DebugDrawerProps {
  debugPrompts: any | null;
  validationError: any | null;
  emotions?: Array<{ messageId: string; emotion: { label: string; score: number } }>;
  lastRequestPayload?: any | null;
  user?: Session['user'];
}

type AnyRecord = Record<string, any>;

function isRecord(value: unknown): value is AnyRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function renderValue(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return '[unserializable]';
  }
}

function extractTraceSteps(...candidates: unknown[]): any[] {
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (Array.isArray(candidate)) return candidate;
    if (!isRecord(candidate)) continue;

    const nestedCandidates = [
      candidate.agentTrace,
      candidate.traceSteps,
      candidate.steps,
      candidate.trace?.agentTrace,
      candidate.trace?.traceSteps,
      candidate.trace?.steps,
      candidate.metadata?.trace?.agentTrace,
      candidate.metadata?.trace?.traceSteps,
      candidate.metadata?.trace?.steps,
      candidate.data?.agentTrace,
      candidate.data?.traceSteps,
      candidate.data?.steps,
    ];

    for (const nested of nestedCandidates) {
      if (Array.isArray(nested)) return nested;
    }
  }

  return [];
}

function compactSourceLabel(source: unknown): string {
  if (!isRecord(source)) return '未命名来源';
  return source.title || source.url || '未命名来源';
}

export function DebugDrawer({ debugPrompts, validationError, emotions, lastRequestPayload, user }: DebugDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showValidationError, setShowValidationError] = useState(!!validationError);
  const [showRequestPayload, setShowRequestPayload] = useState(false);
  const latestAssistantMessage = useChatStore((state) => {
    for (let i = state.messages.length - 1; i >= 0; i -= 1) {
      const message = state.messages[i] as Message | undefined;
      if (message?.role === 'assistant' && message.metadata) {
        return message;
      }
    }
    return undefined;
  });

  // Permission Check: Only 'demo' or specific phone number can see debug info
  const canSeeDebug = user?.name === 'demo' || user?.phone === '13361909397' || user?.username === 'demo';
  const latestMetadata = (latestAssistantMessage?.metadata || {}) as AnyRecord;
  const debugPromptsRecord = debugPrompts as AnyRecord | null;
  const lastRequestRecord = lastRequestPayload as AnyRecord | null;
  const assistantTrace = isRecord(latestMetadata.trace) ? latestMetadata.trace : undefined;
  const requestTrace = isRecord(lastRequestRecord?.meta?.trace) ? lastRequestRecord?.meta?.trace : undefined;
  const promptTrace = isRecord(debugPromptsRecord?.trace) ? debugPromptsRecord?.trace : undefined;

  const scene =
    latestMetadata.scene ||
    assistantTrace?.scene ||
    lastRequestRecord?.scene ||
    lastRequestRecord?.metadata?.scene ||
    lastRequestRecord?.meta?.scene ||
    requestTrace?.scene ||
    debugPromptsRecord?.scene ||
    debugPromptsRecord?.metadata?.scene;

  const webSearch =
    latestMetadata.webSearch ||
    assistantTrace?.webSearch ||
    lastRequestRecord?.webSearch ||
    lastRequestRecord?.metadata?.webSearch ||
    lastRequestRecord?.meta?.webSearch ||
    requestTrace?.webSearch ||
    debugPromptsRecord?.webSearch ||
    debugPromptsRecord?.metadata?.webSearch;

  const webSearchProcess =
    latestMetadata.webSearchProcess ||
    assistantTrace?.webSearchProcess ||
    lastRequestRecord?.webSearchProcess ||
    lastRequestRecord?.metadata?.webSearchProcess ||
    lastRequestRecord?.meta?.webSearchProcess ||
    requestTrace?.webSearchProcess ||
    debugPromptsRecord?.webSearchProcess ||
    debugPromptsRecord?.metadata?.webSearchProcess;

  const traceSteps = extractTraceSteps(
    latestMetadata.trace,
    latestMetadata.agentTrace,
    assistantTrace,
    requestTrace,
    debugPromptsRecord?.trace,
    debugPromptsRecord?.agentTrace,
    lastRequestRecord?.trace,
    lastRequestRecord?.metadata?.trace,
    lastRequestRecord?.meta?.trace,
  );
  const hasTraceDetails = traceSteps.length > 0 || Boolean(assistantTrace || requestTrace || promptTrace);

  if (!canSeeDebug) {
    return null;
  }

  if (
    !debugPrompts &&
    !validationError &&
    (!emotions || emotions.length === 0) &&
    !lastRequestPayload &&
    !scene &&
    !webSearch &&
    !webSearchProcess &&
    !hasTraceDetails
  ) {
    return null;
  }

  const renderField = (label: string, value: unknown, valueClassName = 'text-gray-700') => (
    <div className="flex items-start gap-2">
      <span className="w-20 shrink-0 text-xs font-semibold text-gray-500">{label}</span>
      <span className={`text-xs break-words ${valueClassName}`}>{renderValue(value)}</span>
    </div>
  );

  const renderChip = (value: unknown, tone: 'gray' | 'green' | 'yellow' | 'red' | 'blue' = 'gray') => {
    const tones: Record<typeof tone, string> = {
      gray: 'bg-gray-100 text-gray-700',
      green: 'bg-green-100 text-green-700',
      yellow: 'bg-yellow-100 text-yellow-700',
      red: 'bg-red-100 text-red-700',
      blue: 'bg-blue-100 text-blue-700',
    };

    return (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>
        {renderValue(value)}
      </span>
    );
  };

  const renderWebSearchTone = (status: unknown) => {
    if (status === 'completed') return 'green' as const;
    if (status === 'failed') return 'red' as const;
    if (status === 'skipped') return 'yellow' as const;
    if (status === 'not_needed') return 'gray' as const;
    return 'blue' as const;
  };

  const renderTraceLine = (step: AnyRecord, index: number) => {
    const inputSummary = step.input ? renderValue(step.input) : '—';
    const outputSummary = step.output ? renderValue(step.output) : '—';

    return (
      <div key={`${step.agent || 'step'}-${index}`} className="rounded-sm border border-gray-200 bg-gray-50 p-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-gray-800">{step.agent || `step-${index + 1}`}</span>
          <span className="text-[11px] text-gray-500">{renderValue(step.durationMs)}ms</span>
          {step.result !== undefined && <span className="text-[11px] text-gray-600">result: {renderValue(step.result)}</span>}
          {step.skipped && <span className="text-[11px] text-amber-700">skipped</span>}
          {step.model && <span className="text-[11px] text-gray-500">model: {renderValue(step.model)}</span>}
        </div>
        <div className="mt-1 space-y-0.5">
          <p className="text-[11px] text-gray-600">
            <span className="font-semibold">input:</span> {inputSummary}
          </p>
          <p className="text-[11px] text-gray-600">
            <span className="font-semibold">output:</span> {outputSummary}
          </p>
          {step.reasoning && (
            <p className="text-[11px] text-gray-600">
              <span className="font-semibold">reasoning:</span> {renderValue(step.reasoning)}
            </p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 hidden md:block">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-4 py-2 bg-gray-800 text-white text-sm font-medium rounded-lg shadow-lg hover:bg-gray-700 transition-colors"
      >
        {isOpen ? '隐藏 Debug' : '显示 Debug'}
      </button>

      {isOpen && (
        <div className="absolute bottom-full right-0 mb-2 w-96 max-h-96 overflow-y-auto bg-white border border-gray-300 rounded-lg shadow-xl p-4">
          <div className="space-y-4">
            <div className="mb-2 pb-2 border-b border-gray-200">
              <p className="text-xs text-gray-500 italic">调试信息（仅开发可见）</p>
            </div>

            {emotions && emotions.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-800 mb-2">情绪分析：</h4>
                <div className="space-y-2">
                  {emotions.map((item, idx) => (
                    <div key={idx} className="text-xs bg-gray-50 p-2 rounded-sm border border-gray-200">
                      <p className="font-semibold text-gray-700 mb-1">消息 {idx + 1}:</p>
                      <p className="text-gray-600">
                        {item.emotion.label} {item.emotion.score}/10
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {validationError && (
              <div>
                <button
                  onClick={() => setShowValidationError(!showValidationError)}
                  className="w-full text-left text-sm font-semibold text-red-600 mb-2 hover:text-red-700 flex items-center justify-between"
                >
                  <span>Validation Error</span>
                  <span>{showValidationError ? '▼' : '▶'}</span>
                </button>
                {showValidationError && (
                  <div className="text-xs bg-red-50 border border-red-200 rounded-sm p-3 overflow-x-auto">
                    <pre className="whitespace-pre-wrap text-red-800">
                      {JSON.stringify(validationError, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {scene && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-gray-800 mb-2">Scene</h4>
                <div className="space-y-1 rounded-sm border border-gray-200 bg-gray-50 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {renderChip(scene.id, 'blue')}
                    {renderChip(scene.label, 'gray')}
                    {renderChip(scene.source, scene.source === 'triage' ? 'green' : 'yellow')}
                  </div>
                  <div className="space-y-1 pt-1">
                    {renderField('role', scene.role)}
                    {renderField('intent', scene.intent)}
                    {renderField('confidence', scene.confidence)}
                    {renderField('conflict', scene.conflict)}
                    {scene.reasons && scene.reasons.length > 0 && (
                      <div className="flex items-start gap-2">
                        <span className="w-20 shrink-0 text-xs font-semibold text-gray-500">reasons</span>
                        <div className="space-y-1">
                          {scene.reasons.map((reason: string, idx: number) => (
                            <p key={`${reason}-${idx}`} className="text-xs text-gray-700">
                              {reason}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {webSearch && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-gray-800 mb-2">Websearch</h4>
                <div className="space-y-1 rounded-sm border border-gray-200 bg-gray-50 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {renderChip(webSearch.need, 'blue')}
                    {renderChip(webSearch.status, renderWebSearchTone(webSearch.status))}
                    {renderChip(webSearch.capabilityMode, 'gray')}
                    {renderChip(webSearch.toolReady ? 'tool ready' : 'tool not ready', webSearch.toolReady ? 'green' : 'red')}
                  </div>
                  <div className="space-y-1 pt-1">
                    {renderField('reason', webSearch.reason)}
                    {renderField('shouldOffer', webSearch.shouldOfferSearch)}
                    {renderField('queryHint', webSearch.queryHint)}
                    {renderField('summary', webSearch.summary)}
                    {renderField('provider', webSearch.provider)}
                    {renderField('latencyMs', webSearch.latencyMs)}
                    {renderField('citationCount', webSearch.citationCount)}
                  </div>
                  {webSearch.sources && webSearch.sources.length > 0 && (
                    <div className="pt-2">
                      <p className="text-xs font-semibold text-gray-500 mb-1">sources</p>
                      <div className="space-y-1">
                        {webSearch.sources.map((source: AnyRecord, idx: number) => (
                          <div key={`${compactSourceLabel(source)}-${idx}`} className="rounded-sm bg-white border border-gray-200 p-2">
                            <p className="text-xs font-medium text-gray-800">{compactSourceLabel(source)}</p>
                            <p className="text-[11px] text-gray-500 break-all">{renderValue(source.url)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {webSearchProcess && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-gray-800 mb-2">Websearch Process</h4>
                <div className="space-y-1 rounded-sm border border-gray-200 bg-gray-50 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {renderChip(webSearchProcess.status, renderWebSearchTone(webSearchProcess.status))}
                  </div>
                  <div className="space-y-1 pt-1">
                    {renderField('reason', webSearchProcess.reason)}
                    {renderField('queryHint', webSearchProcess.queryHint)}
                    {renderField('error', webSearchProcess.error)}
                  </div>
                </div>
              </div>
            )}

            {hasTraceDetails && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-gray-800 mb-2">Trace</h4>
                <div className="space-y-2 rounded-sm border border-gray-200 bg-gray-50 p-3">
                  {traceSteps.length > 0 ? (
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {renderChip(`${traceSteps.length} steps`, 'gray')}
                        {assistantTrace?.scene && renderChip('scene in trace', 'green')}
                        {assistantTrace?.webSearch && renderChip('websearch in trace', 'green')}
                      </div>
                      <div className="space-y-2">
                        {traceSteps.map((step, idx) => renderTraceLine(step || {}, idx))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-gray-600">
                      <p className="mb-2">Trace 已捕获，但没有标准化的 agentTrace 数组。</p>
                      <pre className="max-h-48 overflow-x-auto rounded-sm bg-white border border-gray-200 p-2 whitespace-pre-wrap text-[11px] text-gray-700">
                        {renderValue(assistantTrace || requestTrace || promptTrace)}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            )}

            {lastRequestPayload && (
              <div>
                <button
                  onClick={() => setShowRequestPayload(!showRequestPayload)}
                  className="w-full text-left text-sm font-semibold text-gray-800 mb-2 hover:text-gray-900 flex items-center justify-between"
                >
                  <span>Last Request Payload</span>
                  <span>{showRequestPayload ? '▼' : '▶'}</span>
                </button>
                {showRequestPayload && (
                  <div className="text-xs bg-gray-50 border border-gray-200 rounded-sm p-3 overflow-x-auto">
                    <pre className="whitespace-pre-wrap text-gray-800">
                      {JSON.stringify(lastRequestPayload, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {debugPrompts && (
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-gray-800 mb-2">Debug Prompts：</h4>

                {debugPrompts.systemPrompt && (
                  <div>
                    <p className="text-xs font-semibold text-gray-700 mb-1">System Prompt:</p>
                    <pre className="text-xs bg-gray-100 p-2 rounded-sm overflow-x-auto max-h-32">
                      {debugPrompts.systemPrompt}
                    </pre>
                  </div>
                )}

                {debugPrompts.userPrompt && (
                  <div>
                    <p className="text-xs font-semibold text-gray-700 mb-1">User Prompt:</p>
                    <pre className="text-xs bg-gray-100 p-2 rounded-sm overflow-x-auto max-h-32">
                      {debugPrompts.userPrompt}
                    </pre>
                  </div>
                )}

                {debugPrompts.selectedSkillIds && (
                  <div>
                    <p className="text-xs font-semibold text-gray-700 mb-1">Selected Skills:</p>
                    <p className="text-xs text-gray-600">{debugPrompts.selectedSkillIds.join(', ')}</p>
                  </div>
                )}

                {debugPrompts.selectionReason && (
                  <div>
                    <p className="text-xs font-semibold text-gray-700 mb-1">Selection Reason:</p>
                    <p className="text-xs text-gray-600">{debugPrompts.selectionReason}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
