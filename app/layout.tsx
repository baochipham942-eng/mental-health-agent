import type { Metadata } from 'next';
import './globals.css';
// Arco Design 样式
import '@arco-design/web-react/dist/css/arco.css';
import { ArcoConfigProvider } from '@/components/providers/ArcoConfigProvider';

import { NextAuthSessionProvider } from '@/components/providers/NextAuthSessionProvider';

export const metadata: Metadata = {
  title: '心灵树洞 - AI心理咨询',
  description: '基于认知行为疗法的AI心理咨询助手，帮助你识别情绪、调整认知、改善心理健康',
  icons: {
    icon: '/icon.png',
    shortcut: '/favicon.ico',
    apple: '/icon.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className="h-full">
      <body className="h-full min-h-dvh bg-slate-50 text-slate-900 antialiased">
        <NextAuthSessionProvider>
          <ArcoConfigProvider>
            {children}
          </ArcoConfigProvider>
        </NextAuthSessionProvider>
        <div id="modal-root" />
      </body>
    </html>
  );
}




