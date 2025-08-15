CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

create type user_role as enum (
    'admin',
    'member',
)

CREATE TABLE users (
	id UUID primary key default uuid_generate_v4(),
	name VARCHAR(30),
	lastname VARCHAR(30),
    type user_role default 'member',
	phone VARCHAR(20),
	email VARCHAR(30) UNIQUE,
	password VARCHAR(255),
	disabled BOOLEAN default false,
	created_at TIMESTAMP DEFAULT NOW(),
	updated_at TIMESTAMP default NOW()
);

CREATE TABLE user_sessions(
	sid UUID primary key,
	user_id UUID references users(id) on delete cascade,
	access_token VARCHAR UNIQUE,
	refresh_token VARCHAR UNIQUE,
	created_at TIMESTAMP DEFAULT NOW(),
	expires_at TIMESTAMP,
	CONSTRAINT user_session_unique UNIQUE (user_id, sid)
);