# Medical Data Collection System - Project Plan

## 📋 Project Overview

โปรแกรม Electron + Next.js ที่รันเบื้องหลังเพื่อรับข้อมูลจากอุปกรณ์ ESP32 ผ่าน MQTT และบันทึกลงฐานข้อมูล MySQL ของลูกค้า

**หลักการทำงาน**: 
- โปรแกรมจะ **UPDATE** ข้อมูลเข้าตาราง `visit` ของลูกค้าเท่านั้น
- **ไม่มีการสร้าง row ใหม่** ในฐานข้อมูลลูกค้า
- ใช้ SQLite (data.db) ภายในโปรแกรมเองสำหรับ logging

---

## 🎯 Core Requirements Summary

### 1. MQTT Communication
- **Broker**: Aedes (Built-in, ไม่ต้องติดตั้งแยก)
- **Authentication**: Username + Password
- **Protocol**: MQTT over TCP (port 1883)
- **Data Format**: JSON, ส่งมาทีละ field

### 2. Database Strategy
- **Remote MySQL**: ฐานข้อมูลลูกค้า (UPDATE only)
  - Tables: `person`, `visit`
  - Operation: UPDATE existing records
  
- **Local SQLite** (data.db): ฐานข้อมูลภายในโปรแกรม
  - เก็บ log ทุก transaction
  - เก็บ session management
  - เก็บ configuration (encrypted)

### 3. Data Flow
```
ESP32 Device → MQTT Broker → Electron App → Update MySQL (visit table)
                                          ↓
                                      Log to SQLite (data.db)
                                          ↓
                                      Log to Text File (daily)
```

### 4. Key Features
- ✅ รันเบื้องหลัง + System Tray
- ✅ Real-time Dashboard
- ✅ History/Report Viewer
- ✅ Database Configuration UI
- ✅ Auto-update
- ✅ Cross-platform (Windows, macOS, Linux)

---

## 🏗️ System Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     Electron Main Process                     │
├──────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌─────────────────┐        ┌─────────────────┐              │
│  │  Aedes MQTT     │        │  SQLite (Local) │              │
│  │  Broker         │        │  - logs         │              │
│  │  Port: 1883     │        │  - sessions     │              │
│  │  Auth: Yes      │        │  - config       │              │
│  └────────┬────────┘        └────────┬────────┘              │
│           │                          │                        │
│  ┌────────▼──────────────────────────▼────────┐              │
│  │         Data Processing Service            │              │
│  │  - Validate incoming data                  │              │
│  │  - Session management                      │              │
│  │  - Update MySQL                            │              │
│  │  - Log to SQLite & Text                    │              │
│  └────────┬───────────────────────────────────┘              │
│           │                                                   │
│  ┌────────▼────────┐                                         │
│  │  MySQL Client   │────────────► Remote MySQL Server        │
│  │  (UPDATE only)  │              (Customer Database)        │
│  └─────────────────┘                                         │
│                                                               │
└───────────────────────────┬───────────────────────────────────┘
                            │ IPC
┌───────────────────────────▼───────────────────────────────────┐
│                  Next.js Renderer Process                     │
├──────────────────────────────────────────────────────────────┤
│  Pages:                                                       │
│  - Dashboard (Real-time monitoring)                           │
│  - Settings (Database config)                                 │
│  - History (View visit logs)                                  │
└──────────────────────────────────────────────────────────────┘
```

---

## 📊 Database Design

### Remote MySQL (Customer Database) - READ & UPDATE ONLY

#### Table: `person`
```sql
-- โปรแกรมจะ READ เพื่อหา pid จาก idcard
-- ไม่มีการ INSERT หรือ UPDATE
```

#### Table: `visit`
```sql
-- โปรแกรมจะ UPDATE fields เหล่านี้เท่านั้น:
-- - weight
-- - height
-- - pressure
-- - temperature
-- - dateupdate (timestamp)

-- ⚠️ ไม่มีการสร้าง row ใหม่
-- ⚠️ row ต้องมีอยู่แล้วในฐานข้อมูล (สร้างโดยระบบอื่น)
```

### Local SQLite (data.db) - Logging Database

```sql
-- ตาราง 1: Configuration (Encrypted)
CREATE TABLE IF NOT EXISTS app_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    config_key TEXT UNIQUE NOT NULL,
    config_value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ตาราง 2: MQTT Message Log (ทุก message ที่เข้ามา)
CREATE TABLE IF NOT EXISTS mqtt_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic TEXT NOT NULL,
    device_type TEXT NOT NULL,
    idcard TEXT,
    payload TEXT NOT NULL,  -- JSON raw data
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    processed BOOLEAN DEFAULT 0,
    status TEXT DEFAULT 'received',  -- received, processed, error
    error_message TEXT,
    INDEX idx_idcard (idcard),
    INDEX idx_timestamp (timestamp),
    INDEX idx_status (status)
);

-- ตาราง 3: Active Sessions (session ปัจจุบันที่กำลัง collect ข้อมูล)
CREATE TABLE IF NOT EXISTS active_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    idcard TEXT UNIQUE NOT NULL,
    pid INTEGER,
    pcucode TEXT,
    pcucodeperson TEXT,
    visitno INTEGER,
    visitdate DATE,
    -- ข้อมูลที่รอ update
    weight REAL,
    height REAL,
    pressure TEXT,
    temperature REAL,
    -- metadata
    session_start DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_update DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_synced BOOLEAN DEFAULT 0,
    INDEX idx_idcard (idcard),
    INDEX idx_synced (is_synced)
);

-- ตาราง 4: Sync History (ประวัติการ sync ไป MySQL)
CREATE TABLE IF NOT EXISTS sync_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER,
    idcard TEXT NOT NULL,
    visitno INTEGER,
    fields_updated TEXT,  -- JSON array of updated fields
    sync_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    sync_status TEXT DEFAULT 'success',  -- success, failed, partial
    error_message TEXT,
    FOREIGN KEY (session_id) REFERENCES active_sessions(id),
    INDEX idx_sync_timestamp (sync_timestamp),
    INDEX idx_sync_status (sync_status)
);
```

---

## 🔄 Data Flow & Logic

### Workflow: การรับและประมวลผลข้อมูล

```
┌─────────────────────────────────────────────────────────────┐
│ Step 1: ESP32 อ่านบัตรประชาชน                               │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
Topic: clinic/{pcucode}/device/cardreader/data
Payload: {
  "device_type": "cardreader",
  "idcard": "7012345678901",
  "timestamp": "2024-02-02T10:30:00.000Z"
}
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ Processing:                                                  │
│ 1. Log to mqtt_log (SQLite)                                 │
│ 2. Query person table → get pid, pcucodeperson              │
│ 3. Query latest visit for this pid → get visitno           │
│ 4. Create/Update active_session                             │
│    - Store: idcard, pid, visitno, pcucode, visitdate        │
│    - Set timeout: 10 minutes (configurable)                 │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ Step 2-5: ESP32 ส่งข้อมูลชีวสัญญาณ (ทีละ field)            │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
Topics:
- clinic/{pcucode}/device/weight/data
- clinic/{pcucode}/device/height/data
- clinic/{pcucode}/device/bp/data
- clinic/{pcucode}/device/temp/data

Payload Example (Weight):
{
  "device_type": "weight",
  "idcard": "7012345678901",
  "weight": 65.5,
  "timestamp": "2024-02-02T10:30:15.000Z"
}
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ Processing:                                                  │
│ 1. Log to mqtt_log (SQLite)                                 │
│ 2. Find active_session by idcard                            │
│ 3. Update field in active_session                           │
│    - weight: 65.5                                            │
│    - last_update: now                                        │
│ 4. Trigger UPDATE to MySQL visit table                      │
│    UPDATE visit SET                                          │
│      weight = 65.5,                                          │
│      dateupdate = NOW()                                      │
│    WHERE pcucode = ? AND visitno = ?                        │
│ 5. Log to sync_history                                       │
└─────────────────────────────────────────────────────────────┘
```

### Session Management Logic

```javascript
// Pseudo Code

class SessionManager {
  async handleCardReader(data) {
    const { idcard } = data;
    
    // 1. Query MySQL person table
    const person = await mysql.query(
      'SELECT pid, pcucodeperson FROM person WHERE idcard = ?',
      [idcard]
    );
    
    if (!person) {
      log.error('Person not found');
      return;
    }
    
    // 2. Query MySQL visit table (latest visit for this pid)
    const latestVisit = await mysql.query(`
      SELECT pcucode, visitno, visitdate 
      FROM visit 
      WHERE pcucodeperson = ? AND pid = ?
      ORDER BY visitdate DESC, visitno DESC 
      LIMIT 1
    `, [person.pcucodeperson, person.pid]);
    
    if (!latestVisit) {
      log.error('No visit record found for this person');
      return;
    }
    
    // 3. Create/Update active session in SQLite
    await sqlite.run(`
      INSERT OR REPLACE INTO active_sessions 
      (idcard, pid, pcucode, pcucodeperson, visitno, visitdate, session_start, last_update)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `, [idcard, person.pid, latestVisit.pcucode, person.pcucodeperson, 
        latestVisit.visitno, latestVisit.visitdate]);
    
    // 4. Broadcast to UI
    sendToRenderer('session:started', { idcard, person, latestVisit });
  }
  
  async handleVitalSign(data) {
    const { idcard, device_type, ...vitalData } = data;
    
    // 1. Get active session
    const session = await sqlite.get(
      'SELECT * FROM active_sessions WHERE idcard = ?',
      [idcard]
    );
    
    if (!session) {
      log.error('No active session for this ID card');
      return;
    }
    
    // 2. Update session data in SQLite
    const fieldName = getFieldName(device_type); // weight, height, pressure, temperature
    const fieldValue = vitalData[fieldName];
    
    await sqlite.run(`
      UPDATE active_sessions 
      SET ${fieldName} = ?, last_update = datetime('now')
      WHERE idcard = ?
    `, [fieldValue, idcard]);
    
    // 3. Update MySQL visit table
    try {
      await mysql.query(`
        UPDATE visit 
        SET ${fieldName} = ?, dateupdate = NOW()
        WHERE pcucode = ? AND visitno = ?
      `, [fieldValue, session.pcucode, session.visitno]);
      
      // 4. Log sync success
      await sqlite.run(`
        INSERT INTO sync_history 
        (session_id, idcard, visitno, fields_updated, sync_status)
        VALUES (?, ?, ?, ?, 'success')
      `, [session.id, idcard, session.visitno, JSON.stringify([fieldName])]);
      
      // 5. Broadcast to UI
      sendToRenderer('data:updated', { 
        idcard, 
        field: fieldName, 
        value: fieldValue 
      });
      
    } catch (error) {
      log.error('MySQL update failed', error);
      
      await sqlite.run(`
        INSERT INTO sync_history 
        (session_id, idcard, visitno, fields_updated, sync_status, error_message)
        VALUES (?, ?, ?, ?, 'failed', ?)
      `, [session.id, idcard, session.visitno, 
          JSON.stringify([fieldName]), error.message]);
    }
  }
  
  // Auto cleanup sessions older than timeout
  async cleanupSessions(timeoutMinutes = 10) {
    await sqlite.run(`
      DELETE FROM active_sessions 
      WHERE last_update < datetime('now', '-${timeoutMinutes} minutes')
    `);
  }
}
```

---

## 📡 MQTT Protocol Design

### Topic Structure
```
clinic/{pcucode}/device/{device_type}/data
```

**Variables:**
- `{pcucode}`: รหัสสถานบริการ (เช่น "09584")
- `{device_type}`: ประเภทอุปกรณ์

### Device Types & Topics

| Device Type | Topic Example | Description |
|------------|---------------|-------------|
| `cardreader` | `clinic/09584/device/cardreader/data` | อ่านบัตรประชาชน (สร้าง session) |
| `weight` | `clinic/09584/device/weight/data` | เครื่องชั่งน้ำหนัก |
| `height` | `clinic/09584/device/height/data` | เครื่องวัดส่วนสูง |
| `bp` | `clinic/09584/device/bp/data` | เครื่องวัดความดัน |
| `temp` | `clinic/09584/device/temp/data` | เครื่องวัดอุณหภูมิ |

### Message Format (JSON)

#### 1. Card Reader
```json
{
  "device_type": "cardreader",
  "idcard": "7012345678901",
  "timestamp": "2024-02-02T10:30:00.000Z"
}
```

#### 2. Weight Scale
```json
{
  "device_type": "weight",
  "idcard": "7012345678901",
  "weight": 65.5,
  "timestamp": "2024-02-02T10:30:15.000Z"
}
```

#### 3. Height Meter
```json
{
  "device_type": "height",
  "idcard": "7012345678901",
  "height": 170.0,
  "timestamp": "2024-02-02T10:30:20.000Z"
}
```

#### 4. Blood Pressure Monitor
```json
{
  "device_type": "bp",
  "idcard": "7012345678901",
  "pressure": "120/80",
  "timestamp": "2024-02-02T10:30:25.000Z"
}
```

#### 5. Thermometer
```json
{
  "device_type": "temp",
  "idcard": "7012345678901",
  "temperature": 36.5,
  "timestamp": "2024-02-02T10:30:30.000Z"
}
```

### MQTT Configuration

**Broker Settings:**
```javascript
{
  host: 'localhost',
  port: 1883,
  protocol: 'mqtt',
  username: 'clinic_device',
  password: 'GENERATED_ON_INSTALLATION',  // Random 32 char
  keepalive: 60,
  clean: true,
  reconnectPeriod: 5000
}
```

**QoS Level**: 1 (At least once delivery)

---

## 📝 Text File Logging

### Log File Structure
```
logs/
├── 2024-02-01.log
├── 2024-02-02.log
└── 2024-02-03.log
```

### Log Format
```
[2024-02-02 10:30:00.123] [MQTT] [RECEIVED] Topic: clinic/09584/device/cardreader/data
Payload: {"device_type":"cardreader","idcard":"7012345678901","timestamp":"2024-02-02T10:30:00.000Z"}
Action: Session created for PID: 30001, VisitNo: 50007

[2024-02-02 10:30:15.456] [MQTT] [RECEIVED] Topic: clinic/09584/device/weight/data
Payload: {"device_type":"weight","idcard":"7012345678901","weight":65.5,"timestamp":"2024-02-02T10:30:15.000Z"}
Action: Updated visit.weight = 65.5, VisitNo: 50007
MySQL: SUCCESS

[2024-02-02 10:30:20.789] [MQTT] [RECEIVED] Topic: clinic/09584/device/height/data
Payload: {"device_type":"height","idcard":"7012345678901","height":170.0,"timestamp":"2024-02-02T10:30:20.000Z"}
Action: Updated visit.height = 170.0, VisitNo: 50007
MySQL: SUCCESS

[2024-02-02 10:35:30.123] [SESSION] [TIMEOUT] IDCard: 7012345678901
Action: Session cleaned up (inactive for 10 minutes)

[2024-02-02 10:40:15.456] [ERROR] [MYSQL] Connection failed
Error: ECONNREFUSED 192.168.1.100:3306
Action: Added to retry queue

[2024-02-02 10:41:00.789] [MYSQL] [RECONNECT] Connection restored
Action: Processing retry queue (3 pending updates)
```

### Log Rotation Strategy
- สร้างไฟล์ใหม่ทุกวัน (midnight)
- เก็บ log ไว้ 30 วัน (configurable)
- Auto-delete logs เก่ากว่า 30 วัน

---

## 🖥️ User Interface Design

### 1. Main Window - Dashboard

```
╔══════════════════════════════════════════════════════════════╗
║  Medical Data Collector                    [_] [□] [X]       ║
╠══════════════════════════════════════════════════════════════╣
║  🏠 Dashboard    ⚙️ Settings    📊 History                    ║
╠══════════════════════════════════════════════════════════════╣
║                                                               ║
║  MQTT Status: 🟢 Connected (Port: 1883)                      ║
║  MySQL Status: 🟢 Connected (192.168.1.100)                  ║
║                                                               ║
║  ┌─────────────────────────────────────────────────────┐    ║
║  │  Active Session                                      │    ║
║  ├─────────────────────────────────────────────────────┤    ║
║  │  ID Card: 7012345678901                             │    ║
║  │  Name: สิทธิวัฒน์ แสงทอง                             │    ║
║  │  PID: 30001                                          │    ║
║  │  Visit No: 50007                                     │    ║
║  │  Visit Date: 2024-02-02                              │    ║
║  │                                                       │    ║
║  │  Collected Data:                                     │    ║
║  │  ✅ Weight: 65.5 kg      (10:30:15)                  │    ║
║  │  ✅ Height: 170.0 cm     (10:30:20)                  │    ║
║  │  ✅ BP: 120/80 mmHg      (10:30:25)                  │    ║
║  │  ✅ Temp: 36.5 °C        (10:30:30)                  │    ║
║  │                                                       │    ║
║  │  Last Update: 10:30:30                               │    ║
║  │  Session Duration: 0:00:30                           │    ║
║  └─────────────────────────────────────────────────────┘    ║
║                                                               ║
║  Recent Activity:                                             ║
║  ┌─────────────────────────────────────────────────────┐    ║
║  │ 10:30:30 | 7012...901 | Temperature → 36.5°C  | ✅  │    ║
║  │ 10:30:25 | 7012...901 | BP → 120/80          | ✅  │    ║
║  │ 10:30:20 | 7012...901 | Height → 170.0 cm    | ✅  │    ║
║  │ 10:30:15 | 7012...901 | Weight → 65.5 kg     | ✅  │    ║
║  │ 10:30:00 | 7012...901 | Session Started      | ✅  │    ║
║  └─────────────────────────────────────────────────────┘    ║
║                                                               ║
║  Today's Stats:                                               ║
║  Total Visits: 15 | Active Sessions: 1 | Errors: 0          ║
║                                                               ║
╚══════════════════════════════════════════════════════════════╝
```

### 2. Settings Page

```
╔══════════════════════════════════════════════════════════════╗
║  Settings                                                     ║
╠══════════════════════════════════════════════════════════════╣
║                                                               ║
║  Database Configuration                                       ║
║  ┌─────────────────────────────────────────────────────┐    ║
║  │  Host:     [192.168.1.100____________]              │    ║
║  │  Port:     [3306_____]                              │    ║
║  │  Username: [root_____________________]              │    ║
║  │  Password: [••••••••••••••••••••••••]              │    ║
║  │  Database: [clinic_db________________]              │    ║
║  │                                                       │    ║
║  │  [Test Connection]  Status: 🟢 Connected             │    ║
║  └─────────────────────────────────────────────────────┘    ║
║                                                               ║
║  MQTT Configuration                                           ║
║  ┌─────────────────────────────────────────────────────┐    ║
║  │  Broker Port: [1883_____]                           │    ║
║  │  Username:    [clinic_device_________]              │    ║
║  │  Password:    [••••••••••••••••••••••]              │    ║
║  │                                                       │    ║
║  │  Status: 🟢 Broker Running                           │    ║
║  │  [Stop Broker]  [Restart Broker]                    │    ║
║  └─────────────────────────────────────────────────────┘    ║
║                                                               ║
║  Application Settings                                         ║
║  ┌─────────────────────────────────────────────────────┐    ║
║  │  PCU Code:          [09584_____]                    │    ║
║  │  Session Timeout:   [10______] minutes              │    ║
║  │  Log Retention:     [30______] days                 │    ║
║  │  Auto Start:        [✓] Start with system           │    ║
║  └─────────────────────────────────────────────────────┘    ║
║                                                               ║
║                        [Save Settings]                        ║
║                                                               ║
╚══════════════════════════════════════════════════════════════╝
```

### 3. History Page

```
╔══════════════════════════════════════════════════════════════╗
║  Visit History                                                ║
╠══════════════════════════════════════════════════════════════╣
║                                                               ║
║  Filters:                                                     ║
║  Date: [2024-02-01] to [2024-02-02]  ID Card: [__________]  ║
║  [Search]  [Clear]  [Export to Excel]                        ║
║                                                               ║
║  ┌─────────────────────────────────────────────────────┐    ║
║  │ Date       │ Time  │ ID Card     │ Name      │ Status│    ║
║  ├───────────────────────────────────────────────────────┤    ║
║  │ 2024-02-02│10:30 │ 7012...901│ สิทธิวัฒน์ │ ✅    │    ║
║  │ 2024-02-02│09:15 │ 7023...012│ มาลินี     │ ✅    │    ║
║  │ 2024-02-02│08:45 │ 7034...123│ วิทยา      │ ⚠️    │    ║
║  │ 2024-02-01│15:30 │ 7045...234│ อารีย์     │ ✅    │    ║
║  │ 2024-02-01│14:20 │ 7056...345│ ณรงค์ฤทธิ์ │ ✅    │    ║
║  └─────────────────────────────────────────────────────┘    ║
║                                                               ║
║  [< Previous]  Page 1 of 5  [Next >]                         ║
║                                                               ║
╚══════════════════════════════════════════════════════════════╝
```

### 4. System Tray

```
Right-click icon in system tray:

┌─────────────────────────────┐
│ 🏥 Medical Data Collector   │
├─────────────────────────────┤
│ Status: 🟢 Running          │
│ Active Sessions: 1          │
├─────────────────────────────┤
│ ▶️ Show Dashboard           │
│ ⚙️ Settings                 │
│ 📊 View History             │
├─────────────────────────────┤
│ ❌ Quit                      │
└─────────────────────────────┘
```

---

## 🛠️ Technology Stack

### Core Framework
```json
{
  "electron": "^28.0.0",
  "next": "^14.1.0",
  "react": "^18.2.0",
  "typescript": "^5.3.0"
}
```

### MQTT
```json
{
  "aedes": "^0.50.0",
  "mqtt": "^5.3.0"
}
```

### Database
```json
{
  "mysql2": "^3.6.0",
  "better-sqlite3": "^9.2.0"
}
```

### UI Components
```json
{
  "tailwindcss": "^3.4.0",
  "shadcn-ui": "latest",
  "lucide-react": "^0.300.0"
}
```

### Utilities
```json
{
  "winston": "^3.11.0",
  "electron-store": "^8.1.0",
  "date-fns": "^3.0.0",
  "zod": "^3.22.0"
}
```

### Build Tools
```json
{
  "electron-builder": "^24.9.0",
  "electron-updater": "^6.1.0"
}
```

---

## 📁 Project Structure

```
medical-data-collector/
├── electron/                           # Electron Main Process
│   ├── main.ts                        # Entry point
│   ├── preload.ts                     # Preload script
│   │
│   ├── mqtt/                          # MQTT Module
│   │   ├── broker.ts                 # Aedes MQTT Broker setup
│   │   ├── client.ts                 # MQTT Client handler
│   │   └── topics.ts                 # Topic definitions
│   │
│   ├── database/                      # Database Module
│   │   ├── mysql.ts                  # MySQL connection (customer DB)
│   │   ├── sqlite.ts                 # SQLite connection (local DB)
│   │   ├── schema.ts                 # SQLite schema definitions
│   │   └── migrations/               # SQLite migrations
│   │       └── 001_initial.sql
│   │
│   ├── services/                      # Business Logic
│   │   ├── session-manager.ts        # Session management
│   │   ├── data-processor.ts         # Process MQTT messages
│   │   ├── mysql-updater.ts          # Update MySQL visit table
│   │   └── sync-service.ts           # Sync failed updates
│   │
│   ├── logger/                        # Logging Module
│   │   ├── file-logger.ts            # Text file logger
│   │   ├── db-logger.ts              # SQLite logger
│   │   └── log-rotator.ts            # Log rotation
│   │
│   ├── config/                        # Configuration
│   │   ├── app-config.ts             # App configuration manager
│   │   └── encryption.ts             # Encrypt/decrypt sensitive data
│   │
│   └── ipc/                           # IPC Handlers
│       ├── handlers.ts               # All IPC handlers
│       └── events.ts                 # Event definitions
│
├── src/                                # Next.js Renderer Process
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                  # Dashboard
│   │   ├── settings/
│   │   │   └── page.tsx              # Settings page
│   │   └── history/
│   │       └── page.tsx              # History page
│   │
│   ├── components/
│   │   ├── dashboard/
│   │   │   ├── active-session.tsx
│   │   │   ├── recent-activity.tsx
│   │   │   ├── status-cards.tsx
│   │   │   └── stats-summary.tsx
│   │   ├── settings/
│   │   │   ├── database-config.tsx
│   │   │   ├── mqtt-config.tsx
│   │   │   └── app-settings.tsx
│   │   ├── history/
│   │   │   ├── visit-table.tsx
│   │   │   ├── filters.tsx
│   │   │   └── export-button.tsx
│   │   └── ui/                       # shadcn components
│   │       ├── button.tsx
│   │       ├── input.tsx
│   │       ├── card.tsx
│   │       └── ...
│   │
│   ├── lib/
│   │   ├── electron-ipc.ts           # IPC communication helpers
│   │   ├── hooks/
│   │   │   ├── use-mqtt-status.ts
│   │   │   ├── use-active-session.ts
│   │   │   └── use-history.ts
│   │   └── utils.ts
│   │
│   └── types/
│       ├── mqtt.ts
│       ├── session.ts
│       └── config.ts
│
├── public/
│   ├── icons/
│   │   ├── icon.png
│   │   ├── icon.ico
│   │   └── tray-icon.png
│   └── locales/                       # i18n (optional)
│
├── logs/                              # Auto-generated log files
│   └── .gitkeep
│
├── data/                              # SQLite database
│   └── data.db                       # Auto-generated
│
├── resources/                         # Build resources
│   ├── icon.png
│   └── installer-background.png
│
├── package.json
├── electron-builder.yml              # Build configuration
├── tsconfig.json
├── tsconfig.electron.json
├── next.config.js
├── tailwind.config.js
└── .env.example                      # Environment variables template
```

---

## 🔐 Security Implementation

### 1. Configuration Encryption
```typescript
// Using electron-store with encryption
import Store from 'electron-store';

const store = new Store({
  name: 'config',
  encryptionKey: 'generated-per-installation',
  schema: {
    database: {
      type: 'object',
      properties: {
        host: { type: 'string' },
        port: { type: 'number' },
        username: { type: 'string' },
        password: { type: 'string' },
        database: { type: 'string' }
      }
    },
    mqtt: {
      type: 'object',
      properties: {
        port: { type: 'number' },
        username: { type: 'string' },
        password: { type: 'string' }
      }
    }
  }
});
```

### 2. MQTT Password Generation
```typescript
// Generate random password on first install
import crypto from 'crypto';

function generateMQTTPassword(): string {
  return crypto.randomBytes(16).toString('hex');
}
```

### 3. Database Connection Security
- ใช้ connection pooling
- Timeout configuration
- Retry mechanism with exponential backoff

---

## 🔄 Error Handling & Recovery

### 1. MySQL Connection Lost

```typescript
class MySQLRetryService {
  private retryQueue: UpdateOperation[] = [];
  private maxRetries = 5;
  private retryDelay = 5000; // 5 seconds
  
  async handleConnectionLost(operation: UpdateOperation) {
    // Add to retry queue
    this.retryQueue.push(operation);
    
    // Log to SQLite
    await sqlite.run(`
      INSERT INTO sync_history 
      (session_id, idcard, visitno, fields_updated, sync_status, error_message)
      VALUES (?, ?, ?, ?, 'queued', 'MySQL connection lost')
    `, [/* ... */]);
    
    // Notify UI
    sendToRenderer('mysql:connection-lost', {
      queueSize: this.retryQueue.length
    });
    
    // Start retry loop
    this.startRetryLoop();
  }
  
  async startRetryLoop() {
    let attempt = 0;
    
    while (this.retryQueue.length > 0 && attempt < this.maxRetries) {
      try {
        // Try to reconnect
        await mysql.ping();
        
        // Process queue
        for (const operation of this.retryQueue) {
          await this.processOperation(operation);
        }
        
        this.retryQueue = [];
        sendToRenderer('mysql:connection-restored', {});
        
      } catch (error) {
        attempt++;
        await sleep(this.retryDelay * attempt); // Exponential backoff
      }
    }
  }
}
```

### 2. Invalid Data Handling

```typescript
import { z } from 'zod';

// Validation schemas
const CardReaderSchema = z.object({
  device_type: z.literal('cardreader'),
  idcard: z.string().length(13).regex(/^\d+$/),
  timestamp: z.string().datetime()
});

const WeightSchema = z.object({
  device_type: z.literal('weight'),
  idcard: z.string().length(13).regex(/^\d+$/),
  weight: z.number().positive().max(300),
  timestamp: z.string().datetime()
});

// Usage
try {
  const data = WeightSchema.parse(payload);
  await processWeight(data);
} catch (error) {
  logger.error('Validation failed', { payload, error });
  await logToSQLite({
    status: 'error',
    error_message: 'Invalid data format'
  });
}
```

### 3. Session Timeout

```typescript
class SessionTimeoutManager {
  private timeoutHandles = new Map<string, NodeJS.Timeout>();
  private timeoutMinutes = 10;
  
  startTimeout(idcard: string) {
    // Clear existing timeout
    if (this.timeoutHandles.has(idcard)) {
      clearTimeout(this.timeoutHandles.get(idcard)!);
    }
    
    // Set new timeout
    const handle = setTimeout(async () => {
      await this.cleanupSession(idcard);
    }, this.timeoutMinutes * 60 * 1000);
    
    this.timeoutHandles.set(idcard, handle);
  }
  
  resetTimeout(idcard: string) {
    this.startTimeout(idcard); // Restart timer
  }
  
  async cleanupSession(idcard: string) {
    logger.info('Session timeout', { idcard });
    
    await sqlite.run(
      'DELETE FROM active_sessions WHERE idcard = ?',
      [idcard]
    );
    
    this.timeoutHandles.delete(idcard);
    
    sendToRenderer('session:timeout', { idcard });
  }
}
```

---

## 📦 Build & Distribution

### electron-builder.yml

```yaml
appId: com.clinic.medical-data-collector
productName: Medical Data Collector
copyright: Copyright © 2024

directories:
  output: dist
  buildResources: resources

files:
  - electron/**/*
  - src/.next/**/*
  - public/**/*
  - package.json

# Windows
win:
  target:
    - nsis
  icon: resources/icon.ico
  
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  createStartMenuShortcut: true
  installerIcon: resources/icon.ico
  uninstallerIcon: resources/icon.ico
  
# macOS
mac:
  target:
    - dmg
  icon: resources/icon.png
  category: public.app-category.healthcare-fitness
  hardenedRuntime: true
  gatekeeperAssess: false

dmg:
  icon: resources/icon.png
  title: ${productName} ${version}
  
# Linux
linux:
  target:
    - AppImage
    - deb
  icon: resources/icon.png
  category: Medical

# Auto Update
publish:
  provider: github
  owner: your-username
  repo: medical-data-collector
  private: true
```

### package.json scripts

```json
{
  "scripts": {
    "dev": "concurrently \"next dev\" \"electron .\"",
    "build": "next build && tsc -p tsconfig.electron.json",
    "build:win": "npm run build && electron-builder --win",
    "build:mac": "npm run build && electron-builder --mac",
    "build:linux": "npm run build && electron-builder --linux",
    "build:all": "npm run build && electron-builder -mwl",
    "start": "electron .",
    "pack": "electron-builder --dir",
    "dist": "electron-builder"
  }
}
```

---

## 📊 Development Timeline

### Week 1: Project Setup & Core Infrastructure
**Days 1-2: Project Initialization**
- [ ] Initialize Electron + Next.js project
- [ ] Setup TypeScript configurations
- [ ] Install all dependencies
- [ ] Setup project structure
- [ ] Configure Tailwind CSS + shadcn/ui

**Days 3-5: Database Setup**
- [ ] Implement SQLite connection & schema
- [ ] Create migrations
- [ ] Implement MySQL connection pool
- [ ] Test database connections
- [ ] Create data models & repositories

**Days 6-7: MQTT Infrastructure**
- [ ] Setup Aedes MQTT Broker
- [ ] Implement authentication
- [ ] Create MQTT client
- [ ] Test pub/sub functionality
- [ ] Define topic structure

---

### Week 2: Core Business Logic
**Days 8-9: Session Management**
- [ ] Implement SessionManager class
- [ ] Create session timeout logic
- [ ] Build session cleanup service
- [ ] Test session lifecycle

**Days 10-12: Data Processing**
- [ ] Implement DataProcessor service
- [ ] Build validation schemas (Zod)
- [ ] Create MySQL update logic
- [ ] Implement retry mechanism
- [ ] Test with mock data

**Days 13-14: Logging System**
- [ ] Implement file logger
- [ ] Setup log rotation
- [ ] Create SQLite logger
- [ ] Test logging functionality

---

### Week 3: UI Development
**Days 15-17: Dashboard Page**
- [ ] Create layout
- [ ] Build ActiveSession component
- [ ] Build RecentActivity component
- [ ] Build StatusCards component
- [ ] Implement real-time updates via IPC
- [ ] Add animations & transitions

**Days 18-19: Settings Page**
- [ ] Build DatabaseConfig form
- [ ] Build MQTTConfig form
- [ ] Build AppSettings form
- [ ] Implement save/load configuration
- [ ] Add connection testing

**Days 20-21: History Page**
- [ ] Build VisitTable component
- [ ] Implement filters
- [ ] Add pagination
- [ ] Implement Excel export
- [ ] Add search functionality

---

### Week 4: Integration & System Tray
**Days 22-23: IPC Communication**
- [ ] Define all IPC channels
- [ ] Implement IPC handlers
- [ ] Create type-safe IPC helpers
- [ ] Test all communication paths

**Days 24-25: System Tray**
- [ ] Implement tray icon
- [ ] Create tray menu
- [ ] Add minimize to tray
- [ ] Implement auto-start on boot
- [ ] Test tray interactions

**Days 26-28: End-to-End Testing**
- [ ] Test complete workflow
- [ ] Test error scenarios
- [ ] Test session timeout
- [ ] Test MySQL reconnection
- [ ] Performance testing

---

### Week 5: Error Handling & Polish
**Days 29-30: Error Recovery**
- [ ] Implement retry queues
- [ ] Add error notifications
- [ ] Test connection failures
- [ ] Test invalid data handling

**Days 31-32: UI/UX Polish**
- [ ] Add loading states
- [ ] Improve error messages
- [ ] Add confirmation dialogs
- [ ] Optimize animations
- [ ] Test on all screen sizes

**Days 33-35: Documentation**
- [ ] Write user manual
- [ ] Create installation guide
- [ ] Document ESP32 integration
- [ ] Create troubleshooting guide
- [ ] Record demo video

---

### Week 6: Build & Deployment
**Days 36-37: Build Setup**
- [ ] Configure electron-builder
- [ ] Create build scripts
- [ ] Design installer UI
- [ ] Test installers on all platforms

**Days 38-39: Auto-Update**
- [ ] Setup update server
- [ ] Implement update checker
- [ ] Test update process
- [ ] Create release notes template

**Days 40-42: Final Testing & Release**
- [ ] Full regression testing
- [ ] Test on fresh machines
- [ ] Create release builds
- [ ] Deploy to update server
- [ ] Prepare deployment checklist

---

## ✅ Deployment Checklist

### Pre-Installation (IT Team)
- [ ] Verify MySQL server is accessible
- [ ] Create database and tables (person, visit)
- [ ] Create MySQL user with appropriate permissions
- [ ] Note down: IP, Port, Username, Password, Database name
- [ ] Ensure Windows Defender / Firewall allows port 1883
- [ ] Prepare clinic pcucode

### Installation (On-Site)
- [ ] Run installer (Medical-Data-Collector-Setup.exe)
- [ ] Allow installation to default directory
- [ ] Wait for installation to complete
- [ ] Launch application

### First-Time Setup
- [ ] Open Settings page
- [ ] Enter Database Configuration
  - Host IP
  - Port (default: 3306)
  - Username
  - Password
  - Database name
- [ ] Click "Test Connection" → Should show 🟢 Connected
- [ ] Enter PCU Code
- [ ] Set Session Timeout (default: 10 minutes)
- [ ] Click "Save Settings"
- [ ] Verify MQTT Broker Status → Should show 🟢 Running
- [ ] Note down MQTT credentials for ESP32 configuration

### ESP32 Configuration
- [ ] Flash ESP32 with MQTT client firmware
- [ ] Configure WiFi credentials
- [ ] Configure MQTT Broker:
  - Host: [Computer IP running this app]
  - Port: 1883
  - Username: clinic_device
  - Password: [From Settings page]
- [ ] Configure Topics:
  - Card Reader: `clinic/{pcucode}/device/cardreader/data`
  - Weight: `clinic/{pcucode}/device/weight/data`
  - Height: `clinic/{pcucode}/device/height/data`
  - BP: `clinic/{pcucode}/device/bp/data`
  - Temp: `clinic/{pcucode}/device/temp/data`
- [ ] Test each device

### Verification
- [ ] Insert ID card → Dashboard should show active session
- [ ] Send weight data → Should update in dashboard
- [ ] Check MySQL visit table → Should see updated weight
- [ ] Check logs/[today].log → Should see all messages
- [ ] Let session timeout → Should cleanup after 10 minutes
- [ ] Restart computer → App should auto-start

### Maintenance
- [ ] Check logs folder weekly
- [ ] Monitor data.db size (should grow slowly)
- [ ] Verify MySQL backups
- [ ] Check for app updates (auto-update enabled)

---

## 🐛 Troubleshooting Guide

### Issue: MQTT Broker won't start
**Symptoms**: Dashboard shows "MQTT: 🔴 Stopped"

**Solutions**:
1. Check if port 1883 is already in use
   ```bash
   # Windows
   netstat -ano | findstr :1883
   
   # Linux/Mac
   lsof -i :1883
   ```
2. Try changing MQTT port in Settings
3. Check Windows Firewall rules
4. Restart the application

---

### Issue: Cannot connect to MySQL
**Symptoms**: Dashboard shows "MySQL: 🔴 Disconnected"

**Solutions**:
1. Verify MySQL server is running
2. Test connection from another tool (MySQL Workbench, phpMyAdmin)
3. Check IP address is correct
4. Verify username/password
5. Ensure MySQL user has remote access permissions
6. Check firewall rules on MySQL server
7. Verify database name exists

---

### Issue: ESP32 cannot connect to MQTT
**Symptoms**: No data appearing in dashboard

**Solutions**:
1. Verify ESP32 is on same network
2. Check computer IP hasn't changed
3. Verify MQTT credentials match
4. Check topic format is correct
5. Test with MQTT client tool (MQTT Explorer)
6. Check WiFi signal strength
7. Review ESP32 serial logs

---

### Issue: Data not updating in MySQL
**Symptoms**: Dashboard shows data, but MySQL table unchanged

**Solutions**:
1. Check sync_history table in data.db for errors
2. Verify MySQL user has UPDATE permissions
3. Check if visit record exists for the person
4. Review logs/[today].log for MySQL errors
5. Verify pcucode and visitno match

---

### Issue: Session not starting
**Symptoms**: Card scanned but no active session

**Solutions**:
1. Check if idcard exists in person table
2. Check if person has any visit records
3. Review logs for "Person not found" errors
4. Verify data format from ESP32
5. Check idcard length (must be 13 digits)

---

## 📚 API Reference (IPC Channels)

### From Renderer → Main

```typescript
// Database
ipc.invoke('db:test-connection', { host, port, username, password, database })
ipc.invoke('db:save-config', { host, port, username, password, database })

// MQTT
ipc.invoke('mqtt:get-status')
ipc.invoke('mqtt:restart')
ipc.invoke('mqtt:get-credentials')

// Sessions
ipc.invoke('session:get-active')
ipc.invoke('session:get-all')
ipc.invoke('session:clear', { idcard })

// History
ipc.invoke('history:get-visits', { startDate, endDate, idcard })
ipc.invoke('history:export-excel', { startDate, endDate })

// Logs
ipc.invoke('logs:get-recent', { limit })
ipc.invoke('logs:get-by-date', { date })

// Config
ipc.invoke('config:get')
ipc.invoke('config:set', { key, value })
ipc.invoke('config:get-all')
```

### From Main → Renderer (Events)

```typescript
// MQTT Events
ipc.on('mqtt:connected', () => {})
ipc.on('mqtt:disconnected', () => {})
ipc.on('mqtt:message', (data) => {})

// Session Events
ipc.on('session:started', (session) => {})
ipc.on('session:updated', (session) => {})
ipc.on('session:timeout', ({ idcard }) => {})

// MySQL Events
ipc.on('mysql:connected', () => {})
ipc.on('mysql:disconnected', () => {})
ipc.on('mysql:connection-lost', ({ queueSize }) => {})
ipc.on('mysql:connection-restored', () => {})

// Data Events
ipc.on('data:updated', ({ idcard, field, value }) => {})
ipc.on('data:sync-success', ({ visitno, fields }) => {})
ipc.on('data:sync-failed', ({ visitno, error }) => {})
```

---

## 🔍 Testing Strategy

### Unit Tests
- [ ] Session Manager logic
- [ ] Data validation (Zod schemas)
- [ ] MySQL query builders
- [ ] Logger functions
- [ ] Configuration encryption/decryption

### Integration Tests
- [ ] MQTT pub/sub flow
- [ ] Database connections
- [ ] IPC communication
- [ ] Session lifecycle
- [ ] Error recovery

### End-to-End Tests
- [ ] Complete workflow (card read → data collection → MySQL update)
- [ ] Multiple concurrent sessions
- [ ] Connection failures & recovery
- [ ] Session timeout
- [ ] Log rotation

### Manual Testing Checklist
- [ ] Install on fresh Windows 10
- [ ] Install on fresh Windows 11
- [ ] Install on Ubuntu 22.04
- [ ] Install on macOS 13+
- [ ] Test with real ESP32 devices
- [ ] Test MySQL connection failures
- [ ] Test invalid data formats
- [ ] Test long-running sessions (24+ hours)
- [ ] Test multiple rapid scans
- [ ] Test system sleep/wake

---

## 📝 Notes & Decisions

### Why SQLite for Local Storage?
- No external dependencies
- Cross-platform
- Excellent performance for logging
- Built-in with better-sqlite3 (synchronous API)
- Easy backup (single file)

### Why Aedes over Mosquitto?
- Embeddable (no separate installation)
- Pure Node.js (cross-platform)
- Easy authentication integration
- Lower resource usage
- Simpler deployment

### Why No INSERT to MySQL?
- Client requirement: Update existing records only
- Visit records created by another system
- Prevents data duplication
- Ensures data integrity
- Simpler error handling

### Session Timeout Strategy
- Default: 10 minutes of inactivity
- Configurable in settings
- Auto-cleanup prevents memory leaks
- Logged for audit trail

### Auto-Update Strategy
- Check for updates on app start
- Background check every 6 hours
- Silent download
- Notify user when ready
- Install on next restart

---

## 🎯 Success Criteria

### Performance
- [ ] Handle 100+ MQTT messages per minute
- [ ] MySQL update latency < 100ms
- [ ] UI remains responsive under load
- [ ] Memory usage < 200MB
- [ ] Log file size < 10MB per day

### Reliability
- [ ] 99.9% uptime (excluding network issues)
- [ ] Zero data loss (all messages logged)
- [ ] Graceful degradation on MySQL failure
- [ ] Auto-recovery from connection drops
- [ ] No crashes on invalid data

### Usability
- [ ] Installation time < 5 minutes
- [ ] Setup time < 10 minutes
- [ ] Intuitive UI (no training required)
- [ ] Clear error messages
- [ ] Responsive on all screen sizes

### Maintainability
- [ ] Comprehensive logging
- [ ] Clear error traces
- [ ] Configuration backup/restore
- [ ] Easy troubleshooting
- [ ] Update process < 2 minutes

---

## 📮 Support & Contact

### Installation Support
- Email: support@clinic.com
- Phone: 02-XXX-XXXX
- Line: @clinicsupport

### Technical Issues
- GitHub Issues: [repo-url]
- Email: tech@clinic.com

### Feature Requests
- GitHub Discussions: [repo-url]
- Email: features@clinic.com

---

## 📄 License

Proprietary - Medical Data Collector
Copyright © 2024 [Your Company Name]
All rights reserved.

---

**Document Version**: 1.0  
**Last Updated**: 2024-02-02  
**Author**: System Architect  
**Status**: Final - Ready for Implementation
