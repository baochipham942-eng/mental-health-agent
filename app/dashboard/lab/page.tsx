import { MentorSection } from '@/components/settings/MentorSection';

export const dynamic = 'force-dynamic';

export default function LabPage() {
    return (
        <div className="max-w-4xl mx-auto py-8">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-gray-900">智慧殿堂 (Lab)</h1>
                <p className="text-gray-500 mt-2">与历史上的伟大灵魂对话，探索潜意识的深海</p>
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
