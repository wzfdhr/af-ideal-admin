INSERT INTO permission_definitions(code,title,module) VALUES
 ('file:list','查看授权文件和附件','文件'),('file:upload','上传真实文件','文件'),
 ('file:download','下载授权文件','文件'),('file:preview','预览授权文件','文件'),('file:delete','删除本人未锁定附件','文件');
CREATE TABLE file_uploads (
 tenant_id text NOT NULL,id text NOT NULL,owner_id text NOT NULL,record_id text,
 file_name text NOT NULL,mime_type text NOT NULL,size integer NOT NULL CHECK(size BETWEEN 1 AND 20971520),
 sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'),
 status text NOT NULL DEFAULT 'uploading' CHECK(status IN ('uploading','completed','cancelled','expired')),
 revision integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',
 PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,owner_id) REFERENCES memberships(tenant_id,user_id),
 FOREIGN KEY(tenant_id,record_id) REFERENCES business_records(tenant_id,id)
);
CREATE TABLE file_parts (
 tenant_id text NOT NULL,upload_id text NOT NULL,part_index integer NOT NULL CHECK(part_index BETWEEN 0 AND 19),
 size integer NOT NULL CHECK(size BETWEEN 1 AND 1048576),sha256 text NOT NULL,object_key text NOT NULL,
 PRIMARY KEY(tenant_id,upload_id,part_index),FOREIGN KEY(tenant_id,upload_id) REFERENCES file_uploads(tenant_id,id)
);
CREATE TABLE stored_files (
 tenant_id text NOT NULL,id text NOT NULL,owner_id text NOT NULL,record_id text,
 file_name text NOT NULL,mime_type text NOT NULL,size integer NOT NULL,sha256 text NOT NULL,object_key text NOT NULL,
 status text NOT NULL DEFAULT 'scanning' CHECK(status IN ('scanning','processing','ready','infected','scan-failed','deleted')),
 revision integer NOT NULL DEFAULT 1,attempts integer NOT NULL DEFAULT 0,lease_until timestamptz,claimed_by text,
 next_attempt_at timestamptz NOT NULL DEFAULT now(),scan_engine text,scan_error text,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id),FOREIGN KEY(tenant_id,id) REFERENCES file_uploads(tenant_id,id),
 FOREIGN KEY(tenant_id,owner_id) REFERENCES memberships(tenant_id,user_id),
 FOREIGN KEY(tenant_id,record_id) REFERENCES business_records(tenant_id,id)
);
CREATE INDEX files_scan_queue ON stored_files(status,next_attempt_at,lease_until);
