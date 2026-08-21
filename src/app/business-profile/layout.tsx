import { PermissionBoundary } from "@/components/shell/PermissionBoundary";

export default function BusinessProfileLayout({ children }: LayoutProps<"/business-profile">) {
  return <PermissionBoundary permission="business.edit">{children}</PermissionBoundary>;
}
