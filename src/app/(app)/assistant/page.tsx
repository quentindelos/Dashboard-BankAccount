import AssistantChat from "@/components/AssistantChat";
import { loadAssistantInfo } from "@/lib/assistantSettings";

export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  return <AssistantChat initial={await loadAssistantInfo()} />;
}
