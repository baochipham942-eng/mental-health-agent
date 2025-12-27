import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { MemoryPageContent } from '@/components/memory/MemoryPageContent';

import { Metadata } from 'next';

export const metadata: Metadata = {
    title: '我的记忆',
};

export const dynamic = 'force-dynamic';

export default async function MemoryPage() {
    const session = await auth();
    if (!session?.user) {
        redirect('/login');
    }

    return (
        <div className="h-full flex flex-col bg-slate-50">
            <MemoryPageContent />
        </div>
    );
}
