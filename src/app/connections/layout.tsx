import { PermissionBoundary } from "@/components/shell/PermissionBoundary";

export default function ConnectionsLayout({ children }: LayoutProps<"/connections">) {
  return <PermissionBoundary permission="connections.view">{children}</PermissionBoundary>;
}
