'use client';

interface CrisisBannerProps {
    isVisible: boolean;
    onDismiss?: () => void;
}

export function CrisisBanner({ isVisible, onDismiss }: CrisisBannerProps) {
    if (!isVisible) return null;

    return (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4 rounded-r-lg">
            <div className="flex items-start">
                <div className="flex-shrink-0">
                    <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                </div>
                <div className="ml-3 flex-1">
                    <h3 className="text-sm font-medium text-red-800">
                        安全资源
                    </h3>
                    <div className="mt-2 text-sm text-red-700">
                        <p>如果你现在很难受，这些资源可以帮到你：</p>
                        <ul className="mt-1 space-y-1">
                            <li>全国心理援助热线：<strong>400-161-9995</strong>（24小时）</li>
                            <li>生命热线：<strong>400-821-1215</strong>（24小时）</li>
                            <li>紧急情况请拨打：<strong>110</strong> 或 <strong>120</strong></li>
                        </ul>
                    </div>
                </div>
                {onDismiss && (
                    <button onClick={onDismiss} className="ml-auto text-red-400 hover:text-red-600">
                        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                    </button>
                )}
            </div>
        </div>
    );
}
