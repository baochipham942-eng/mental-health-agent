'use client';

import { useState } from 'react';
import { MemoryManagement } from './MemoryManagement';

export function MemoryButton() {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="flex h-[48px] w-full grow items-center justify-center gap-2 rounded-md bg-slate-50 p-3 text-sm font-medium hover:bg-purple-50 hover:text-purple-600 md:flex-none md:justify-start md:p-2 md:px-3 transition-colors"
            >
                🧠 我的记忆
            </button>

            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setIsOpen(false);
                    }}
                >
                    <MemoryManagement onClose={() => setIsOpen(false)} />
                </div>
            )}
        </>
    );
}
