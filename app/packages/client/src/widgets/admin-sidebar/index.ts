// Public API of the admin-sidebar widget (SP2 Task 19; decision 0077): the administration's navigation.
export {
  type AdminContext,
  type AdminItem,
  adminContextOf,
  isAdminAreaActive,
  useAdminItems,
} from "./model/use-admin-items.ts";
export { AdminSidebar, type AdminSidebarProps } from "./ui/AdminSidebar.tsx";
