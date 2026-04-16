'use client';

import React, { useState } from 'react';
import { MBTI_PERSONAS, MBTIPersona, getMBTIPersona } from '@/lib/ai/mbti/personas';
import { Button, Select, Message, Tooltip } from '@arco-design/web-react';
import { IconSwap, IconUser } from '@arco-design/web-react/icon';
import { MBTIChatWindow } from './MBTIChatWindow';
import { cn } from '@/lib/utils/cn';

const Option = Select.Option;

export function MBTISection() {
    const [userType, setUserType] = useState<string>('INTJ'); // Default
    const [activePersona, setActivePersona] = useState<MBTIPersona | null>(null);
    const [isRandomizing, setIsRandomizing] = useState(false);

    const handleRandomMatch = () => {
        setIsRandomizing(true);
        // Fake shuffle animation effect
        let count = 0;
        const interval = setInterval(() => {
            const randomIndex = Math.floor(Math.random() * MBTI_PERSONAS.length);
            // Just visual feedback if we had a "highlight" state, but for now simple delay
            count++;
            if (count > 5) {
                clearInterval(interval);
                const finalIndex = Math.floor(Math.random() * MBTI_PERSONAS.length);
                setActivePersona(MBTI_PERSONAS[finalIndex]);
                setIsRandomizing(false);
                Message.success(`匹配成功！你的镜像是：${MBTI_PERSONAS[finalIndex].name}`);
            }
        }, 100);
    };

    return (
        <div className="space-y-6" style={{ width: '100%' }}>
            {/* Header Area */}
            <div className="w-full bg-linear-to-r from-purple-50 to-indigo-50 rounded-xl p-6 border border-purple-100">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                            🪞 镜像回廊 (Hall of Mirrors)
                            <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-600 text-xs font-bold border border-purple-200">NEW</span>
                        </h2>
                        <p className="text-sm text-gray-600 mt-2 max-w-lg">
                            在这里，你可以与 16 种不同的人格进行深度对话。
                            <br />
                            <span className="opacity-80">无论是寻找共鸣，还是挑战认知，每一次对话都是一面镜子。</span>
                        </p>
                    </div>

                    {/* Integrated Control Tools */}
                    <div className="flex flex-col sm:flex-row items-center gap-3">
                        <div className="flex items-center gap-2 bg-white/50 p-1 rounded-lg border border-purple-100/50">
                            <span className="text-xs font-medium text-gray-500 ml-2">我是:</span>
                            <Select
                                style={{ width: 130 }}
                                value={userType}
                                onChange={setUserType}
                                className="[&_.arco-select-view]:bg-transparent! [&_.arco-select-view]:border-none!"
                                triggerProps={{
                                    autoAlignPopupWidth: false,
                                    autoAlignPopupMinWidth: true,
                                    position: 'bl',
                                }}
                            >
                                {MBTI_PERSONAS.map(p => (
                                    <Option key={p.id} value={p.type} extra={p.name}>
                                        <span className="font-semibold">{p.type}</span>
                                        <span className="text-gray-400 text-xs ml-2">{p.name}</span>
                                    </Option>
                                ))}
                            </Select>
                        </div>

                        <Button
                            type="primary"
                            className="bg-purple-600 hover:bg-purple-700 rounded-lg! h-9 px-4"
                            icon={<IconSwap />}
                            onClick={handleRandomMatch}
                            loading={isRandomizing}
                        >
                            {isRandomizing ? '...' : '随机匹配'}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Grid Area */}
            <div className="w-full grid grid-cols-2 md:grid-cols-4 gap-5">
                {MBTI_PERSONAS.map((persona) => {
                    const isAnalyst = ['INTJ', 'INTP', 'ENTJ', 'ENTP'].includes(persona.type);
                    const isDiplomat = ['INFJ', 'INFP', 'ENFJ', 'ENFP'].includes(persona.type);
                    const isSentinel = ['ISTJ', 'ISFJ', 'ESTJ', 'ESFJ'].includes(persona.type);
                    // Explorer defaults

                    let borderColor = 'border-gray-200';
                    let hoverColor = 'hover:border-purple-400';
                    let bgColor = 'bg-white';

                    if (isAnalyst) { borderColor = 'border-purple-200'; hoverColor = 'hover:border-purple-500'; bgColor = 'bg-purple-50/30'; }
                    if (isDiplomat) { borderColor = 'border-green-200'; hoverColor = 'hover:border-green-500'; bgColor = 'bg-green-50/30'; }
                    if (isSentinel) { borderColor = 'border-blue-200'; hoverColor = 'hover:border-blue-500'; bgColor = 'bg-blue-50/30'; }
                    if (!isAnalyst && !isDiplomat && !isSentinel) { borderColor = 'border-yellow-200'; hoverColor = 'hover:border-yellow-500'; bgColor = 'bg-yellow-50/30'; }

                    return (
                        <div
                            key={persona.id}
                            onClick={() => setActivePersona(persona)}
                            className={cn(
                                "relative group cursor-pointer transition-all duration-300 rounded-xl border p-5 hover:shadow-md",
                                borderColor,
                                hoverColor,
                                bgColor
                            )}
                        >
                            <div className="text-4xl mb-3 filter drop-shadow-xs group-hover:scale-110 transition-transform origin-left">
                                {persona.avatar}
                            </div>
                            <div>
                                <h3 className="font-bold text-gray-900 group-hover:text-purple-700 transition-colors">
                                    {persona.type}
                                </h3>
                                <p className="text-xs font-medium text-gray-500 mb-1">{persona.name}</p>
                                <p className="text-[10px] text-gray-400 opacity-80 line-clamp-2 leading-tight">
                                    {persona.alias}
                                </p>
                            </div>

                            {/* Hover Badge */}
                            <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                <span className="text-xs bg-white/80 backdrop-blur-sm px-2 py-1 rounded-full shadow-xs text-purple-600 font-medium">
                                    对话
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Chat Window */}
            {activePersona && (
                <MBTIChatWindow
                    userMbti={userType}
                    targetPersona={activePersona}
                    onClose={() => setActivePersona(null)}
                />
            )}
        </div>
    );
}
