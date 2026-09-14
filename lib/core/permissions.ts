/**
 * Permission & Role Management System
 *
 * Fine-grained access control:
 * - 5 role templates (Owner, Admin, Manager, User, Viewer)
 * - Module-level permissions (CRM, Calendar, Sequences, etc)
 * - Action permissions (create, read, update, delete)
 * - Data visibility (own, team, all)
 * - Role customization
 * - Permission inheritance
 *
 * Used by: Multi-tenant teams, enterprise deployments
 */

export type RoleName = "OWNER" | "ADMIN" | "MANAGER" | "USER" | "VIEWER";

export type ModuleName =
  | "crm"
  | "calendar"
  | "sequences"
  | "workflows"
  | "forms"
  | "sms"
  | "reporting"
  | "api";

export type DataVisibility = "own" | "team" | "all";

export interface RolePermission {
  module: ModuleName;
  canCreate: boolean;
  canRead: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  dataVisibility: DataVisibility;
}

export interface Role {
  id: string;
  tenantId: string;
  name: string;
  roleName?: RoleName;
  description?: string;
  permissions: Map<ModuleName, RolePermission>;
  memberCount: number;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Get default role templates */
export function getDefaultRoles(): Record<RoleName, RolePermission[]> {
  return {
    OWNER: [
      {
        module: "crm",
        canCreate: true,
        canRead: true,
        canUpdate: true,
        canDelete: true,
        dataVisibility: "all",
      },
      {
        module: "calendar",
        canCreate: true,
        canRead: true,
        canUpdate: true,
        canDelete: true,
        dataVisibility: "all",
      },
      {
        module: "sequences",
        canCreate: true,
        canRead: true,
        canUpdate: true,
        canDelete: true,
        dataVisibility: "all",
      },
      {
        module: "workflows",
        canCreate: true,
        canRead: true,
        canUpdate: true,
        canDelete: true,
        dataVisibility: "all",
      },
      {
        module: "forms",
        canCreate: true,
        canRead: true,
        canUpdate: true,
        canDelete: true,
        dataVisibility: "all",
      },
      {
        module: "sms",
        canCreate: true,
        canRead: true,
        canUpdate: true,
        canDelete: true,
        dataVisibility: "all",
      },
      {
        module: "reporting",
        canCreate: true,
        canRead: true,
        canUpdate: true,
        canDelete: true,
        dataVisibility: "all",
      },
      {
        module: "api",
        canCreate: true,
        canRead: true,
        canUpdate: true,
        canDelete: true,
        dataVisibility: "all",
      },
    ],
    ADMIN: [
      {
        module: "crm",
        canCreate: true,
        canRead: true,
        canUpdate: true,
        canDelete: true,
        dataVisibility: "all",
      },
      {
        module: "calendar",
        canCreate: true,
        canRead: true,
        canUpdate: true,
        canDelete: true,
        dataVisibility: "all",
      },
      {
        module: "sequences",
        canCreate: true,
        canRead: true,
        canUpdate: true,
        canDelete: true,
        dataVisibility: "all",
      },
      {
        module: "workflows",
        canCreate: true,
        canRead: true,
        canUpdate: true,
        canDelete: true,
        dataVisibility: "all",
      },
      {
        module: "forms",
        canCreate: true,
        canRead: true,
        canUpdate: true,
        canDelete: true,
        dataVisibility: "all",
      },
      {
        module: "sms",
        canCreate: true,
        canRead: true,
        canUpdate: true,
        canDelete: false,
        dataVisibility: "all",
      },
      {
        module: "reporting",
        canCreate: true,
        canRead: true,
        canUpdate: true,
        canDelete: false,
        dataVisibility: "all",
      },
      {
        module: "api",
        canCreate: false,
        canRead: true,
        canUpdate: false,
        canDelete: false,
        dataVisibility: "all",
      },
    ],
    MANAGER: [
      {
        module: "crm",
        canCreate: true,
        canRead: true,
        canUpdate: true,
        canDelete: false,
        dataVisibility: "team",
      },
      {
        module: "calendar",
        canCreate: true,
        canRead: true,
        canUpdate: true,
        canDelete: false,
        dataVisibility: "team",
      },
      {
        module: "sequences",
        canCreate: true,
        canRead: true,
        canUpdate: true,
        canDelete: false,
        dataVisibility: "team",
      },
      {
        module: "workflows",
        canCreate: true,
        canRead: true,
        canUpdate: true,
        canDelete: false,
        dataVisibility: "team",
      },
      {
        module: "forms",
        canCreate: true,
        canRead: true,
        canUpdate: false,
        canDelete: false,
        dataVisibility: "team",
      },
      {
        module: "sms",
        canCreate: true,
        canRead: true,
        canUpdate: false,
        canDelete: false,
        dataVisibility: "team",
      },
      {
        module: "reporting",
        canCreate: true,
        canRead: true,
        canUpdate: false,
        canDelete: false,
        dataVisibility: "team",
      },
      {
        module: "api",
        canCreate: false,
        canRead: false,
        canUpdate: false,
        canDelete: false,
        dataVisibility: "team",
      },
    ],
    USER: [
      {
        module: "crm",
        canCreate: true,
        canRead: true,
        canUpdate: true,
        canDelete: false,
        dataVisibility: "own",
      },
      {
        module: "calendar",
        canCreate: true,
        canRead: true,
        canUpdate: true,
        canDelete: false,
        dataVisibility: "own",
      },
      {
        module: "sequences",
        canCreate: false,
        canRead: true,
        canUpdate: false,
        canDelete: false,
        dataVisibility: "team",
      },
      {
        module: "workflows",
        canCreate: false,
        canRead: true,
        canUpdate: false,
        canDelete: false,
        dataVisibility: "team",
      },
      {
        module: "forms",
        canCreate: false,
        canRead: true,
        canUpdate: false,
        canDelete: false,
        dataVisibility: "team",
      },
      {
        module: "sms",
        canCreate: false,
        canRead: true,
        canUpdate: false,
        canDelete: false,
        dataVisibility: "team",
      },
      {
        module: "reporting",
        canCreate: false,
        canRead: true,
        canUpdate: false,
        canDelete: false,
        dataVisibility: "own",
      },
      {
        module: "api",
        canCreate: false,
        canRead: false,
        canUpdate: false,
        canDelete: false,
        dataVisibility: "own",
      },
    ],
    VIEWER: [
      {
        module: "crm",
        canCreate: false,
        canRead: true,
        canUpdate: false,
        canDelete: false,
        dataVisibility: "all",
      },
      {
        module: "calendar",
        canCreate: false,
        canRead: true,
        canUpdate: false,
        canDelete: false,
        dataVisibility: "all",
      },
      {
        module: "sequences",
        canCreate: false,
        canRead: true,
        canUpdate: false,
        canDelete: false,
        dataVisibility: "all",
      },
      {
        module: "workflows",
        canCreate: false,
        canRead: true,
        canUpdate: false,
        canDelete: false,
        dataVisibility: "all",
      },
      {
        module: "forms",
        canCreate: false,
        canRead: true,
        canUpdate: false,
        canDelete: false,
        dataVisibility: "all",
      },
      {
        module: "sms",
        canCreate: false,
        canRead: true,
        canUpdate: false,
        canDelete: false,
        dataVisibility: "all",
      },
      {
        module: "reporting",
        canCreate: false,
        canRead: true,
        canUpdate: false,
        canDelete: false,
        dataVisibility: "all",
      },
      {
        module: "api",
        canCreate: false,
        canRead: false,
        canUpdate: false,
        canDelete: false,
        dataVisibility: "all",
      },
    ],
  };
}

/** Check if role has permission */
export function hasPermission(
  permissions: Map<ModuleName, RolePermission>,
  module: ModuleName,
  action: "create" | "read" | "update" | "delete"
): boolean {
  const perm = permissions.get(module);
  if (!perm) return false;

  switch (action) {
    case "create":
      return perm.canCreate;
    case "read":
      return perm.canRead;
    case "update":
      return perm.canUpdate;
    case "delete":
      return perm.canDelete;
  }
}

/** Check data visibility */
export function canViewData(
  userPermissions: Map<ModuleName, RolePermission>,
  module: ModuleName,
  resourceOwnerId: string,
  currentUserId: string,
  teamUserIds: string[]
): boolean {
  const perm = userPermissions.get(module);
  if (!perm || !perm.canRead) return false;

  if (perm.dataVisibility === "all") return true;
  if (perm.dataVisibility === "own") return resourceOwnerId === currentUserId;
  if (perm.dataVisibility === "team") {
    return resourceOwnerId === currentUserId || teamUserIds.includes(resourceOwnerId);
  }

  return false;
}

/** Build SQL WHERE clause for data visibility */
export function buildVisibilityFilter(
  dataVisibility: DataVisibility,
  currentUserId: string,
  ownerColumn: string = "owner_id"
): string {
  if (dataVisibility === "all") return "1=1"; // No filter
  if (dataVisibility === "own") return `${ownerColumn} = '${currentUserId}'`;
  if (dataVisibility === "team") {
    // In production, would look up team members
    return `${ownerColumn} = '${currentUserId}' OR owner_id IN (SELECT id FROM team_members)`;
  }
  return "0=1"; // Deny all
}

/** Role descriptions */
export const ROLE_DESCRIPTIONS: Record<RoleName, string> = {
  OWNER: "Full access to all features and settings. Can manage team and billing.",
  ADMIN: "Full access to CRM, calendar, and automation. Cannot manage billing or API.",
  MANAGER: "Can manage team data and create workflows. Limited to team visibility.",
  USER: "Can view and create own contacts and bookings. Limited automation access.",
  VIEWER: "Read-only access to all data. Cannot create or modify anything.",
};
