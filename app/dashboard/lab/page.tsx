import { MentorSection } from '@/components/settings/MentorSection';

export const dynamic = 'force-dynamic';

export default function LabPage() {
    return (
        <div className="max-w-4xl mx-auto py-8">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-gray-900">实验室 (Laboratory)</h1>
                <p className="text-gray-500 mt-2">探索实验性功能与前沿交互体验</p>
            </div>

            <div className="space-y-12">
                {/* Hall of Wisdom Feature */}
                <section>
                    <MentorSection />
                </section>
            </div>
        </div>
    );
}
