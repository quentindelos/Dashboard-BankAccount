import AssistantChat from "@/components/AssistantChat";
import { assistantProvider } from "@/lib/assistantShared";

export const dynamic = "force-dynamic";

export default function AssistantPage() {
  return <AssistantChat provider={assistantProvider(process.env)} />;
}
