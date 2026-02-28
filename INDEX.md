# 📚 Medical Data Collector - Documentation Index

ยินดีต้อนรับสู่ชุดเอกสารของโปรเจค Medical Data Collector

---

## 🎯 เริ่มต้นที่นี่

### สำหรับผู้จัดการโปรเจค / Product Owner
1. อ่าน **[README.md](README.md)** - ภาพรวมโปรเจค
2. อ่าน **[PROJECT_PLAN.md](PROJECT_PLAN.md)** - แผนงานและสถาปัตยกรรมระบบ

### สำหรับนักพัฒนา (Developers)
1. อ่าน **[QUICK_START_GUIDE.md](QUICK_START_GUIDE.md)** - เริ่มต้นพัฒนา
2. อ่าน **[PROJECT_PLAN.md](PROJECT_PLAN.md)** - เข้าใจระบบโดยละเอียด
3. อ่าน **[DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)** - ทำความเข้าใจฐานข้อมูล

### สำหรับทีม Hardware / ESP32
1. อ่าน **[ESP32_INTEGRATION_GUIDE.md](ESP32_INTEGRATION_GUIDE.md)** - วิธีเชื่อมต่อ ESP32
2. อ่าน **[PROJECT_PLAN.md](PROJECT_PLAN.md)** (ส่วน MQTT Protocol) - รายละเอียด MQTT

### สำหรับทีม Database
1. อ่าน **[DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)** - Schema และ Queries
2. อ่าน **[PROJECT_PLAN.md](PROJECT_PLAN.md)** (ส่วน Database Design)

---

## 📄 รายละเอียดเอกสาร

### 1. [README.md](README.md) (11 KB)
**ภาพรวมโปรเจค**

เนื้อหา:
- ภาพรวมโปรเจคและคุณสมบัติหลัก
- Architecture diagram
- Quick start สำหรับทั้ง users และ developers
- Technology stack
- Data flow
- Troubleshooting พื้นฐาน
- License และ contact information

**ใครควรอ่าน**: ทุกคน  
**เวลาอ่าน**: ~10 นาที

---

### 2. [PROJECT_PLAN.md](PROJECT_PLAN.md) (52 KB)
**แผนงานและเอกสารสถาปัตยกรรมฉบับสมบูรณ์**

เนื้อหา:
- System Architecture แบบละเอียด
- Database Design (MySQL + SQLite)
- MQTT Protocol Design
- Data Flow และ Business Logic
- Project Structure
- Security Implementation
- Error Handling Strategy
- Development Timeline (6 weeks)
- Testing Strategy
- Deployment Checklist
- Troubleshooting Guide
- API Reference (IPC)

**ใครควรอ่าน**: Lead Developer, Architects, Project Manager  
**เวลาอ่าน**: ~45-60 นาที  
**ความสำคัญ**: ⭐⭐⭐⭐⭐ (Critical)

---

### 3. [QUICK_START_GUIDE.md](QUICK_START_GUIDE.md) (18 KB)
**คู่มือเริ่มต้นสำหรับนักพัฒนา**

เนื้อหา:
- Prerequisites และ software requirements
- Project setup ทีละขั้นตอน
- Configuration files ทั้งหมด
- Initial code setup
- Testing the setup
- Development workflow
- Common issues และการแก้ไข
- Week 1 tasks checklist

**ใครควรอ่าน**: Developers ที่เริ่มพัฒนาโปรเจค  
**เวลาอ่าน**: ~30 นาที  
**ความสำคัญ**: ⭐⭐⭐⭐⭐ (Critical for developers)

---

### 4. [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) (24 KB)
**เอกสาร Database Schema และ SQL Queries**

เนื้อหา:
- MySQL Schema (person, visit tables)
- SQLite Schema (app_config, mqtt_log, active_sessions, sync_history)
- SQL Queries ที่ใช้ในระบบทั้งหมด
- Repository Pattern examples (TypeScript)
- Database maintenance scripts
- Statistics queries
- Error monitoring queries
- Security considerations

**ใครควรอ่าน**: Developers, Database Administrators  
**เวลาอ่าน**: ~40 นาที  
**ความสำคัญ**: ⭐⭐⭐⭐ (Important)

---

### 5. [ESP32_INTEGRATION_GUIDE.md](ESP32_INTEGRATION_GUIDE.md) (20 KB)
**คู่มือการเชื่อมต่อ ESP32 กับระบบ**

เนื้อหา:
- Connection requirements (WiFi, MQTT)
- MQTT Topics และ Message Formats
- Complete Arduino Code Example
- Testing และ Debugging
- Common issues และการแก้ไข
- PlatformIO configuration
- Security considerations
- Pre-deployment checklist

**ใครควรอ่าน**: ESP32 Developers, Hardware Team  
**เวลาอ่าน**: ~35 นาที  
**ความสำคัญ**: ⭐⭐⭐⭐⭐ (Critical for hardware team)

---

## 🗺️ Navigation Guide

### ฉันต้องการ...

#### เริ่มต้นพัฒนาโปรเจค
→ อ่าน **QUICK_START_GUIDE.md** แล้วตามด้วย **PROJECT_PLAN.md**

#### เข้าใจการทำงานของระบบ
→ อ่าน **PROJECT_PLAN.md** (ส่วน System Architecture และ Data Flow)

#### เขียน ESP32 ให้เชื่อมต่อกับระบบ
→ อ่าน **ESP32_INTEGRATION_GUIDE.md**

#### เขียน SQL Queries
→ อ่าน **DATABASE_SCHEMA.md**

#### Debug ปัญหา
→ ดูที่ **PROJECT_PLAN.md** (ส่วน Troubleshooting) และ **README.md**

#### สร้าง Installer
→ ดูที่ **QUICK_START_GUIDE.md** และ **PROJECT_PLAN.md** (ส่วน Build & Distribution)

#### เข้าใจ MQTT Protocol
→ อ่าน **PROJECT_PLAN.md** (ส่วน MQTT Protocol) และ **ESP32_INTEGRATION_GUIDE.md**

#### Setup Database
→ อ่าน **DATABASE_SCHEMA.md** และ **QUICK_START_GUIDE.md**

---

## 📊 Document Dependencies

```
README.md (เริ่มที่นี่)
    ├── PROJECT_PLAN.md (แผนงานหลัก)
    │   ├── QUICK_START_GUIDE.md (สำหรับ developers)
    │   ├── DATABASE_SCHEMA.md (สำหรับ database work)
    │   └── ESP32_INTEGRATION_GUIDE.md (สำหรับ hardware)
    │
    └── Quick Reference
        ├── QUICK_START_GUIDE.md
        ├── DATABASE_SCHEMA.md
        └── ESP32_INTEGRATION_GUIDE.md
```

---

## 🎯 Learning Path

### Level 1: Overview (1-2 hours)
1. README.md - ภาพรวมโปรเจค
2. PROJECT_PLAN.md (ส่วน Overview และ Architecture)

### Level 2: Development Setup (2-3 hours)
1. QUICK_START_GUIDE.md - Setup environment
2. Follow step-by-step setup
3. Test basic functionality

### Level 3: Deep Dive (4-6 hours)
1. PROJECT_PLAN.md - อ่านทั้งหมด
2. DATABASE_SCHEMA.md - ทำความเข้าใจ database
3. ESP32_INTEGRATION_GUIDE.md (ถ้าทำ hardware)

### Level 4: Implementation (Ongoing)
1. Follow development timeline in PROJECT_PLAN.md
2. Reference guides as needed
3. Test thoroughly

---

## 📝 Quick Reference Cards

### MQTT Topics Quick Reference
```
Card Reader:  clinic/{pcucode}/device/cardreader/data
Weight:       clinic/{pcucode}/device/weight/data
Height:       clinic/{pcucode}/device/height/data
BP Monitor:   clinic/{pcucode}/device/bp/data
Thermometer:  clinic/{pcucode}/device/temp/data
```

### Common Commands
```bash
# Development
npm run dev              # Start development mode
npm run build           # Build for production
npm run dist            # Create installer

# Testing
npm run test            # Run tests
npm run lint            # Run linter
npm run type-check      # Check TypeScript

# Platform-specific builds
npm run dist:win        # Windows
npm run dist:mac        # macOS
npm run dist:linux      # Linux
```

### Key Files Locations
```
Config:   electron-store encrypted file
Logs:     logs/YYYY-MM-DD.log
Database: data/data.db
Build:    dist/
```

---

## ✅ Documentation Checklist

เมื่ออ่านเอกสารครบแล้ว คุณควรจะ:

### Understanding
- [ ] เข้าใจภาพรวมของโปรเจค
- [ ] เข้าใจ architecture และ data flow
- [ ] เข้าใจ MQTT protocol ที่ใช้
- [ ] เข้าใจ database schema
- [ ] เข้าใจวิธีการ deploy

### Skills
- [ ] สามารถ setup development environment ได้
- [ ] สามารถเขียน ESP32 code ที่ integrate ได้
- [ ] สามารถเขียน SQL queries ที่ต้องใช้
- [ ] สามารถ debug ปัญหาเบื้องต้นได้
- [ ] สามารถ build และ create installer ได้

### Next Steps
- [ ] เริ่ม development ตาม Week 1 tasks
- [ ] Setup test environment
- [ ] Create first feature branch
- [ ] Run through complete workflow

---

**Happy Coding! 🚀**

*Documentation Version: 1.0*  
*Last Updated: 2024-02-02*  
*Maintained by: Development Team*
