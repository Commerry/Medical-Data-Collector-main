# ESP32 Auto-Discovery System
## ระบบค้นหาอุปกรณ์อัตโนมัติ

---

## 🎯 **ภาพรวมระบบ**

ระบบใหม่นี้ **ไม่ต้องกำหนด MAC Address ล่วงหน้า** แล้ว!  
Device จะค้นหาและเชื่อมต่อกับ Center โดยอัตโนมัติผ่าน WiFi Soft AP

---

## 🔧 **วิธีการทำงาน (How It Works)**

### **Center (Hub)**
1. เปิดเป็น **WiFi Soft AP** ด้วย SSID: `MEDICAL_CENTER_01`
2. อุปกรณ์อื่นๆ สามารถ scan หา SSID นี้เพื่อรับ MAC address
3. ตั้งค่า ESP-NOW เป็น receiver พร้อมทั้ง **auto-add peer**
4. รับข้อมูลจาก Device → forward ไปยัง Serial (USB)

### **Device (Sensor Nodes)**
1. Scan หา WiFi network ชื่อ `MEDICAL_CENTER_01`
2. เมื่อเจอ → ดึง MAC address จาก BSSID (WiFi AP MAC)
3. เพิ่ม Center เป็น peer ใน ESP-NOW
4. ส่งข้อมูล device_status และ vitals ไปยัง Center

### **Flow Diagram**
```
Device Boot
    ↓
Scan WiFi networks
    ↓
Found "MEDICAL_CENTER_01"? ──No──→ Wait 5 sec → Retry
    ↓ Yes
Extract MAC from BSSID
    ↓
Add Center as ESP-NOW peer
    ↓
Send device_status (every 10s)
    ↓
Send vitals data (every 30s)
```

---

## 📋 **ขั้นตอนการติดตั้ง (Installation)**

### **1️⃣ อัปโหลดโค้ด Center**

```cpp
// ไฟล์: esp32/center/center.ino
const char* CENTER_SSID = "MEDICAL_CENTER_01";  // ⚠️ ต้องเหมือนกันทุก Device
```

**ขั้นตอน:**
1. เปิด Arduino IDE
2. เลือก Board: `ESP32 Dev Module`
3. เปิดไฟล์ `esp32/center/center.ino`
4. กด Upload
5. เปิด Serial Monitor (115200 baud)
6. คุณจะเห็น:
   ```
   === ESP32 Center Starting ===
   Center MAC Address (AP): AA:BB:CC:DD:EE:FF
   *** Devices will auto-discover this MAC via WiFi scan ***
   Center ready! Devices can now connect automatically.
   ```

---

### **2️⃣ อัปโหลดโค้ด Device**

```cpp
// ไฟล์: esp32/device/device.ino
const char* CENTER_SSID = "MEDICAL_CENTER_01";  // ⚠️ ต้องตรงกับ Center
const char* DEVICE_ID = "DEVICE_001";           // ⚠️ เปลี่ยนให้แตกต่างกันในแต่ละเครื่อง
const char* DEVICE_NAME = "BP_Monitor_01";
```

**ขั้นตอน:**
1. เปิด Arduino IDE
2. เลือก Board: `ESP32 Dev Module`
3. เปิดไฟล์ `esp32/device/device.ino`
4. **แก้ไข DEVICE_ID** ให้แตกต่างกันในแต่ละอุปกรณ์:
   - Device 1: `DEVICE_001` / `BP_Monitor_01`
   - Device 2: `DEVICE_002` / `SPO2_Monitor_01`
   - Device 3: `DEVICE_003` / `Temp_Monitor_01`
5. กด Upload
6. เปิด Serial Monitor (115200 baud)
7. คุณจะเห็น:
   ```
   === ESP32 Device Starting ===
   Device MAC Address: 11:22:33:44:55:66
   Scanning for Center...
   Found Center! MAC: AA:BB:CC:DD:EE:FF
   Center peer added successfully
   Status sent successfully
   ```

---

## ✅ **ข้อดีของระบบใหม่**

| ✅ ข้อดี | 📝 คำอธิบาย |
|---------|------------|
| **ไม่ต้อง Hardcode MAC** | Device จะค้นหาและเชื่อมต่อ Center เอง |
| **Plug & Play** | เพียงแค่เปิดเครื่อง Device ก็จะหา Center อัตโนมัติ |
| **Auto-Reconnect** | ถ้าขาดการติดต่อ Device จะ scan ใหม่ทุก 5 วินาที |
| **Scalable** | เพิ่ม Device ใหม่ได้ง่าย แค่เปลี่ยน DEVICE_ID |
| **Error Recovery** | ถ้าส่งข้อมูลไม่สำเร็จ จะ rescan Center ใหม่ |

---

## ⚠️ **ข้อควรระวัง (Important Notes)**

1. **SSID ต้องตรงกัน**  
   - Center: `CENTER_SSID = "MEDICAL_CENTER_01"`
   - Device: `CENTER_SSID = "MEDICAL_CENTER_01"`

2. **Channel ต้องเหมือนกัน**  
   - Center: `WiFi.softAP(SSID, "", 1, ...)` → channel 1
   - Device: `esp_wifi_set_channel(1, ...)` → channel 1

3. **DEVICE_ID ต้องไม่ซ้ำกัน**  
   แต่ละอุปกรณ์ต้องมี DEVICE_ID ที่แตกต่างกัน

4. **ระยะการทำงาน**  
   - WiFi Scan: ระยะ ~50-100 เมตร
   - ESP-NOW: ระยะ ~200-300 เมตร (หลังจาก paired แล้ว)

---

## 🔍 **การแก้ปัญหา (Troubleshooting)**

### **Device ไม่เจอ Center**
```
Scanning WiFi networks...
Found 3 networks
  - MyHomeWiFi
  - NeighborWiFi
  - Guest_Network
Center not found in scan
Retrying Center scan...
```

**วิธีแก้:**
- ✅ ตรวจสอบว่า Center เปิดอยู่และ upload สำเร็จ
- ✅ ตรวจสอบว่า `CENTER_SSID` ตรงกันทั้ง 2 ฝั่ง
- ✅ Device อยู่ในระยะ WiFi scan (~50-100m)

---

### **Device หา Center เจอแล้ว แต่ส่งข้อมูลไม่สำเร็จ**
```
Found Center! MAC: AA:BB:CC:DD:EE:FF
Center peer added successfully
Error sending status
```

**วิธีแก้:**
- ✅ ตรวจสอบ WiFi channel ต้องเป็น 1 ทั้งคู่
- ✅ ลอง reset ESP32 ทั้ง Center และ Device
- ✅ ตรวจสอบว่ามี interference จาก WiFi อื่นหรือไม่

---

### **Center ไม่แสดงข้อมูลที่ Serial Monitor**
```
Center ready! Devices can now connect automatically.
(ไม่มีข้อมูลเพิ่ม)
```

**วิธีแก้:**
- ✅ ตรวจสอบว่า Device ส่งข้อมูลสำเร็จ (ดูที่ Device Serial Monitor)
- ✅ ตรวจสอบ baud rate ต้องเป็น 115200
- ✅ ลองกด Reset ที่ Center ESP32

---

## 📊 **ตัวอย่างข้อมูลที่ส่ง (Message Format)**

### **Device Status Message**
```json
{
  "type": "device_status",
  "deviceId": "DEVICE_001",
  "deviceName": "BP_Monitor_01",
  "macAddress": "11:22:33:44:55:66",
  "timestamp": 12345
}
```

### **Vitals Data Message**
```json
{
  "type": "vitals",
  "deviceId": "DEVICE_001",
  "deviceName": "BP_Monitor_01",
  "macAddress": "11:22:33:44:55:66",
  "deviceType": "bp",
  "idcard": "1234567890123",
  "data": {
    "value": 120.0,
    "timestamp": 12345
  }
}
```

---

## 🚀 **การใช้งานจริง**

### **การเชื่อมต่อเซ็นเซอร์จริง**

แทนที่โค้ดจำลองใน `device.ino`:

```cpp
// ===== จำลองการอ่านค่าจากเซ็นเซอร์ =====
static unsigned long lastMeasurement = 0;
if (centerFound && (millis() - lastMeasurement > 30000)) {
  // ตัวอย่างข้อมูลความดันโลหิต
  String testIdcard = "1234567890123";
  sendVitalsData(testIdcard.c_str(), "bp", 120.0);
  delay(100);
  sendVitalsData(testIdcard.c_str(), "bp2", 80.0);
  
  lastMeasurement = millis();
}
```

**เปลี่ยนเป็น:** เช่น การอ่านจาก Blood Pressure Sensor
```cpp
if (centerFound && (millis() - lastMeasurement > 5000)) {
  // อ่านค่าจากเซ็นเซอร์จริง
  float systolic = readBPSystolic();   // ฟังก์ชันของคุณ
  float diastolic = readBPDiastolic(); // ฟังก์ชันของคุณ
  String patientId = readRFIDCard();   // อ่านบัตรผู้ป่วย
  
  if (patientId.length() == 13) {  // ตรวจสอบว่ามีบัตร
    sendVitalsData(patientId.c_str(), "bp", systolic);
    delay(100);
    sendVitalsData(patientId.c_str(), "bp2", diastolic);
  }
  
  lastMeasurement = millis();
}
```

---

## 📞 **การตั้งค่าเพิ่มเติม (Advanced Configuration)**

### **เปลี่ยน SSID ของ Center**
```cpp
// center.ino
const char* CENTER_SSID = "MY_MEDICAL_HUB";  // เปลี่ยนได้ตามต้องการ

// device.ino  
const char* CENTER_SSID = "MY_MEDICAL_HUB";  // ⚠️ ต้องเหมือนกัน!
```

### **เปลี่ยนความถี่การส่งข้อมูล**
```cpp
// device.ino
const unsigned long STATUS_INTERVAL = 5000;  // ส่งสถานะทุก 5 วินาที (เดิม 10s)
```

### **เพิ่ม Timeout สำหรับ Device**
```cpp
// center.ino
const unsigned long DEVICE_TIMEOUT = 60000;  // ถือว่า offline หลัง 60 วินาที (เดิม 30s)
```

---

## ✅ **สรุป**

| 📌 ข้อมูล | 💡 รายละเอียด |
|----------|--------------|
| **Center** | เปิด WiFi AP → Device จะหาเจอ → Auto-add peer |
| **Device** | Scan WiFi → หา Center → ส่งข้อมูลอัตโนมัติ |
| **ไม่ต้องทำ** | ❌ ไม่ต้องคัดลอก MAC address |
| **ง่ายขึ้น** | ✅ แค่เปลี่ยน DEVICE_ID ในแต่ละเครื่อง |

---

**สนุกกับการพัฒนา! 🎉**
