"use client";

import { RequireAuth } from "@/lib/guards";
import { ChatPanel } from "@/components/chat-panel";

export default function HomePage() {
  return (
    <RequireAuth>
      <ChatPanel />
    </RequireAuth>
  );
}
