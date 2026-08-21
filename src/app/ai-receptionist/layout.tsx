import { PermissionBoundary } from "@/components/shell/PermissionBoundary";

export default function ReceptionistLayout({ children }: LayoutProps<"/ai-receptionist">) {
  return <PermissionBoundary permission="ai.configure">{children}</PermissionBoundary>;
}
