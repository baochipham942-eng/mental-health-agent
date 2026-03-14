'use client';

import { Alert } from '@arco-design/web-react';

interface CrisisBannerProps {
    isVisible: boolean;
    onDismiss?: () => void;
}

export function CrisisBanner({ isVisible, onDismiss }: CrisisBannerProps) {
    if (!isVisible) return null;

    return (
        <div className="mb-4">
            <Alert
                type="error"
                title="安全资源"
                closable={!!onDismiss}
                onClose={onDismiss}
                content={
                    <div className="text-sm">
                        <p>如果你现在很难受，这些资源可以帮到你：</p>
                        <ul className="mt-1 space-y-1 list-none pl-0">
                            <li>全国心理援助热线：<strong>400-161-9995</strong>（24小时）</li>
                            <li>生命热线：<strong>400-821-1215</strong>（24小时）</li>
                            <li>紧急情况请拨打：<strong>110</strong> 或 <strong>120</strong></li>
                        </ul>
                    </div>
                }
            />
        </div>
    );
}
