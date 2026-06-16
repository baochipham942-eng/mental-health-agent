import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { ensureUserProfile } from '@/lib/actions/auth';
import { AuthSync } from '@/components/auth/AuthSync';
import { DashboardBackLink } from '@/components/layout/DashboardBackLink';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await auth();
    if (!session?.user) {
        redirect('/login');
    }
    await ensureUserProfile(session);

    return (
        <div className="h-screen flex flex-col overflow-hidden bg-[#F7F8FA]">
            <AuthSync user={session.user} />
            <DashboardBackLink />
            <div className="flex-1 overflow-y-auto">
                {children}
            </div>
        </div>
    );
}
