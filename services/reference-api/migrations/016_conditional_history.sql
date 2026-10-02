ALTER TABLE workflow_history DROP CONSTRAINT workflow_history_action_check;
ALTER TABLE workflow_history ADD CONSTRAINT workflow_history_action_check
  CHECK (action IN ('start', 'approve', 'reject', 'withdraw', 'copy', 'route'));
