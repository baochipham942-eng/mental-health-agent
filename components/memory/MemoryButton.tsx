'use client';

import { useState } from 'react';
import { Modal } from '@arco-design/web-react';
import { MemoryManagement } from './MemoryManagement';

export function MemoryButton() {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="flex h-[48px] w-full grow items-center justify-center gap-2 rounded-md bg-gray-50 p-3 text-sm font-medium hover:bg-purple-50 hover:text-purple-600 md:flex-none md:justify-start md:p-2 md:px-3 transition-colors"
            >
                🧠 我的记忆
            </button>

            <Modal
                visible={isOpen}
                onCancel={() => setIsOpen(false)}
                footer={null}
                title={null}
                closable={false}
                style={{ width: 720, maxWidth: '95vw' }}
                unmountOnExit
            >
                <MemoryManagement onClose={() => setIsOpen(false)} />
            </Modal>
        </>
    );
}
