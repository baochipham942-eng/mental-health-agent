import DashboardLayout from '@/app/dashboard/layout';

export const dynamic = 'force-dynamic';

export default function CLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // Reuse dashboard layout for /c/* routes
    return <DashboardLayout>{children}</DashboardLayout>;
}
