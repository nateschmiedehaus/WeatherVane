export interface AuditLogEntry {
  id: number;
  tenant_id: string;
  actor_type: string;
  actor_id: string | null;
  action: string;
  payload: Record<string, unknown> | null;
  created_at: string;
}

export interface AuditLogResponse {
  tenant_id: string;
  logs: AuditLogEntry[];
}
