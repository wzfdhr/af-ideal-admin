-- Register the implemented audit-export page without rewriting existing tenant menus.
INSERT INTO menu_route_catalogue(key,path,component_key,parent_key,locale,permissions,permission_mode,menu_type,default_order,protected) VALUES
('auditExportJobs','/audit/exports','AuditExportJobs','audit','menu.audit.exports',
 '["audit:export:list","audit:export:create","audit:export:cancel","audit:export:retry","audit:export:archive","audit:export:download"]'::jsonb,
 'any','menu',1,false);

INSERT INTO menu_resources(tenant_id,id,menu_name,menu_type,route_key,parent_id,sort)
 SELECT t.id,'default-'||r.key,r.locale,r.menu_type,r.key,parent.id,r.default_order
 FROM tenants t CROSS JOIN menu_route_catalogue r
 LEFT JOIN LATERAL (
   SELECT m.id FROM menu_resources m
   WHERE m.tenant_id=t.id AND m.route_key='audit'
   ORDER BY (m.deleted_at IS NULL) DESC,m.created_at,m.id LIMIT 1
 ) parent ON true
 WHERE r.key='auditExportJobs'
 AND NOT EXISTS(SELECT 1 FROM menu_resources m WHERE m.tenant_id=t.id AND m.route_key=r.key)
 ON CONFLICT DO NOTHING;
