"use client";

import { createContext, useContext } from "react";
import type { Permission } from "@/lib/auth/permissions";

const Permissions = createContext<ReadonlySet<string>>(new Set());
export const PermissionsProvider = Permissions.Provider;
/** Whether to offer something. The server and the database decide again. */
export const usePermission = (permission: Permission) => useContext(Permissions).has(permission);
