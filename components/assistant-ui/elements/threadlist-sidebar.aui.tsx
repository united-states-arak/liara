import type * as React from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { FolderThreadList } from "@/components/agent/folders/folder-thread-list";

export function ThreadListSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar {...props}>
      <SidebarHeader className="aui-sidebar-header mb-2 border-b">
        <div className="aui-sidebar-header-content flex items-center justify-between">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                size="lg"
                render={<a href="https://liara.ir" target="_blank" rel="noopener noreferrer" />}
              >
                <img
                  src="/brand/liara-logo.svg"
                  alt=""
                  className="aui-sidebar-header-logo h-5 w-auto"
                />
                <div className="aui-sidebar-header-heading me-6 flex flex-col gap-0.5 leading-none">
                  <span className="aui-sidebar-header-title font-semibold">Liara Assistant</span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarHeader>
      <SidebarContent className="aui-sidebar-content px-2">
        <FolderThreadList />
      </SidebarContent>
      {props.collapsible !== "none" && <SidebarRail />}
    </Sidebar>
  );
}
