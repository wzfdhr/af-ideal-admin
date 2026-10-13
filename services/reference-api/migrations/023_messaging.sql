CREATE TABLE message_templates (
 tenant_id text NOT NULL REFERENCES tenants(id),id text NOT NULL,name text NOT NULL,channel text NOT NULL CHECK(channel IN('notice','message','todo','alert')),
 draft_schema jsonb NOT NULL,draft_revision integer NOT NULL DEFAULT 1 CHECK(draft_revision>0),draft_state text NOT NULL DEFAULT 'draft' CHECK(draft_state IN('draft','pending','approved')),
 enabled boolean NOT NULL DEFAULT true,revision integer NOT NULL DEFAULT 1 CHECK(revision>0),active_version_id text,pending_review_id text,
 created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),archived_at timestamptz,
 PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,created_by) REFERENCES memberships(tenant_id,user_id)
);
CREATE TABLE message_template_reviews (
 tenant_id text NOT NULL,id text NOT NULL,template_id text NOT NULL,draft_revision integer NOT NULL CHECK(draft_revision>0),schema_snapshot jsonb NOT NULL,
 reviewer_id text NOT NULL,requested_by text NOT NULL,status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','approved','rejected','cancelled')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),reason text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now(),reviewed_at timestamptz,decided_by text,
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,id,template_id),FOREIGN KEY(tenant_id,template_id) REFERENCES message_templates(tenant_id,id),
 FOREIGN KEY(tenant_id,reviewer_id) REFERENCES memberships(tenant_id,user_id),FOREIGN KEY(tenant_id,requested_by) REFERENCES memberships(tenant_id,user_id),FOREIGN KEY(tenant_id,decided_by) REFERENCES memberships(tenant_id,user_id),
 CHECK(reviewer_id<>requested_by),CHECK(status NOT IN('approved','rejected') OR (decided_by IS NOT NULL AND decided_by=reviewer_id AND reviewed_at IS NOT NULL))
);
CREATE UNIQUE INDEX message_template_one_review ON message_template_reviews(tenant_id,template_id) WHERE status='pending';
CREATE TABLE message_template_versions (
 tenant_id text NOT NULL,id text NOT NULL,template_id text NOT NULL,version integer NOT NULL CHECK(version>0),review_id text NOT NULL,
 schema_snapshot jsonb NOT NULL,content_hash text NOT NULL,approved_by text NOT NULL,approved_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,template_id,id),UNIQUE(tenant_id,template_id,version),UNIQUE(tenant_id,review_id),
 FOREIGN KEY(tenant_id,template_id) REFERENCES message_templates(tenant_id,id),FOREIGN KEY(tenant_id,review_id,template_id) REFERENCES message_template_reviews(tenant_id,id,template_id),FOREIGN KEY(tenant_id,approved_by) REFERENCES memberships(tenant_id,user_id)
);
ALTER TABLE message_templates ADD FOREIGN KEY(tenant_id,id,active_version_id) REFERENCES message_template_versions(tenant_id,template_id,id);
ALTER TABLE message_templates ADD FOREIGN KEY(tenant_id,pending_review_id,id) REFERENCES message_template_reviews(tenant_id,id,template_id);
CREATE TRIGGER message_template_version_immutable BEFORE UPDATE OR DELETE ON message_template_versions FOR EACH ROW EXECUTE FUNCTION af_assignment_history_immutable();
CREATE FUNCTION af_message_review_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.status<>'pending' OR ROW(NEW.tenant_id,NEW.id,NEW.template_id,NEW.draft_revision,NEW.schema_snapshot,NEW.reviewer_id,NEW.requested_by,NEW.created_at) IS DISTINCT FROM ROW(OLD.tenant_id,OLD.id,OLD.template_id,OLD.draft_revision,OLD.schema_snapshot,OLD.reviewer_id,OLD.requested_by,OLD.created_at) THEN RAISE EXCEPTION 'Template review identity and snapshots are immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER message_review_immutable BEFORE UPDATE ON message_template_reviews FOR EACH ROW EXECUTE FUNCTION af_message_review_immutable();
CREATE TRIGGER message_review_no_delete BEFORE DELETE ON message_template_reviews FOR EACH ROW EXECUTE FUNCTION af_assignment_history_immutable();
CREATE FUNCTION af_message_approved_version() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM message_template_reviews r WHERE r.tenant_id=NEW.tenant_id AND r.id=NEW.review_id AND r.template_id=NEW.template_id AND r.status='approved' AND r.reviewer_id=NEW.approved_by AND r.decided_by=r.reviewer_id AND r.schema_snapshot=NEW.schema_snapshot) THEN RAISE EXCEPTION 'Version needs the actual approved review' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER message_approved_version BEFORE INSERT ON message_template_versions FOR EACH ROW EXECUTE FUNCTION af_message_approved_version();
CREATE TABLE message_announcements (
 tenant_id text NOT NULL REFERENCES tenants(id),id text NOT NULL,draft_schema jsonb NOT NULL,revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN('draft','published','revoked')),active_version_id text,published_revision integer CHECK(published_revision>0),created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,created_by) REFERENCES memberships(tenant_id,user_id)
);
CREATE TABLE message_announcement_versions (
 tenant_id text NOT NULL,id text NOT NULL,announcement_id text NOT NULL,version integer NOT NULL CHECK(version>0),schema_snapshot jsonb NOT NULL,
 audience_snapshot jsonb NOT NULL CHECK(jsonb_typeof(audience_snapshot)='array'),content_hash text NOT NULL,published_by text NOT NULL,published_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,announcement_id,id),UNIQUE(tenant_id,announcement_id,version),FOREIGN KEY(tenant_id,announcement_id) REFERENCES message_announcements(tenant_id,id),FOREIGN KEY(tenant_id,published_by) REFERENCES memberships(tenant_id,user_id)
);
ALTER TABLE message_announcements ADD FOREIGN KEY(tenant_id,id,active_version_id) REFERENCES message_announcement_versions(tenant_id,announcement_id,id);
CREATE TRIGGER message_announcement_version_immutable BEFORE UPDATE OR DELETE ON message_announcement_versions FOR EACH ROW EXECUTE FUNCTION af_assignment_history_immutable();
CREATE TABLE message_subscriptions (
 tenant_id text NOT NULL,user_id text NOT NULL,channel text NOT NULL CHECK(channel IN('notice','message','todo','alert')),subscribed boolean NOT NULL,
 delivery_modes jsonb NOT NULL,revision integer NOT NULL DEFAULT 1 CHECK(revision>0),updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,user_id,channel),FOREIGN KEY(tenant_id,user_id) REFERENCES memberships(tenant_id,user_id)
);
CREATE TABLE message_send_jobs (
 tenant_id text NOT NULL,id text NOT NULL,source_kind text NOT NULL CHECK(source_kind IN('template','announcement')),template_version_id text,announcement_version_id text,
 title text NOT NULL,content text NOT NULL,channel text NOT NULL CHECK(channel IN('notice','message','todo','alert')),variables jsonb NOT NULL DEFAULT '{}'::jsonb,
 audience jsonb NOT NULL,delivery_modes jsonb NOT NULL,scheduled_at timestamptz NOT NULL DEFAULT now(),authorization_code text NOT NULL,
 sender_id text NOT NULL,created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN('queued','running','sent','partial','failed','blocked','cancelled')),revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,template_version_id) REFERENCES message_template_versions(tenant_id,id),FOREIGN KEY(tenant_id,announcement_version_id) REFERENCES message_announcement_versions(tenant_id,id),
 FOREIGN KEY(tenant_id,sender_id) REFERENCES memberships(tenant_id,user_id),FOREIGN KEY(tenant_id,created_by) REFERENCES memberships(tenant_id,user_id),CHECK(sender_id=created_by),
 CHECK((source_kind='template' AND template_version_id IS NOT NULL AND announcement_version_id IS NULL) OR (source_kind='announcement' AND announcement_version_id IS NOT NULL AND template_version_id IS NULL))
);
CREATE TABLE message_recipients (
 tenant_id text NOT NULL,id text NOT NULL,job_id text NOT NULL,user_id text NOT NULL,delivery_modes jsonb NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','processing','sent','skipped','failed','blocked','cancelled')),attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 next_attempt_at timestamptz NOT NULL DEFAULT now(),lease_until timestamptz,claimed_by text,error_code text,error_message text,notification_id text,completed_at timestamptz,realtime_ack_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,job_id,user_id),FOREIGN KEY(tenant_id,job_id) REFERENCES message_send_jobs(tenant_id,id),FOREIGN KEY(tenant_id,user_id) REFERENCES memberships(tenant_id,user_id),FOREIGN KEY(tenant_id,notification_id) REFERENCES notifications(tenant_id,id),
 CHECK(status<>'sent' OR (notification_id IS NOT NULL AND completed_at IS NOT NULL)),CHECK(realtime_ack_at IS NULL OR (status='sent' AND notification_id IS NOT NULL)),CHECK(status<>'processing' OR (lease_until IS NOT NULL AND claimed_by IS NOT NULL))
);
CREATE INDEX message_recipient_pending ON message_recipients(status,next_attempt_at,lease_until);
CREATE INDEX message_job_schedule ON message_send_jobs(status,scheduled_at);
CREATE TABLE message_delivery_events (
 tenant_id text NOT NULL,id text NOT NULL,job_id text NOT NULL,recipient_id text,action text NOT NULL,actor_id text,actor_name text NOT NULL,
 detail jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,job_id) REFERENCES message_send_jobs(tenant_id,id),FOREIGN KEY(tenant_id,recipient_id) REFERENCES message_recipients(tenant_id,id),FOREIGN KEY(tenant_id,actor_id) REFERENCES memberships(tenant_id,user_id)
);
CREATE TRIGGER message_delivery_event_immutable BEFORE UPDATE OR DELETE ON message_delivery_events FOR EACH ROW EXECUTE FUNCTION af_assignment_history_immutable();
CREATE FUNCTION af_message_job_plan_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF ROW(NEW.tenant_id,NEW.id,NEW.source_kind,NEW.template_version_id,NEW.announcement_version_id,NEW.title,NEW.content,NEW.channel,NEW.variables,NEW.audience,NEW.delivery_modes,NEW.scheduled_at,NEW.authorization_code,NEW.sender_id,NEW.created_by,NEW.created_at) IS DISTINCT FROM ROW(OLD.tenant_id,OLD.id,OLD.source_kind,OLD.template_version_id,OLD.announcement_version_id,OLD.title,OLD.content,OLD.channel,OLD.variables,OLD.audience,OLD.delivery_modes,OLD.scheduled_at,OLD.authorization_code,OLD.sender_id,OLD.created_by,OLD.created_at) THEN RAISE EXCEPTION 'Message sending plan is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER message_job_plan_immutable BEFORE UPDATE ON message_send_jobs FOR EACH ROW EXECUTE FUNCTION af_message_job_plan_immutable();
CREATE TRIGGER message_job_no_delete BEFORE DELETE ON message_send_jobs FOR EACH ROW EXECUTE FUNCTION af_assignment_history_immutable();
CREATE FUNCTION af_message_recipient_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.status='sent' AND ROW(NEW.status,NEW.attempts,NEW.next_attempt_at,NEW.error_code,NEW.error_message,NEW.notification_id,NEW.completed_at) IS DISTINCT FROM ROW(OLD.status,OLD.attempts,OLD.next_attempt_at,OLD.error_code,OLD.error_message,OLD.notification_id,OLD.completed_at) THEN RAISE EXCEPTION 'Persisted delivery fact is immutable' USING ERRCODE='23514'; END IF;
 IF ROW(NEW.tenant_id,NEW.id,NEW.job_id,NEW.user_id,NEW.delivery_modes,NEW.created_at) IS DISTINCT FROM ROW(OLD.tenant_id,OLD.id,OLD.job_id,OLD.user_id,OLD.delivery_modes,OLD.created_at) OR (OLD.notification_id IS NOT NULL AND NEW.notification_id IS DISTINCT FROM OLD.notification_id) OR (OLD.realtime_ack_at IS NOT NULL AND NEW.realtime_ack_at IS DISTINCT FROM OLD.realtime_ack_at) THEN RAISE EXCEPTION 'Message recipient effect identity is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER message_recipient_identity BEFORE UPDATE ON message_recipients FOR EACH ROW EXECUTE FUNCTION af_message_recipient_identity();
CREATE TRIGGER message_recipient_no_delete BEFORE DELETE ON message_recipients FOR EACH ROW EXECUTE FUNCTION af_assignment_history_immutable();

INSERT INTO permission_definitions(code,title,module) VALUES
('message:template:list','查看消息模板','消息公告'),
('message:template:create','创建消息模板','消息公告'),
('message:template:update','编辑模板草稿','消息公告'),
('message:template:submit','提交模板审批','消息公告'),
('message:template:approve','审批消息模板','消息公告'),
('message:template:disable','启停消息模板','消息公告'),
('message:template:delete','归档消息模板','消息公告'),
('message:announcement:list','查看公告配置','消息公告'),
('message:announcement:create','创建公告','消息公告'),
('message:announcement:update','编辑公告草稿','消息公告'),
('message:announcement:publish','发布公告','消息公告'),
('message:announcement:revoke','撤销公告','消息公告'),
('message:announcement:read','阅读授权公告','消息公告'),
('message:subscription:read','查看本人订阅','消息公告'),
('message:subscription:update','保存本人订阅','消息公告'),
('message:send:list','查看消息发送事实','消息公告'),
('message:send:create','创建消息发送计划','消息公告'),
('message:send:cancel','取消待投递消息','消息公告'),
('message:send:retry','重试失败投递','消息公告');
INSERT INTO menu_route_catalogue(key,path,component_key,parent_key,locale,permissions,permission_mode,menu_type,default_order,protected) VALUES
('messageTemplates','/message/templates','MessageTemplatesPage','message','menu.message.templates','["message:template:list","message:template:approve","message:send:list","message:send:create"]'::jsonb,'any','menu',0,false),
('messageSubscriptions','/message/subscriptions','MessageSubscriptionsPage','message','menu.message.subscriptions','["message:subscription:read"]'::jsonb,'any','menu',0,false),
('messageAnnouncements','/message/announcements','MessageAnnouncementsPage','message','menu.message.announcements','["message:announcement:list","message:announcement:read"]'::jsonb,'any','menu',0,false);
INSERT INTO menu_resources(tenant_id,id,menu_name,menu_type,route_key,parent_id,sort) SELECT t.id,'default-'||r.key,r.locale,r.menu_type,r.key,'default-'||r.parent_key,r.default_order FROM tenants t CROSS JOIN menu_route_catalogue r WHERE r.key IN('messageTemplates','messageSubscriptions','messageAnnouncements');
CREATE FUNCTION af_messaging_notification_visible(subject_tenant text,subject_user text,notification text) RETURNS boolean LANGUAGE SQL STABLE AS $$
 SELECT NOT EXISTS(SELECT 1 FROM message_recipients r WHERE r.tenant_id=subject_tenant AND r.notification_id=notification) OR EXISTS(
  SELECT 1 FROM message_recipients r JOIN message_send_jobs j ON j.tenant_id=r.tenant_id AND j.id=r.job_id
  JOIN memberships m ON m.tenant_id=r.tenant_id AND m.user_id=r.user_id JOIN users u ON u.id=m.user_id
  LEFT JOIN message_announcement_versions av ON av.tenant_id=j.tenant_id AND av.id=j.announcement_version_id
  LEFT JOIN message_announcements a ON a.tenant_id=av.tenant_id AND a.id=av.announcement_id
  WHERE r.tenant_id=subject_tenant AND r.user_id=subject_user AND r.notification_id=notification AND r.status='sent' AND m.status='enabled' AND m.deleted_at IS NULL AND u.status='enabled'
  AND (j.source_kind='template' OR (a.status='published' AND a.active_version_id=av.id AND av.audience_snapshot ? subject_user AND (af_effective_permissions(subject_tenant,subject_user) ? 'message:announcement:read' OR af_effective_permissions(subject_tenant,subject_user) ? '*') AND ((av.schema_snapshot->>'expiresAt') IS NULL OR (av.schema_snapshot->>'expiresAt')::timestamptz>now())))
  AND ((j.audience->>'scope')='all' OR ((j.audience->>'scope')='self' AND j.sender_id=subject_user) OR ((j.audience->>'scope')='users' AND j.audience->'userIds' ? subject_user)
    OR ((j.audience->>'scope')='role' AND EXISTS(SELECT 1 FROM member_roles mr JOIN roles role ON role.tenant_id=mr.tenant_id AND role.id=mr.role_id WHERE mr.tenant_id=subject_tenant AND mr.user_id=subject_user AND role.id=j.audience->>'targetId' AND role.status='enabled' AND role.deleted_at IS NULL))
    OR ((j.audience->>'scope')='department' AND m.department_id=j.audience->>'targetId' AND EXISTS(SELECT 1 FROM departments d WHERE d.tenant_id=subject_tenant AND d.id=m.department_id AND d.status='enabled' AND d.deleted_at IS NULL)))
 )
$$;
