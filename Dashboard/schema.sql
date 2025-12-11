-- schema.sql

-- 1. Create the Database
CREATE DATABASE IF NOT EXISTS svris_db;
USE svris_db;

-- 2. Create the main table for time-series data storage

-- Example SQL command to create the table structure
CREATE TABLE sensor_data (
    id SERIAL PRIMARY KEY,
    timestamp VARCHAR(50) NOT NULL,
    temp_c REAL,
    heat_index REAL,
    humidity_perc REAL,
    rain_perc REAL,
    water_status VARCHAR(1), -- Stores H, L, M, or E
    soil1_perc REAL,
    soil2_perc REAL,
    soil3_perc REAL,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Create an index on the timestamp for faster data retrieval
CREATE INDEX idx_timestamp ON sensor_data (timestamp);

-- Optional: Insert a sample row for testing
INSERT INTO sensor_data (timestamp, temp_c, heat_index, humidity_perc, rain_perc, water_status, soil1_perc, soil2_perc, soil3_perc)
VALUES
('2025-12-11 08:00:00', 25.5, 26.8, 65.2, 0.0, 'M', 68.1, 65.5, 69.0),
('2025-12-11 09:00:00', 27.8, 29.5, 60.1, 0.0, 'M', 67.5, 64.9, 68.2),
('2025-12-11 10:00:00', 30.1, 33.0, 55.4, 0.0, 'M', 66.8, 64.1, 67.0),
('2025-12-11 11:00:00', 31.5, 35.1, 50.9, 0.0, 'L', 65.0, 62.5, 64.5), -- Low water status example
('2025-12-11 12:00:00', 24.3, 25.0, 75.8, 15.0, 'H', 75.5, 74.0, 76.2), -- Rain detected, High water
('2025-12-11 13:00:00', 22.1, 22.1, 80.5, 5.0, 'H', 77.0, 76.5, 78.1),
('2025-12-11 14:00:00', 28.9, 31.5, 62.3, 0.0, 'M', 68.5, 66.0, 69.5),
('2025-12-11 15:00:00', 29.5, 32.5, 60.0, 0.0, 'M', 35.0, 65.2, 68.8), -- Low Soil 1 example
('2025-12-11 16:00:00', 28.0, 30.0, 64.8, 0.0, 'M', 68.0, 66.0, 69.2),
('2025-12-11 17:00:00', 26.5, 27.5, 68.5, 0.0, 'E', 67.5, 65.0, 68.5); -- Sensor error example