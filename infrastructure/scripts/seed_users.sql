-- E2E テスト用ユーザー投入スクリプト
-- 使い方: psql -h 192.168.56.10 -p 32432 -U technomart -d technomart -f seed_users.sql

-- engineer ユーザー (password: engineer123)
INSERT INTO users (username, hashed_password, role, store_id)
VALUES (
  'engineer',
  '$2b$12$/buvRMwfBb242YxY.z1hDOPZsk7X6/5g3Mr4c3qcHM/T/u/XSHdjG',
  'engineer',
  NULL
)
ON CONFLICT (username) DO UPDATE
  SET hashed_password = EXCLUDED.hashed_password,
      role = EXCLUDED.role,
      store_id = EXCLUDED.store_id;

-- marketer ユーザー (password: marketer123)
INSERT INTO users (username, hashed_password, role, store_id)
VALUES (
  'marketer',
  '$2b$12$V0A63t2vdCEK6UQwUQHLbOEqAux8pUiM0uYZ3xhmBy0E9/0NXlBHi',
  'marketer',
  NULL
)
ON CONFLICT (username) DO UPDATE
  SET hashed_password = EXCLUDED.hashed_password,
      role = EXCLUDED.role,
      store_id = EXCLUDED.store_id;

-- store_manager ユーザー (password: manager123, store_id=1)
INSERT INTO users (username, hashed_password, role, store_id)
VALUES (
  'store_manager',
  '$2b$12$7zcVuQjNtVZtvMwIt6kZs.U83bdPSm5MEuqHBs/TfvvDmQGfDi8Am',
  'store_manager',
  1
)
ON CONFLICT (username) DO UPDATE
  SET hashed_password = EXCLUDED.hashed_password,
      role = EXCLUDED.role,
      store_id = EXCLUDED.store_id;
