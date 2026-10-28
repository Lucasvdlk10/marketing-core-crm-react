const administrativeRoles = new Set(["owner", "admin"]);

export function canManageTeam(role: string | undefined | null) {
  return administrativeRoles.has(String(role || "").toLowerCase());
}
export function canManageSettings(role: string | undefined | null) {
  return administrativeRoles.has(String(role || "").toLowerCase());
}
