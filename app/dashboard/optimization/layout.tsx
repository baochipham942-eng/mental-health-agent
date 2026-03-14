import { Metadata } from 'next';
import EvalNav from './eval-nav';

export const metadata: Metadata = {
    title: '评测中心',
};

export default function Layout({ children }: { children: React.ReactNode }) {
    return (
        <div className="h-full flex flex-col overflow-hidden">
            <EvalNav />
            <div className="flex-1 overflow-y-auto">
                {children}
            </div>
        </div>
    );
}
