'use client';

import { SidebarItem } from './SidebarItem';

interface Session {
    id: string;
    title: string | null;
    status: string;
    createdAt: string;
    relativeDate: string;
}

interface SidebarListClientProps {
    sessions: Session[];
    hideSessionAction: (id: string) => Promise<void>;
}

export function SidebarListClient({ sessions, hideSessionAction }: SidebarListClientProps) {
    if (sessions.length === 0) {
        return (
            <div className="px-3 py-6 text-center">
                <div className="text-2xl mb-2">💭</div>
                <p className="text-sm text-slate-500">还没有对话记录</p>
                <p className="text-xs text-slate-400 mt-1">点击上方"新咨询"开始</p>
            </div>
        );
    }

    return (
        <div
            className="space-y-0.5"
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
                width: '100%',
                padding: 0,
                margin: 0,
                listStyle: 'none' // 防御性添加，防止外层有 ul 包裹
            }}
        >
            {sessions.map((session) => (
                <SidebarItem
                    key={session.id}
                    session={session}
                    relativeDate={session.relativeDate}
                    onHide={hideSessionAction}
                />
            ))}
        </div>
    );
}
