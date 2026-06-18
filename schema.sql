CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    phone VARCHAR(30),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL
        CHECK (role IN ('owner', 'coworker')),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS properties (
    id SERIAL PRIMARY KEY,
    owner_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
    address VARCHAR(255) NOT NULL,
    neighborhood VARCHAR(100) NOT NULL,
    square_footage INTEGER NOT NULL
        CHECK (square_footage >= 1),
    garage BOOLEAN NOT NULL,
    public_transport BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workspaces (
    id SERIAL PRIMARY KEY,
    property_id INTEGER NOT NULL
        REFERENCES properties(id)
        ON DELETE CASCADE,
    owner_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
    type VARCHAR(100) NOT NULL,
    capacity INTEGER NOT NULL
        CHECK (capacity >= 1),
    smoking BOOLEAN NOT NULL,
    availability VARCHAR(30) NOT NULL,
    rental_term VARCHAR(30) NOT NULL,
    price NUMERIC(10, 2) NOT NULL
        CHECK (price >= 0),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contact_messages (
    id SERIAL PRIMARY KEY,
    workspace_id INTEGER NOT NULL
        REFERENCES workspaces(id)
        ON DELETE CASCADE,
    sender_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
    owner_id INTEGER NOT NULL
        REFERENCES users(id)
        ON DELETE CASCADE,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);