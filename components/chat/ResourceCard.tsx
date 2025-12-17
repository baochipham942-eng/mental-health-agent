'use client';

import { useState } from 'react';
import { AnyResource, CrisisHotlineResource, PsychoEducationResource, CopingStrategyResource } from '@/lib/rag/types';
import ReactMarkdown from 'react-markdown';

interface ResourceCardProps {
    resource: AnyResource;
}

export function ResourceCard({ resource }: ResourceCardProps) {
    const [expanded, setExpanded] = useState(false);

    const toggleExpanded = () => setExpanded(!expanded);

    if (resource.type === 'crisis_hotline') {
        return <HotlineCard resource={resource} />;
    }

    if (resource.type === 'psycho_education') {
        return <EducationCard resource={resource} expanded={expanded} onToggle={toggleExpanded} />;
    }

    if (resource.type === 'coping_strategy') {
        return <StrategyCard resource={resource} expanded={expanded} onToggle={toggleExpanded} />;
    }

    return null;
}

function HotlineCard({ resource }: { resource: CrisisHotlineResource }) {
    return (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-2">
            <div className="flex items-start justify-between">
                <div>
                    <h3 className="font-bold text-red-800">{resource.title}</h3>
                    <p className="text-sm text-red-600 mt-1">{resource.description}</p>
                    <div className="mt-3 flex items-center gap-2 flex-wrap">
                        <a
                            href={`tel:${resource.phone}`}
                            className="inline-flex items-center px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
                        >
                            📞 拨打 {resource.phone}
                        </a>
                        <span className="text-xs text-red-500">{resource.hours}</span>
                    </div>
                </div>
            </div>
        </div>
    );
}

function EducationCard({ resource, expanded, onToggle }: { resource: PsychoEducationResource; expanded: boolean; onToggle: () => void }) {
    return (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-2 transition-all">
            <div className="flex items-start justify-between cursor-pointer" onClick={onToggle}>
                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] rounded-full font-medium">心理科普</span>
                        <span className="text-xs text-blue-500">阅读时间: {resource.readingTime}分钟</span>
                    </div>
                    <h3 className="font-bold text-gray-900">{resource.title}</h3>
                    {!expanded && <p className="text-sm text-gray-600 mt-1 line-clamp-2">{resource.description}</p>}
                </div>
                <button className="text-blue-500 text-xl font-bold ml-2 w-6 h-6 flex items-center justify-center">
                    {expanded ? '−' : '+'}
                </button>
            </div>

            {expanded && (
                <div className="mt-4 pt-4 border-t border-blue-100 animate-in fade-in slide-in-from-top-2">
                    <div className="prose prose-sm max-w-none text-gray-700">
                        <ReactMarkdown>{resource.content}</ReactMarkdown>
                    </div>
                    <button
                        onClick={onToggle}
                        className="mt-4 w-full py-2 text-sm text-blue-600 font-medium hover:bg-blue-100 rounded transition-colors"
                    >
                        收起文章
                    </button>
                </div>
            )}
        </div>
    );
}

function StrategyCard({ resource, expanded, onToggle }: { resource: CopingStrategyResource; expanded: boolean; onToggle: () => void }) {
    return (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-2">
            <div className="flex items-start justify-between cursor-pointer" onClick={onToggle}>
                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] rounded-full font-medium">应对策略</span>
                        <span className="text-xs text-green-600">难度: {resource.difficulty} • {resource.duration}</span>
                    </div>
                    <h3 className="font-bold text-gray-900">{resource.title}</h3>
                    <p className="text-sm text-gray-600 mt-1">{resource.description}</p>
                </div>
                <button className="text-green-600 text-xl font-bold ml-2 w-6 h-6 flex items-center justify-center">
                    {expanded ? '−' : '+'}
                </button>
            </div>

            {expanded && (
                <div className="mt-4 pt-4 border-t border-green-100">
                    <div className="space-y-2">
                        {resource.steps.map((step, idx) => (
                            <div key={idx} className="flex gap-3 bg-white p-2 rounded border border-green-100">
                                <span className="flex-shrink-0 w-5 h-5 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-xs font-bold">
                                    {idx + 1}
                                </span>
                                <p className="text-sm text-gray-700">{step}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
