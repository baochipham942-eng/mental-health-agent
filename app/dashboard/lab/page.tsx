import { LabContent } from '@/components/lab/LabContent';
import { Metadata } from 'next';

export const metadata: Metadata = {
    title: '心理实验室',
};

export const dynamic = 'force-dynamic';

export default function LabPage() {
    return (
        <div className="w-full max-w-6xl mx-auto py-4 px-4 sm:px-6">
            <LabContent />
        </div>
    );
}

