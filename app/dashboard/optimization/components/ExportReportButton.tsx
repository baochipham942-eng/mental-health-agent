/**
 * 评测报告导出按钮
 *
 * 点击后调用 /api/eval/report 并触发浏览器下载 HTML 文件。
 */

'use client';

import { Button, Message } from '@arco-design/web-react';
import { IconDownload } from '@arco-design/web-react/icon';
import { useState } from 'react';

interface Props {
  days?: number;
  limit?: number;
  className?: string;
}

export default function ExportReportButton({ days = 30, limit = 100, className }: Props) {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/eval/report?days=${days}&limit=${limit}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || '导出失败');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `eval-report-${new Date().toISOString().slice(0, 10)}.html`;
      a.click();
      URL.revokeObjectURL(url);
      Message.success('报告导出成功');
    } catch (e: any) {
      Message.error(e.message || '导出失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      icon={<IconDownload />}
      loading={loading}
      onClick={handleExport}
      className={className}
    >
      导出报告
    </Button>
  );
}
