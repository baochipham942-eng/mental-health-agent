'use client';

import React, { useState } from 'react';
import { MentorPersona } from '@/lib/ai/mentors/personas';
import { Button, Input, Message, Card } from '@arco-design/web-react';
import { MentorChatWindow } from '@/components/settings/MentorChatWindow';
import { IconRobot, IconEdit, IconMessage } from '@arco-design/web-react/icon';

export function CustomMasterSection() {
    const [name, setName] = useState('');
    const [prompt, setPrompt] = useState('');
    const [activeMentor, setActiveMentor] = useState<MentorPersona | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);

    const handleStartChat = async () => {
        if (!name.trim()) {
            Message.error('请输入大师名字');
            return;
        }
        if (!prompt.trim()) {
            Message.error('请输入大师的设定 Prompt');
            return;
        }

        setIsGenerating(true);

        try {
            // Generate personalized opening message and title using AI
            const response = await fetch('/api/chat/mentor/generate-opening', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: name.trim(),
                    systemPrompt: prompt.trim(),
                }),
            });

            let openingMessage = `你好，我是${name.trim()}。有什么想和我聊的吗？`;
            let title = '自定义大师';

            if (response.ok) {
                const data = await response.json();
                if (data.openingMessage) {
                    openingMessage = data.openingMessage;
                }
                if (data.title) {
                    title = data.title;
                }
            }

            const customMentor: MentorPersona = {
                id: `custom-${Date.now()}`,
                name: name.trim(),
                title,
                avatar: '🎭',
                themeColor: 'indigo',
                description: '用户自定义的大师角色',
                openingMessage,
                systemPrompt: prompt.trim(),
            };

            setActiveMentor(customMentor);
        } catch (error) {
            console.error('Failed to generate opening message:', error);
            // Fallback: start chat with generic opening
            const customMentor: MentorPersona = {
                id: `custom-${Date.now()}`,
                name: name.trim(),
                title: '自定义大师',
                avatar: '🎭',
                themeColor: 'indigo',
                description: '用户自定义的大师角色',
                openingMessage: `你好，我是${name.trim()}。有什么想和我聊的吗？`,
                systemPrompt: prompt.trim(),
            };
            setActiveMentor(customMentor);
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header Area */}
            <div className="bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl p-6 border border-purple-100">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                            ✨ 自定义大师 (Custom Master)
                        </h2>
                        <p className="text-sm text-gray-600 mt-2 max-w-lg">
                            <span className="font-semibold text-purple-700">发挥你的想象力</span>，创造一位专属的大师。
                            <br />
                            <span className="opacity-80">无论是小说人物、历史名人，还是你虚构的智者。</span>
                        </p>
                    </div>
                </div>
            </div>

            {/* Form Area */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 md:p-8 shadow-sm max-w-3xl mx-auto">
                <div className="space-y-6">
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            大师名字
                        </label>
                        <Input
                            placeholder="例如：乔布斯、哈利波特、我的未来自己..."
                            value={name}
                            onChange={setName}
                            prefix={<IconRobot />}
                            className="bg-gray-50 border-gray-200 hover:bg-white focus:bg-white !rounded-lg py-1"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            系统 Prompt (角色设定)
                        </label>
                        <Input.TextArea
                            placeholder="请详细描述大师的背景、性格、说话语气。例如：'你从未学过编程，但你是世界顶级的厨师。你会用烹饪的比喻来解释一切问题...'"
                            value={prompt}
                            onChange={setPrompt}
                            rows={8}
                            className="bg-gray-50 border-gray-200 hover:bg-white focus:bg-white !rounded-lg text-sm leading-relaxed"
                            style={{ resize: 'none' }}
                        />
                        <p className="text-xs text-gray-400 mt-2 text-right">
                            越详细的设定，体验越好
                        </p>
                    </div>

                    <div className="pt-4 flex justify-end">
                        <Button
                            type="primary"
                            size="large"
                            onClick={handleStartChat}
                            loading={isGenerating}
                            disabled={isGenerating}
                            className="w-full md:w-auto px-8 rounded-xl bg-purple-600 hover:bg-purple-700 shadow-md transition-all"
                            icon={<IconMessage />}
                        >
                            {isGenerating ? '正在创造大师...' : '开始对话'}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Chat Window */}
            {activeMentor && (
                <MentorChatWindow
                    mentor={activeMentor}
                    onClose={() => setActiveMentor(null)}
                />
            )}
        </div>
    );
}
