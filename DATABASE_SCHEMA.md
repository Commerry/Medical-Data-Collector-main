# Database Schema & SQL Queries Reference

## 📊 Database Overview

ระบบใช้ 2 ฐานข้อมูล:
1. **MySQL (Remote)** - ฐานข้อมูลลูกค้า (READ & UPDATE only)
2. **SQLite (Local)** - ฐานข้อมูลภายในโปรแกรม (Full CRUD)

---

## 🗄️ MySQL Database (Customer Database)

### Connection Configuration
```javascript
{
  host: '192.168.1.100',
  port: 3306,
  user: 'clinic_user',
  password: 'secure_password',
  database: 'clinic_db',
  charset: 'utf8mb4',
  timezone: '+07:00'
}
```

### Table: `person`

```sql
CREATE TABLE `person` (
  `pcucodeperson` char(5) NOT NULL DEFAULT '' COMMENT 'รหัสสถานบริการบุคคล',
  `pid` int(11) NOT NULL COMMENT 'รหัสบุคคล',
  `prename` varchar(20) DEFAULT NULL COMMENT 'คำนำหน้า',
  `fname` varchar(25) NOT NULL COMMENT 'ชื่อ',
  `lname` varchar(35) DEFAULT NULL COMMENT 'นามสกุล',
  `birth` date DEFAULT NULL COMMENT 'วันเกิด',
  `sex` varchar(1) NOT NULL COMMENT 'รหัสเพศ - 1: ชาย, 2: หญิง',
  `idcard` varchar(13) DEFAULT NULL COMMENT 'หมายเลขบัตรประชาชน',
  PRIMARY KEY (`pcucodeperson`,`pid`),
  UNIQUE KEY `id_Card` (`pcucodeperson`,`idcard`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
```

**Indexes:**
- PRIMARY: `(pcucodeperson, pid)`
- UNIQUE: `(pcucodeperson, idcard)`

**Usage by Application:**
- ✅ SELECT (Read only)
- ❌ INSERT (No)
- ❌ UPDATE (No)
- ❌ DELETE (No)

---

### Table: `visit`

```sql
CREATE TABLE `visit` (
  `pcucode` char(5) NOT NULL DEFAULT '' COMMENT 'รหัสสถานบริการ',
  `visitno` int(11) NOT NULL COMMENT 'ลำดับที่การบริการ',
  `visitdate` date NOT NULL COMMENT 'วันที่รับบริการ',
  `pcucodeperson` char(5) DEFAULT NULL COMMENT 'รหัสสถานบริการบุคคล',
  `pid` int(11) NOT NULL COMMENT 'รหัสบุคคล',
  `weight` decimal(5,1) DEFAULT NULL COMMENT 'น้ำหนัก (กก.)',
  `height` decimal(5,1) DEFAULT NULL COMMENT 'ส่วนสูง (ซม.)',
  `pressure` varchar(7) DEFAULT NULL COMMENT 'ความดันโลหิต (ค่าแรก เช่น 120/80)',
  `temperature` decimal(4,1) DEFAULT NULL COMMENT 'อุณหภูมิ (°C)',
  `pulse` int(11) DEFAULT NULL COMMENT 'ชีพจร (ครั้ง/นาที)',
  `dateupdate` datetime DEFAULT NULL COMMENT 'วันที่ปรับปรุงข้อมูลล่าสุด',
  `pressure2` varchar(7) DEFAULT NULL COMMENT 'ความดันโลหิตจากการวัดครั้งที่ 2',
  PRIMARY KEY (`pcucode`,`visitno`),
  KEY `pers_pid` (`pcucodeperson`,`pid`),
  KEY `vs_date` (`visitdate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
```

**Indexes:**
- PRIMARY: `(pcucode, visitno)`
- KEY: `(pcucodeperson, pid)`
- KEY: `(visitdate)`

**Usage by Application:**
- ✅ SELECT (Read to find latest visit)
- ❌ INSERT (No - records created by other system)
- ✅ UPDATE (Update vital signs only)
- ❌ DELETE (No)

**Fields Updated by Application:**
- `weight`
- `height`
- `pressure`
- `temperature`
- `dateupdate`

---

## 📝 MySQL Queries Used by Application

### 1. Find Person by ID Card

```sql
-- Used when: Card reader scans ID card
SELECT 
  pcucodeperson,
  pid,
  prename,
  fname,
  lname,
  birth,
  sex
FROM person
WHERE idcard = ?
LIMIT 1;
```

**Parameters:**
- `?` = idcard (string, 13 characters)

**Returns:**
- Single row or null

**Example:**
```javascript
const person = await mysql.query(
  'SELECT pcucodeperson, pid, prename, fname, lname FROM person WHERE idcard = ?',
  ['7012345678901']
);
// Returns: { pcucodeperson: '09584', pid: 30001, prename: '003', fname: 'สิทธิวัฒน์', lname: 'แสงทอง' }
```

---

### 2. Find Latest Visit for Person

```sql
-- Used when: Creating session after card scan
SELECT 
  pcucode,
  visitno,
  visitdate,
  weight,
  height,
  pressure,
  temperature,
  dateupdate
FROM visit
WHERE pcucodeperson = ?
  AND pid = ?
ORDER BY visitdate DESC, visitno DESC
LIMIT 1;
```

**Parameters:**
- `?` = pcucodeperson (char 5)
- `?` = pid (int)

**Returns:**
- Latest visit record for this person

**Example:**
```javascript
const latestVisit = await mysql.query(
  `SELECT pcucode, visitno, visitdate, weight, height, pressure, temperature 
   FROM visit 
   WHERE pcucodeperson = ? AND pid = ? 
   ORDER BY visitdate DESC, visitno DESC 
   LIMIT 1`,
  ['09584', 30001]
);
// Returns: { pcucode: '09584', visitno: 50007, visitdate: '2024-02-02', ... }
```

---

### 3. Update Weight

```sql
-- Used when: Weight scale sends data
UPDATE visit
SET 
  weight = ?,
  dateupdate = NOW()
WHERE pcucode = ?
  AND visitno = ?;
```

**Parameters:**
- `?` = weight (decimal 5,1)
- `?` = pcucode (char 5)
- `?` = visitno (int)

**Example:**
```javascript
await mysql.query(
  'UPDATE visit SET weight = ?, dateupdate = NOW() WHERE pcucode = ? AND visitno = ?',
  [65.5, '09584', 50007]
);
```

---

### 4. Update Height

```sql
-- Used when: Height meter sends data
UPDATE visit
SET 
  height = ?,
  dateupdate = NOW()
WHERE pcucode = ?
  AND visitno = ?;
```

**Parameters:**
- `?` = height (decimal 5,1)
- `?` = pcucode (char 5)
- `?` = visitno (int)

**Example:**
```javascript
await mysql.query(
  'UPDATE visit SET height = ?, dateupdate = NOW() WHERE pcucode = ? AND visitno = ?',
  [170.0, '09584', 50007]
);
```

---

### 5. Update Blood Pressure

```sql
-- Used when: BP monitor sends data
UPDATE visit
SET 
  pressure = ?,
  dateupdate = NOW()
WHERE pcucode = ?
  AND visitno = ?;
```

**Parameters:**
- `?` = pressure (varchar 7, format: "120/80")
- `?` = pcucode (char 5)
- `?` = visitno (int)

**Example:**
```javascript
await mysql.query(
  'UPDATE visit SET pressure = ?, dateupdate = NOW() WHERE pcucode = ? AND visitno = ?',
  ['120/80', '09584', 50007]
);
```

---

### 6. Update Temperature

```sql
-- Used when: Thermometer sends data
UPDATE visit
SET 
  temperature = ?,
  dateupdate = NOW()
WHERE pcucode = ?
  AND visitno = ?;
```

**Parameters:**
- `?` = temperature (decimal 4,1)
- `?` = pcucode (char 5)
- `?` = visitno (int)

**Example:**
```javascript
await mysql.query(
  'UPDATE visit SET temperature = ?, dateupdate = NOW() WHERE pcucode = ? AND visitno = ?',
  [36.5, '09584', 50007]
);
```

---

### 7. Get Visit History (for History Page)

```sql
-- Used when: Viewing history in UI
SELECT 
  v.pcucode,
  v.visitno,
  v.visitdate,
  v.weight,
  v.height,
  v.pressure,
  v.temperature,
  v.dateupdate,
  p.idcard,
  p.prename,
  p.fname,
  p.lname
FROM visit v
JOIN person p ON v.pcucodeperson = p.pcucodeperson 
  AND v.pid = p.pid
WHERE v.visitdate BETWEEN ? AND ?
  AND (p.idcard = ? OR ? IS NULL)
ORDER BY v.visitdate DESC, v.visitno DESC
LIMIT ? OFFSET ?;
```

**Parameters:**
- `?` = startDate (date)
- `?` = endDate (date)
- `?` = idcard (string or null)
- `?` = idcard (string or null) - for NULL check
- `?` = limit (int)
- `?` = offset (int)

**Example:**
```javascript
const history = await mysql.query(
  `SELECT v.visitdate, v.weight, v.height, p.fname, p.lname
   FROM visit v
   JOIN person p ON v.pcucodeperson = p.pcucodeperson AND v.pid = p.pid
   WHERE v.visitdate BETWEEN ? AND ?
   ORDER BY v.visitdate DESC
   LIMIT 50`,
  ['2024-02-01', '2024-02-02']
);
```

---

## 💾 SQLite Database (Local Application Database)

### Location
```
Windows: C:\Users\{username}\AppData\Roaming\medical-data-collector\data.db
macOS: ~/Library/Application Support/medical-data-collector/data.db
Linux: ~/.config/medical-data-collector/data.db
```

---

### Table: `app_config`

```sql
CREATE TABLE IF NOT EXISTS app_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    config_key TEXT UNIQUE NOT NULL,
    config_value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

**Purpose:** Store encrypted configuration

**Example Data:**
```sql
INSERT INTO app_config (config_key, config_value) VALUES
('db_host', 'encrypted_value'),
('db_port', 'encrypted_value'),
('db_user', 'encrypted_value'),
('db_pass', 'encrypted_value'),
('db_name', 'encrypted_value'),
('mqtt_port', '1883'),
('mqtt_user', 'clinic_device'),
('mqtt_pass', 'encrypted_value'),
('pcucode', '09584'),
('session_timeout', '10');
```

---

### Table: `mqtt_log`

```sql
CREATE TABLE IF NOT EXISTS mqtt_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic TEXT NOT NULL,
    device_type TEXT NOT NULL,
    idcard TEXT,
    payload TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    processed BOOLEAN DEFAULT 0,
    status TEXT DEFAULT 'received',
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_mqtt_log_idcard ON mqtt_log(idcard);
CREATE INDEX IF NOT EXISTS idx_mqtt_log_timestamp ON mqtt_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_mqtt_log_status ON mqtt_log(status);
```

**Purpose:** Log all incoming MQTT messages

**Example Data:**
```sql
INSERT INTO mqtt_log (topic, device_type, idcard, payload, status) VALUES
('clinic/09584/device/cardreader/data', 'cardreader', '7012345678901', 
 '{"device_type":"cardreader","idcard":"7012345678901","timestamp":"2024-02-02T10:30:00Z"}',
 'processed');
```

---

### Table: `active_sessions`

```sql
CREATE TABLE IF NOT EXISTS active_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    idcard TEXT UNIQUE NOT NULL,
    pid INTEGER,
    pcucode TEXT,
    pcucodeperson TEXT,
    visitno INTEGER,
    visitdate DATE,
    weight REAL,
    height REAL,
    pressure TEXT,
    temperature REAL,
    session_start DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_update DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_synced BOOLEAN DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_active_sessions_idcard ON active_sessions(idcard);
CREATE INDEX IF NOT EXISTS idx_active_sessions_synced ON active_sessions(is_synced);
```

**Purpose:** Track active data collection sessions

**Lifecycle:**
1. Created when card is scanned
2. Updated as vital signs are collected
3. Deleted after timeout (default 10 minutes)

**Example Data:**
```sql
INSERT INTO active_sessions 
(idcard, pid, pcucode, pcucodeperson, visitno, visitdate, weight, height, pressure, temperature)
VALUES
('7012345678901', 30001, '09584', '09584', 50007, '2024-02-02', 65.5, 170.0, '120/80', 36.5);
```

---

### Table: `sync_history`

```sql
CREATE TABLE IF NOT EXISTS sync_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER,
    idcard TEXT NOT NULL,
    visitno INTEGER,
    fields_updated TEXT,
    sync_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    sync_status TEXT DEFAULT 'success',
    error_message TEXT,
    FOREIGN KEY (session_id) REFERENCES active_sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_sync_history_timestamp ON sync_history(sync_timestamp);
CREATE INDEX IF NOT EXISTS idx_sync_history_status ON sync_history(sync_status);
```

**Purpose:** Track all MySQL update attempts

**Example Data:**
```sql
INSERT INTO sync_history 
(session_id, idcard, visitno, fields_updated, sync_status)
VALUES
(1, '7012345678901', 50007, '["weight"]', 'success'),
(1, '7012345678901', 50007, '["height"]', 'success'),
(1, '7012345678901', 50007, '["pressure"]', 'success'),
(1, '7012345678901', 50007, '["temperature"]', 'success');
```

---

## 📝 SQLite Queries Used by Application

### Configuration Queries

```sql
-- Get all configuration
SELECT config_key, config_value FROM app_config;

-- Get single config value
SELECT config_value FROM app_config WHERE config_key = ?;

-- Set config value
INSERT OR REPLACE INTO app_config (config_key, config_value, updated_at)
VALUES (?, ?, CURRENT_TIMESTAMP);

-- Delete config
DELETE FROM app_config WHERE config_key = ?;
```

---

### MQTT Log Queries

```sql
-- Insert new log entry
INSERT INTO mqtt_log 
(topic, device_type, idcard, payload, timestamp, status)
VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, 'received');

-- Mark as processed
UPDATE mqtt_log 
SET processed = 1, status = 'processed'
WHERE id = ?;

-- Mark as error
UPDATE mqtt_log
SET status = 'error', error_message = ?
WHERE id = ?;

-- Get recent logs
SELECT * FROM mqtt_log
ORDER BY timestamp DESC
LIMIT ?;

-- Get logs by date
SELECT * FROM mqtt_log
WHERE DATE(timestamp) = ?
ORDER BY timestamp DESC;

-- Get logs by ID card
SELECT * FROM mqtt_log
WHERE idcard = ?
ORDER BY timestamp DESC;

-- Clean old logs (older than 30 days)
DELETE FROM mqtt_log
WHERE timestamp < datetime('now', '-30 days');
```

---

### Active Session Queries

```sql
-- Create new session
INSERT INTO active_sessions
(idcard, pid, pcucode, pcucodeperson, visitno, visitdate, session_start, last_update)
VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Get session by ID card
SELECT * FROM active_sessions
WHERE idcard = ?;

-- Update session data
UPDATE active_sessions
SET weight = ?, last_update = CURRENT_TIMESTAMP
WHERE idcard = ?;

UPDATE active_sessions
SET height = ?, last_update = CURRENT_TIMESTAMP
WHERE idcard = ?;

UPDATE active_sessions
SET pressure = ?, last_update = CURRENT_TIMESTAMP
WHERE idcard = ?;

UPDATE active_sessions
SET temperature = ?, last_update = CURRENT_TIMESTAMP
WHERE idcard = ?;

-- Get all active sessions
SELECT * FROM active_sessions
ORDER BY last_update DESC;

-- Delete session
DELETE FROM active_sessions
WHERE idcard = ?;

-- Clean timeout sessions (older than X minutes)
DELETE FROM active_sessions
WHERE last_update < datetime('now', '-10 minutes');

-- Count active sessions
SELECT COUNT(*) as count FROM active_sessions;
```

---

### Sync History Queries

```sql
-- Log successful sync
INSERT INTO sync_history
(session_id, idcard, visitno, fields_updated, sync_status, sync_timestamp)
VALUES (?, ?, ?, ?, 'success', CURRENT_TIMESTAMP);

-- Log failed sync
INSERT INTO sync_history
(session_id, idcard, visitno, fields_updated, sync_status, error_message, sync_timestamp)
VALUES (?, ?, ?, ?, 'failed', ?, CURRENT_TIMESTAMP);

-- Get sync history for session
SELECT * FROM sync_history
WHERE session_id = ?
ORDER BY sync_timestamp DESC;

-- Get recent sync history
SELECT 
  sh.*,
  as.idcard,
  as.pid
FROM sync_history sh
LEFT JOIN active_sessions as ON sh.session_id = as.id
ORDER BY sh.sync_timestamp DESC
LIMIT ?;

-- Get failed syncs
SELECT * FROM sync_history
WHERE sync_status = 'failed'
ORDER BY sync_timestamp DESC;

-- Count syncs by status
SELECT 
  sync_status,
  COUNT(*) as count
FROM sync_history
WHERE DATE(sync_timestamp) = DATE('now')
GROUP BY sync_status;

-- Clean old history (older than 90 days)
DELETE FROM sync_history
WHERE sync_timestamp < datetime('now', '-90 days');
```

---

## 🔧 Database Maintenance

### MySQL

```sql
-- Check table size
SELECT 
    table_name AS 'Table',
    ROUND(((data_length + index_length) / 1024 / 1024), 2) AS 'Size (MB)'
FROM information_schema.TABLES
WHERE table_schema = 'clinic_db'
ORDER BY (data_length + index_length) DESC;

-- Optimize tables
OPTIMIZE TABLE person;
OPTIMIZE TABLE visit;

-- Check for missing indexes
SHOW INDEX FROM visit;
SHOW INDEX FROM person;

-- Backup database
mysqldump -u clinic_user -p clinic_db > backup_$(date +%Y%m%d).sql
```

### SQLite

```sql
-- Check database size
SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size();

-- Vacuum database (reclaim space)
VACUUM;

-- Analyze tables (update statistics)
ANALYZE;

-- Check integrity
PRAGMA integrity_check;

-- Backup database
-- Use SQLite backup API or copy file
-- cp data.db data_backup_$(date +%Y%m%d).db
```

---

## 📊 Statistics Queries

### Dashboard Statistics

```sql
-- Today's total visits (MySQL)
SELECT COUNT(*) as today_visits
FROM visit
WHERE visitdate = CURDATE();

-- Active sessions count (SQLite)
SELECT COUNT(*) as active_count
FROM active_sessions;

-- Today's sync success rate (SQLite)
SELECT 
  sync_status,
  COUNT(*) as count,
  ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM sync_history WHERE DATE(sync_timestamp) = DATE('now')), 2) as percentage
FROM sync_history
WHERE DATE(sync_timestamp) = DATE('now')
GROUP BY sync_status;

-- Today's MQTT messages (SQLite)
SELECT 
  device_type,
  COUNT(*) as count
FROM mqtt_log
WHERE DATE(timestamp) = DATE('now')
GROUP BY device_type;

-- Average session duration (SQLite)
SELECT 
  AVG((julianday(last_update) - julianday(session_start)) * 24 * 60) as avg_duration_minutes
FROM sync_history sh
JOIN active_sessions as ON sh.session_id = as.id
WHERE DATE(sh.sync_timestamp) = DATE('now');
```

---

## 🚨 Error Monitoring Queries

```sql
-- Failed syncs today (SQLite)
SELECT 
  idcard,
  visitno,
  fields_updated,
  error_message,
  sync_timestamp
FROM sync_history
WHERE sync_status = 'failed'
  AND DATE(sync_timestamp) = DATE('now')
ORDER BY sync_timestamp DESC;

-- MQTT errors today (SQLite)
SELECT 
  topic,
  device_type,
  error_message,
  timestamp
FROM mqtt_log
WHERE status = 'error'
  AND DATE(timestamp) = DATE('now')
ORDER BY timestamp DESC;

-- Unprocessed MQTT messages (SQLite)
SELECT COUNT(*) as unprocessed_count
FROM mqtt_log
WHERE processed = 0;
```

---

## 🔄 Data Migration Scripts

### Initial Setup - Create SQLite Tables

```sql
-- Run on first app start
CREATE TABLE IF NOT EXISTS app_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    config_key TEXT UNIQUE NOT NULL,
    config_value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mqtt_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic TEXT NOT NULL,
    device_type TEXT NOT NULL,
    idcard TEXT,
    payload TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    processed BOOLEAN DEFAULT 0,
    status TEXT DEFAULT 'received',
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_mqtt_log_idcard ON mqtt_log(idcard);
CREATE INDEX IF NOT EXISTS idx_mqtt_log_timestamp ON mqtt_log(timestamp);
CREATE INDEX IF NOT EXISTS idx_mqtt_log_status ON mqtt_log(status);

CREATE TABLE IF NOT EXISTS active_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    idcard TEXT UNIQUE NOT NULL,
    pid INTEGER,
    pcucode TEXT,
    pcucodeperson TEXT,
    visitno INTEGER,
    visitdate DATE,
    weight REAL,
    height REAL,
    pressure TEXT,
    temperature REAL,
    session_start DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_update DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_synced BOOLEAN DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_active_sessions_idcard ON active_sessions(idcard);
CREATE INDEX IF NOT EXISTS idx_active_sessions_synced ON active_sessions(is_synced);

CREATE TABLE IF NOT EXISTS sync_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER,
    idcard TEXT NOT NULL,
    visitno INTEGER,
    fields_updated TEXT,
    sync_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    sync_status TEXT DEFAULT 'success',
    error_message TEXT,
    FOREIGN KEY (session_id) REFERENCES active_sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_sync_history_timestamp ON sync_history(sync_timestamp);
CREATE INDEX IF NOT EXISTS idx_sync_history_status ON sync_history(sync_status);
```

---

## 📚 Example Repository Pattern (TypeScript)

```typescript
// mysql-repository.ts
import mysql from 'mysql2/promise';

export class MySQLRepository {
  private pool: mysql.Pool;
  
  constructor(config: mysql.PoolOptions) {
    this.pool = mysql.createPool(config);
  }
  
  async findPersonByIDCard(idcard: string) {
    const [rows] = await this.pool.query(
      'SELECT * FROM person WHERE idcard = ?',
      [idcard]
    );
    return rows[0] || null;
  }
  
  async findLatestVisit(pcucodeperson: string, pid: number) {
    const [rows] = await this.pool.query(
      `SELECT * FROM visit 
       WHERE pcucodeperson = ? AND pid = ?
       ORDER BY visitdate DESC, visitno DESC
       LIMIT 1`,
      [pcucodeperson, pid]
    );
    return rows[0] || null;
  }
  
  async updateVisitField(
    pcucode: string,
    visitno: number,
    field: string,
    value: any
  ) {
    const [result] = await this.pool.query(
      `UPDATE visit SET ${field} = ?, dateupdate = NOW() 
       WHERE pcucode = ? AND visitno = ?`,
      [value, pcucode, visitno]
    );
    return result.affectedRows > 0;
  }
  
  async getVisitHistory(startDate: string, endDate: string, limit = 50, offset = 0) {
    const [rows] = await this.pool.query(
      `SELECT v.*, p.fname, p.lname, p.idcard
       FROM visit v
       JOIN person p ON v.pcucodeperson = p.pcucodeperson AND v.pid = p.pid
       WHERE v.visitdate BETWEEN ? AND ?
       ORDER BY v.visitdate DESC, v.visitno DESC
       LIMIT ? OFFSET ?`,
      [startDate, endDate, limit, offset]
    );
    return rows;
  }
}
```

```typescript
// sqlite-repository.ts
import Database from 'better-sqlite3';

export class SQLiteRepository {
  private db: Database.Database;
  
  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
  }
  
  // MQTT Log
  insertMQTTLog(data: {
    topic: string;
    device_type: string;
    idcard: string;
    payload: string;
  }) {
    const stmt = this.db.prepare(`
      INSERT INTO mqtt_log (topic, device_type, idcard, payload)
      VALUES (?, ?, ?, ?)
    `);
    return stmt.run(data.topic, data.device_type, data.idcard, data.payload);
  }
  
  // Active Sessions
  createSession(data: {
    idcard: string;
    pid: number;
    pcucode: string;
    pcucodeperson: string;
    visitno: number;
    visitdate: string;
  }) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO active_sessions 
      (idcard, pid, pcucode, pcucodeperson, visitno, visitdate)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      data.idcard,
      data.pid,
      data.pcucode,
      data.pcucodeperson,
      data.visitno,
      data.visitdate
    );
  }
  
  getSession(idcard: string) {
    const stmt = this.db.prepare(
      'SELECT * FROM active_sessions WHERE idcard = ?'
    );
    return stmt.get(idcard);
  }
  
  updateSessionField(idcard: string, field: string, value: any) {
    const stmt = this.db.prepare(`
      UPDATE active_sessions 
      SET ${field} = ?, last_update = CURRENT_TIMESTAMP
      WHERE idcard = ?
    `);
    return stmt.run(value, idcard);
  }
  
  deleteSession(idcard: string) {
    const stmt = this.db.prepare(
      'DELETE FROM active_sessions WHERE idcard = ?'
    );
    return stmt.run(idcard);
  }
  
  cleanTimeoutSessions(timeoutMinutes: number) {
    const stmt = this.db.prepare(`
      DELETE FROM active_sessions 
      WHERE last_update < datetime('now', '-${timeoutMinutes} minutes')
    `);
    return stmt.run();
  }
  
  // Sync History
  logSync(data: {
    session_id: number;
    idcard: string;
    visitno: number;
    fields_updated: string[];
    sync_status: 'success' | 'failed';
    error_message?: string;
  }) {
    const stmt = this.db.prepare(`
      INSERT INTO sync_history 
      (session_id, idcard, visitno, fields_updated, sync_status, error_message)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      data.session_id,
      data.idcard,
      data.visitno,
      JSON.stringify(data.fields_updated),
      data.sync_status,
      data.error_message || null
    );
  }
}
```

---

## 🔐 Security Considerations

### MySQL User Permissions

```sql
-- Create user for the application
CREATE USER 'clinic_app'@'%' IDENTIFIED BY 'strong_password_here';

-- Grant only necessary permissions
GRANT SELECT ON clinic_db.person TO 'clinic_app'@'%';
GRANT SELECT, UPDATE ON clinic_db.visit TO 'clinic_app'@'%';

-- No INSERT, DELETE, or other permissions
FLUSH PRIVILEGES;
```

### SQLite Encryption

```typescript
// Using electron-store for config
import Store from 'electron-store';

const store = new Store({
  encryptionKey: 'your-secret-key',
  name: 'config'
});

// Store sensitive data encrypted
store.set('database.password', 'actual_password');

// Retrieve decrypted
const password = store.get('database.password');
```

---

**Document Version**: 1.0  
**Last Updated**: 2024-02-02  
**Related Documents**: PROJECT_PLAN.md, ESP32_INTEGRATION_GUIDE.md
