"use client";

import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";

export function TeamSwitcher() {
  return (
    <OrganizationSwitcher
      hidePersonal
      afterCreateOrganizationUrl="/workspace"
      afterSelectOrganizationUrl="/workspace"
      afterLeaveOrganizationUrl="/workspace"
    />
  );
}

export function AccountControl() {
  return <UserButton />;
}
