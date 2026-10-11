import { AdminShell } from "../AdminShell";
import { SupportPanel } from "../../care/SupportPanel";
export function AdminChatPage() {
  return (
    <AdminShell title="Chat" subtitle="Suporte aos nutricionistas.">
      <SupportPanel />
    </AdminShell>
  );
}
