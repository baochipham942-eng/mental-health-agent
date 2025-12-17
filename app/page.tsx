import dynamic from "next/dynamic";

const ChatShell = dynamic(() => import("@/components/chat/ChatShell").then(mod => ({ default: mod.ChatShell })), { ssr: false });

export default function Page() {
  return (
    <main className="min-h-dvh w-full bg-slate-50">
      <ChatShell sessionId="default-session" initialMessages={[]} />
    </main>
  );
}




