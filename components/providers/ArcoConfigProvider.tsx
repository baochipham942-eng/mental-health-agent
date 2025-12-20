'use client';

import { ConfigProvider } from '@arco-design/web-react';
import { ReactNode } from 'react';

/**
 * Arco Design ConfigProvider 包装器
 * 用于在 Next.js App Router 中配置 Arco Design 主题
 */
export function ArcoConfigProvider({ children }: { children: ReactNode }) {
    return (
        <ConfigProvider
            componentConfig={{
                Button: {
                    // 默认按钮属性
                },
                Modal: {
                    maskClosable: true,
                    focusLock: true,
                },
                Dropdown: {
                    trigger: 'hover',
                },
            }}
        >
            {children}
        </ConfigProvider>
    );
}
