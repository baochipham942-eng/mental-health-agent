import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { ProgressPageContent } from './ProgressPageContent';

import { Metadata } from 'next';

export const metadata: Metadata = {
    title: '情绪趋势',
};

export const dynamic = 'force-dynamic';

export default async function ProgressPage() {
    const session = await auth();
    if (!session?.user) {
        redirect('/login');
    }

    return (
        <div className="h-full flex flex-col overflow-y-auto">
            <ProgressPageContent />
        </div>
    );
}
