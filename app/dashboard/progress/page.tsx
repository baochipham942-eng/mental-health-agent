import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { ProgressPageContent } from './ProgressPageContent';

import { Metadata } from 'next';

export const metadata: Metadata = {
    title: '我的进度',
};

export const dynamic = 'force-dynamic';

export default async function ProgressPage() {
    const session = await auth();
    if (!session?.user) {
        redirect('/login');
    }

    return (
        <div className="h-full flex flex-col bg-slate-50">
            <ProgressPageContent />
        </div>
    );
}
