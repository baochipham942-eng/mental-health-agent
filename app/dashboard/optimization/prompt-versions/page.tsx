'use client';

import React, { useState, useEffect } from 'react';

interface PromptVersionItem {
    id: string;
    name: string;
    hash: string;
    content: string;
    parentId: string | null;
    metadata: any;
    createdAt: string;
    evalCount: number;
    avgScore: number;
}

export default function PromptVersionsPage() {
    const [versions, setVersions] = useState<PromptVersionItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedA, setSelectedA] = useState<string | null>(null);
    const [selectedB, setSelectedB] = useState<string | null>(null);
    const [diffView, setDiffView] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch('/api/eval/prompt-versions');
                if (!res.ok) throw new Error('请求失败');
                const data = await res.json();
                setVersions(data.versions || []);
            } catch (e) {
                console.error('加载版本列表失败:', e);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const versionA = versions.find(v => v.id === selectedA);
    const versionB = versions.find(v => v.id === selectedB);

    // 按名称分组
    const groupedByName = new Map<string, PromptVersionItem[]>();
    for (const v of versions) {
        if (!groupedByName.has(v.name)) groupedByName.set(v.name, []);
        groupedByName.get(v.name)!.push(v);
    }

    return (
        <div className="max-w-7xl mx-auto px-6 py-6 space-y-8">
            <div>
                <h2 className="text-lg font-bold text-gray-900">Prompt 版本管理</h2>
                <p className="text-sm text-gray-500">版本历史、内容对比和评分关联</p>
            </div>

            {loading ? (
                <div className="text-center py-20 text-gray-400">加载中...</div>
            ) : versions.length === 0 ? (
                <div className="text-center py-20 text-gray-400">
                    <p>暂无 Prompt 版本记录</p>
                    <p className="text-xs mt-2">调用 <code className="bg-gray-100 px-1 rounded-sm">registerPrompt()</code> 注册第一个版本</p>
                </div>
            ) : (
                <>
                    {/* 版本列表（按名称分组） */}
                    {Array.from(groupedByName.entries()).map(([name, vList]) => (
                        <div key={name} className="bg-white border border-gray-200 rounded-lg p-6">
                            <h3 className="text-sm font-semibold text-gray-700 mb-3">
                                {name}
                                <span className="ml-2 text-xs text-gray-400 font-normal">{vList.length} 个版本</span>
                            </h3>

                            {/* 评分对比柱状图 */}
                            {vList.some(v => v.evalCount > 0) && (
                                <div className="mb-4">
                                    <div className="flex items-end gap-2 h-24">
                                        {vList.slice(0, 10).map(v => {
                                            const h = v.avgScore > 0 ? (v.avgScore / 10) * 80 : 4;
                                            return (
                                                <div key={v.id} className="flex flex-col items-center gap-1">
                                                    <span className="text-[10px] text-gray-400">{v.avgScore > 0 ? v.avgScore.toFixed(1) : '-'}</span>
                                                    <div
                                                        className="w-8 rounded-t bg-indigo-400"
                                                        style={{ height: `${h}px` }}
                                                        title={`${v.hash.slice(0, 8)} | 评估 ${v.evalCount} 条 | 均分 ${v.avgScore}`}
                                                    />
                                                    <span className="text-[9px] text-gray-400 font-mono">{v.hash.slice(0, 6)}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-gray-500 border-b">
                                        <th className="pb-2 font-medium w-8">对比</th>
                                        <th className="pb-2 font-medium w-[100px]">Hash</th>
                                        <th className="pb-2 font-medium">Prompt 内容预览</th>
                                        <th className="pb-2 font-medium w-[60px]">评估数</th>
                                        <th className="pb-2 font-medium w-[50px]">均分</th>
                                        <th className="pb-2 font-medium w-[120px]">创建时间</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {vList.map(v => (
                                        <React.Fragment key={v.id}>
                                            <tr
                                                className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${expandedId === v.id ? 'bg-indigo-50/40' : ''}`}
                                                onClick={() => setExpandedId(expandedId === v.id ? null : v.id)}
                                            >
                                                <td className="py-2" onClick={e => e.stopPropagation()}>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedA === v.id || selectedB === v.id}
                                                        onChange={() => {
                                                            if (selectedA === v.id) setSelectedA(null);
                                                            else if (selectedB === v.id) setSelectedB(null);
                                                            else if (!selectedA) setSelectedA(v.id);
                                                            else if (!selectedB) setSelectedB(v.id);
                                                            else { setSelectedA(selectedB); setSelectedB(v.id); }
                                                        }}
                                                        className="rounded-sm"
                                                    />
                                                </td>
                                                <td className="py-2 font-mono text-xs text-gray-600">{v.hash.slice(0, 10)}</td>
                                                <td className="py-2">
                                                    <p className="text-xs text-gray-600 leading-relaxed line-clamp-2" title={v.content}>
                                                        {v.content?.slice(0, 120) || '-'}
                                                        {v.content && v.content.length > 120 ? '...' : ''}
                                                    </p>
                                                    {v.metadata?.changeReason && (
                                                        <p className="text-[10px] text-indigo-500 mt-0.5">
                                                            变更: {v.metadata.changeReason}
                                                        </p>
                                                    )}
                                                </td>
                                                <td className="py-2 text-center">{v.evalCount}</td>
                                                <td className="py-2 text-center font-mono">{v.avgScore > 0 ? v.avgScore.toFixed(1) : '-'}</td>
                                                <td className="py-2 text-gray-400 text-xs">
                                                    {new Date(v.createdAt).toLocaleString('zh-CN')}
                                                </td>
                                            </tr>
                                            {expandedId === v.id && (
                                                <tr>
                                                    <td colSpan={6} className="p-0">
                                                        <div className="bg-gray-50 border-t border-b border-gray-200 px-6 py-4">
                                                            <div className="flex items-center justify-between mb-2">
                                                                <span className="text-xs font-medium text-gray-500">完整 Prompt 内容</span>
                                                                <span className="text-[10px] text-gray-400 font-mono">
                                                                    {v.hash} | {v.content?.length || 0} 字符
                                                                </span>
                                                            </div>
                                                            <pre className="bg-white border border-gray-200 rounded-md p-4 text-xs text-gray-700 whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
                                                                {v.content || '（空）'}
                                                            </pre>
                                                            {v.metadata && Object.keys(v.metadata).length > 0 && (
                                                                <div className="mt-3 text-xs text-gray-500">
                                                                    <span className="font-medium">元数据：</span>
                                                                    <span className="font-mono ml-1">{JSON.stringify(v.metadata, null, 2)}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ))}

                    {/* Diff 对比面板 */}
                    {selectedA && selectedB && versionA && versionB && (
                        <div className="bg-white border border-gray-200 rounded-lg p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-sm font-semibold text-gray-700">
                                    版本对比: {versionA.hash.slice(0, 8)} vs {versionB.hash.slice(0, 8)}
                                </h3>
                                <button
                                    onClick={() => setDiffView(!diffView)}
                                    className="text-xs text-indigo-600 hover:text-indigo-700"
                                >
                                    {diffView ? '查看全文' : '查看 Diff'}
                                </button>
                            </div>
                            {diffView ? (
                                <DiffDisplay contentA={versionA.content} contentB={versionB.content} />
                            ) : (
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <div className="text-xs text-gray-400 mb-1">{versionA.hash.slice(0, 8)}</div>
                                        <pre className="bg-gray-50 p-3 rounded-sm text-xs whitespace-pre-wrap max-h-80 overflow-y-auto">{versionA.content}</pre>
                                    </div>
                                    <div>
                                        <div className="text-xs text-gray-400 mb-1">{versionB.hash.slice(0, 8)}</div>
                                        <pre className="bg-gray-50 p-3 rounded-sm text-xs whitespace-pre-wrap max-h-80 overflow-y-auto">{versionB.content}</pre>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

function DiffDisplay({ contentA, contentB }: { contentA: string; contentB: string }) {
    const linesA = contentA.split('\n');
    const linesB = contentB.split('\n');
    const setA = new Set(linesA);
    const setB = new Set(linesB);

    const removed = linesA.filter(l => !setB.has(l));
    const added = linesB.filter(l => !setA.has(l));

    return (
        <div className="bg-gray-50 p-3 rounded-sm text-xs font-mono max-h-80 overflow-y-auto space-y-0.5">
            {removed.map((line, i) => (
                <div key={`r-${i}`} className="bg-red-50 text-red-700 px-2 py-0.5 rounded-xs">
                    - {line}
                </div>
            ))}
            {added.map((line, i) => (
                <div key={`a-${i}`} className="bg-green-50 text-green-700 px-2 py-0.5 rounded-xs">
                    + {line}
                </div>
            ))}
            {removed.length === 0 && added.length === 0 && (
                <div className="text-gray-400 text-center py-4">两个版本内容完全一致</div>
            )}
        </div>
    );
}
