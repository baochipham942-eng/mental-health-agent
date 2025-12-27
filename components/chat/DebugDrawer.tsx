'use client';

import { useState } from 'react';

import { Session } from 'next-auth';

interface DebugDrawerProps {
  debugPrompts: any | null;
  validationError: any | null;
  emotions?: Array<{ messageId: string; emotion: { label: string; score: number } }>;
  lastRequestPayload?: any | null;
  user?: Session['user'];
}

export function DebugDrawer({ debugPrompts, validationError, emotions, lastRequestPayload, user }: DebugDrawerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showValidationError, setShowValidationError] = useState(!!validationError);
  const [showRequestPayload, setShowRequestPayload] = useState(false);

  // Permission Check: Only 'demo' or specific phone number can see debug info
  const canSeeDebug = user?.name === 'demo' || user?.phone === '13361909397' || user?.username === 'demo';

  if (!canSeeDebug) {
    return null;
  }

  if (!debugPrompts && !validationError && (!emotions || emotions.length === 0) && !lastRequestPayload) {
    return null;
  }

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
                    <div key={idx} className="text-xs bg-gray-50 p-2 rounded border border-gray-200">
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
                  <div className="text-xs bg-red-50 border border-red-200 rounded p-3 overflow-x-auto">
                    <pre className="whitespace-pre-wrap text-red-800">
                      {JSON.stringify(validationError, null, 2)}
                    </pre>
                  </div>
                )}
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
                  <div className="text-xs bg-gray-50 border border-gray-200 rounded p-3 overflow-x-auto">
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
                    <pre className="text-xs bg-gray-100 p-2 rounded overflow-x-auto max-h-32">
                      {debugPrompts.systemPrompt}
                    </pre>
                  </div>
                )}

                {debugPrompts.userPrompt && (
                  <div>
                    <p className="text-xs font-semibold text-gray-700 mb-1">User Prompt:</p>
                    <pre className="text-xs bg-gray-100 p-2 rounded overflow-x-auto max-h-32">
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
