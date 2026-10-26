CREATE TABLE madar_workspace (
  id integer PRIMARY KEY CHECK (id = 1),
  revision integer NOT NULL DEFAULT 0
);
INSERT INTO madar_workspace (id) VALUES (1);

CREATE TABLE madar_students (
  id text COLLATE "C" PRIMARY KEY,
  identity_key text NOT NULL,
  data jsonb NOT NULL,
  revision integer NOT NULL,
  deleted_at timestamptz
);
CREATE UNIQUE INDEX madar_student_identity ON madar_students(identity_key) WHERE deleted_at IS NULL;

CREATE TABLE madar_sessions (
  digest text PRIMARY KEY,
  key_version text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE madar_login_attempts (
  bucket text PRIMARY KEY,
  attempts integer NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE TABLE madar_changesets (
  id uuid PRIMARY KEY,
  owner text NOT NULL,
  expected_revision integer NOT NULL,
  total_chunks integer NOT NULL CHECK(total_chunks BETWEEN 1 AND 500),
  action text NOT NULL,
  student_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','committed')),
  result_revision integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE madar_chunks (
  operation_id uuid NOT NULL REFERENCES madar_changesets(id) ON DELETE CASCADE,
  part integer NOT NULL,
  digest text NOT NULL,
  payload jsonb NOT NULL,
  PRIMARY KEY(operation_id, part)
);
CREATE TABLE madar_audit (
  id uuid PRIMARY KEY,
  revision integer NOT NULL UNIQUE,
  at timestamptz NOT NULL DEFAULT now(),
  session_digest text NOT NULL,
  action text NOT NULL,
  student_id text NOT NULL,
  changed_ids jsonb NOT NULL,
  deleted_ids jsonb NOT NULL
);
CREATE TABLE madar_student_versions (
  student_id text NOT NULL,
  revision integer NOT NULL,
  data jsonb NOT NULL,
  deleted_at timestamptz,
  archived_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(student_id, revision)
);
