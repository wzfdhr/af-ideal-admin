-- Additional read indexes only; immutable audit rows and existing migration bytes remain intact.
CREATE INDEX audit_events_actor_time ON audit_events(tenant_id,actor_id,created_at DESC,id);
CREATE INDEX audit_events_trace_time ON audit_events(tenant_id,trace_id,created_at DESC,id);
CREATE INDEX audit_events_target_time ON audit_events(tenant_id,target_id,created_at DESC,id);
CREATE INDEX audit_events_module_time ON audit_events(tenant_id,module,created_at DESC,id);
