import type { Metadata } from 'next';
import './globals.css';
// Arco Design 样式
import '@arco-design/web-react/dist/css/arco.css';
import { ArcoConfigProvider } from '@/components/providers/ArcoConfigProvider';

export const metadata: Metadata = {
  title: '心理树洞 - AI心理咨询',
  description: '基于认知行为疗法的AI心理咨询助手，帮助你识别情绪、调整认知、改善心理健康',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className="h-full">
      <body className="h-full min-h-dvh bg-slate-50 text-slate-900 antialiased">
        <ArcoConfigProvider>
          {children}
        </ArcoConfigProvider>
      </body>
    </html>
  );
}




