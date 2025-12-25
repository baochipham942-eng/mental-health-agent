import { LabContent } from '@/components/lab/LabContent';

export const dynamic = 'force-dynamic';

export default function LabPage() {
    return (
        <div className="w-full max-w-6xl mx-auto py-4 px-4 sm:px-6">
            <LabContent />
        </div>
    );
}

