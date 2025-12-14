import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '心理疗愈助手 - AI心理咨询',
  description: '基于认知行为疗法的AI心理咨询助手，帮助你识别情绪、调整认知、改善心理健康',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}




