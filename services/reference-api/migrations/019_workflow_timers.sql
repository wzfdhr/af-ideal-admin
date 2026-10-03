INSERT INTO permission_definitions(code,title,module) VALUES
 ('workflow:timer:read','查询授权范围内流程定时','审批'),('workflow:timer:retry','恢复授权范围内流程定时','审批');
ALTER TABLE workflow_activities DROP CONSTRAINT workflow_activities_kind_check;
ALTER TABLE workflow_activities ADD CONSTRAINT workflow_activities_kind_check CHECK(kind IN ('approval','sign','fork','wait'));
ALTER TABLE workflow_instances ADD UNIQUE(tenant_id,id,release_id);
CREATE TABLE workflow_timers (
 tenant_id text NOT NULL,id text NOT NULL,instance_id text NOT NULL,release_id text NOT NULL,node_id text NOT NULL,activity_id text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('resume','deadline')),due_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','completed','cancelled','blocked','failed')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 next_attempt_at timestamptz NOT NULL,lease_until timestamptz,claimed_by text,error_code text,completed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id),UNIQUE(tenant_id,instance_id,activity_id,kind),
 FOREIGN KEY(tenant_id,instance_id,release_id) REFERENCES workflow_instances(tenant_id,id,release_id),
 FOREIGN KEY(tenant_id,instance_id,activity_id) REFERENCES workflow_activities(tenant_id,instance_id,id),
 CHECK((status='processing')=(claimed_by IS NOT NULL AND lease_until IS NOT NULL))
);
CREATE INDEX workflow_timer_due ON workflow_timers(status,next_attempt_at,lease_until);
CREATE TABLE workflow_timer_events (
 tenant_id text NOT NULL,id text NOT NULL,timer_id text NOT NULL,kind text NOT NULL CHECK(kind IN ('resume','deadline','retry','blocked','failed')),
 timer_revision integer NOT NULL,attempt integer NOT NULL CHECK(attempt BETWEEN 0 AND 5),planned_at timestamptz NOT NULL,occurred_at timestamptz NOT NULL DEFAULT now(),
 actor_id text,source text NOT NULL CHECK(source IN ('user','scheduler')),trace_id text NOT NULL,
 PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,timer_id) REFERENCES workflow_timers(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES memberships(tenant_id,user_id),
 CHECK((source='user')=(actor_id IS NOT NULL))
);
CREATE UNIQUE INDEX workflow_timer_effect_once ON workflow_timer_events(tenant_id,timer_id,kind) WHERE kind IN ('resume','deadline');
CREATE TRIGGER timer_history_immutable BEFORE UPDATE OR DELETE ON workflow_timer_events FOR EACH ROW EXECUTE FUNCTION af_assignment_history_immutable();
ALTER TABLE workflow_history ADD COLUMN operator_kind text NOT NULL DEFAULT 'user' CHECK(operator_kind IN ('user','system'));
ALTER TABLE workflow_history ALTER COLUMN operator_id DROP NOT NULL;
ALTER TABLE workflow_history ADD CHECK((operator_kind='user')=(operator_id IS NOT NULL));
ALTER TABLE workflow_history ADD CHECK(operator_kind<>'system' OR action NOT IN ('start','approve','reject','withdraw','transfer','recover','sign'));
ALTER TABLE workflow_history DROP CONSTRAINT workflow_history_action_check;
ALTER TABLE workflow_history ADD CONSTRAINT workflow_history_action_check CHECK(action IN ('start','approve','reject','withdraw','copy','route','fork','join','sign','cancel','transfer','recover','timer-wait','timer-resume','timer-overdue'));

CREATE FUNCTION af_timer_identity_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF ROW(NEW.tenant_id,NEW.id,NEW.instance_id,NEW.release_id,NEW.node_id,NEW.activity_id,NEW.kind,NEW.due_at)
 IS DISTINCT FROM ROW(OLD.tenant_id,OLD.id,OLD.instance_id,OLD.release_id,OLD.node_id,OLD.activity_id,OLD.kind,OLD.due_at) THEN
  RAISE EXCEPTION 'Workflow timer identity and planned time are immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER timer_identity_immutable BEFORE UPDATE ON workflow_timers FOR EACH ROW EXECUTE FUNCTION af_timer_identity_immutable();
