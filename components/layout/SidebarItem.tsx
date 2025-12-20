'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button, Modal, Message, Tooltip } from '@arco-design/web-react';
import { IconDelete } from '@arco-design/web-react/icon';

interface SidebarItemProps {
    session: {
        id: string;
        title: string | null;
        status: string;
        createdAt: string;
    };
    relativeDate: string;
    onHide: (id: string) => Promise<void>;
}

export function SidebarItem({ session, relativeDate, onHide }: SidebarItemProps) {
    const pathname = usePathname();
    const isActive = pathname === `/dashboard/${session.id}`;
    const [isHiding, setIsHiding] = useState(false);

    const handleDelete = async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();

        Modal.confirm({
            title: <div className="text-center w-full">删除会话</div>,
            content: <div className="text-center w-full pb-2">确定要从列表中移除此会话吗？</div>,
            okText: '确定删除',
            cancelText: '取消',
            icon: null,
            style: { width: 320, borderRadius: 12 },
            onOk: async () => {
                setIsHiding(true);
                try {
                    await onHide(session.id);
                    Message.success('已隐藏');
                } catch (err) {
                    Message.error('操作失败');
                } finally {
                    setIsHiding(false);
                }
            },
        });
    };

    return (
        <li className="group relative">
            <Tooltip content={`ID: ${session.id}`} position="right" mini>
                <Link
                    href={`/dashboard/${session.id}`}
                    className={`
                        flex items-center gap-2 rounded-lg p-2.5 text-sm font-medium transition-all
                        ${isActive
                            ? 'bg-indigo-50 text-indigo-700'
                            : 'hover:bg-slate-50 text-gray-700 hover:text-indigo-600'
                        }
                    `}
                >
                    <span className="flex-1 truncate px-1">
                        {session.title || '未命名对话'}
                    </span>
                    <span className={`
                        text-xs flex-shrink-0 transition-opacity
                        ${isActive ? 'text-indigo-400' : 'text-slate-400 group-hover:text-indigo-400'}
                        group-hover:opacity-0
                    `}>
                        {relativeDate}
                    </span>
                </Link>
            </Tooltip>

            {/* Delete button - visible on hover */}
            <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                    type="text"
                    size="mini"
                    status="danger"
                    icon={<IconDelete />}
                    loading={isHiding}
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDelete(e as any);
                    }}
                    className="!bg-white/80 hover:!bg-red-50"
                />
            </div>
        </li>
    );
}
