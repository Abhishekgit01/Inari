-- CyberGuardian DB init: customer data + audit tables
CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(200),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    action VARCHAR(50),
    table_name VARCHAR(50),
    user_name VARCHAR(50),
    timestamp TIMESTAMP DEFAULT NOW()
);

INSERT INTO customers (name, email) VALUES
    ('Acme Corp', 'admin@acme.com'),
    ('Beta Industries', 'ops@beta.io'),
    ('Gamma Labs', 'cto@gamma.dev');

CREATE TABLE IF NOT EXISTS access_events (
    id SERIAL PRIMARY KEY,
    source_ip VARCHAR(45),
    target_table VARCHAR(50),
    query_type VARCHAR(20),
    timestamp TIMESTAMP DEFAULT NOW()
);
