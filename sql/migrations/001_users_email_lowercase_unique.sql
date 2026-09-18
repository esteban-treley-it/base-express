-- Emails are normalized to lowercase by the API and must be unique case-insensitively.
-- Brings an existing database in line with sql/indexes.sql (fresh installs already have the index).
--
-- If this fails, two accounts share an email that differs only by case. Resolve them by hand
-- (merge or rename one), then run `npm run migrate` again; nothing is applied until it succeeds.

UPDATE users SET email = lower(email) WHERE email <> lower(email);

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_lower ON users (lower(email));
