# ESP32 vs ESP8266 Compatibility Guide
## คู่มือรองรับทั้ง ESP32 และ ESP8266

---

## ✅ **รองรับทั้ง 2 บอร์ดแล้ว!**

โค้ดตอนนี้สามารถใช้ได้กับทั้ง **ESP32** และ **ESP8266** โดยอัตโนมัติ!  
ไม่ต้องแก้ไขโค้ด - Arduino IDE จะตรวจจับบอร์ดเองและ compile ให้ถูกต้อง

---

## 📊 **เปรียบเทียบ ESP32 vs ESP8266**

| คุณสมบัติ | **ESP32** ✨ | **ESP8266** |
|-----------|-------------|-------------|
| **CPU** | Dual-core 240 MHz | Single-core 80/160 MHz |
| **RAM** | 520 KB | 80 KB |
| **Flash** | 4 MB+ | 1-4 MB |
| **WiFi** | 802.11 b/g/n (2.4 GHz) | 802.11 b/g/n (2.4 GHz) |
| **ESP-NOW** | ✅ รองรับ | ✅ รองรับ |
| **Dual WiFi Mode** | ✅ AP + STA พร้อมกัน | ⚠️ AP หรือ STA (ไม่พร้อมกัน) |
| **GPIO** | 34 pins | 17 pins |
| **ADC** | 18 channels, 12-bit | 1 channel, 10-bit |
| **ราคา** | ~฿120-200 | ~฿60-100 |
| **แนะนำสำหรับ** | **Center (Hub)** | Device (Sensor) |

---

## 🎯 **แนะนำการใช้งาน**

### **ตัวเลือกที่ 1: ทั้งหมดใช้ ESP32** ⭐ (แนะนำ)
- **Center**: ESP32
- **Devices**: ESP32
- **ข้อดี**: Performance สูง, Memory มาก, เสถียร
- **ข้อเสีย**: ราคาแพงกว่า

### **ตัวเลือกที่ 2: ผสมกัน** 💰 (ประหยัด)
- **Center**: ESP32 (ต้องมี RAM และ performance สูง)
- **Devices**: ESP8266 (ประหยัดต้นทุน)
- **ข้อดี**: ลดต้นทุน, เซ็นเซอร์ใช้ ESP8266 ก็เพียงพอ
- **ข้อเสีย**: Device มี memory จำกัด (รองรับสูงสุด 10 devices ต่อ Center)

### **ตัวเลือกที่ 3: ทั้งหมดใช้ ESP8266** ⚠️ (ไม่แนะนำสำหรับ Center)
- **ข้อจำกัด**: Center บน ESP8266 รองรับ device ได้ **สูงสุด 10 เครื่อง** (ESP32 ไม่จำกัด)
- **ข้อดี**: ราคาถูก
- **ข้อเสีย**: Performance ต่ำ, Memory จำกัด

---

## 🔧 **วิธีใช้งานโค้ดกับทั้ง 2 บอร์ด**

### **ขั้นตอนเดียวกัน - Arduino IDE จะจัดการให้!**

1. เปิด Arduino IDE
2. เลือกบอร์ด:
   - **ESP32**: `Tools → Board → ESP32 Dev Module`
   - **ESP8266**: `Tools → Board → NodeMCU 1.0 (ESP-12E Module)`
3. เปิดไฟล์ `.ino`
4. กด **Upload**
5. โค้ดจะ compile ให้ตรงกับบอร์ดที่เลือกโดยอัตโนมัติ!

---

## 📋 **การติดตั้ง Board Support**

### **ESP32**
```
Arduino IDE → File → Preferences → Additional Boards Manager URLs:
https://dl.espressif.com/dl/package_esp32_index.json

Tools → Board → Boards Manager → ค้นหา "esp32" → Install
```

### **ESP8266**
```
Arduino IDE → File → Preferences → Additional Boards Manager URLs:
http://arduino.esp8266.com/stable/package_esp8266com_index.json

Tools → Board → Boards Manager → ค้นหา "esp8266" → Install
```

---

## ⚙️ **ความแตกต่างที่โค้ดจัดการให้อัตโนมัติ**

### **1. Library Includes**
```cpp
#ifdef ESP32
  #include <esp_now.h>
  #include <WiFi.h>
  #include <esp_wifi.h>
#elif defined(ESP8266)
  #include <ESP8266WiFi.h>
  extern "C" {
    #include <espnow.h>
  }
#endif
```

### **2. WiFi Channel Setting**
```cpp
#ifdef ESP32
  esp_wifi_set_channel(WIFI_CHANNEL, WIFI_SECOND_CHAN_NONE);
#else
  // ESP8266: ตั้งค่า channel ผ่าน esp_now_add_peer()
  wifi_set_channel(WIFI_CHANNEL);
#endif
```

### **3. ESP-NOW Initialization**
```cpp
#ifdef ESP32
  esp_now_init();  // ESP32 syntax
#else
  esp_now_init();  // ESP8266 syntax (เหมือนกันแต่ return type ต่าง)
#endif
```

### **4. JSON Document Size**
```cpp
#ifdef ESP32
  StaticJsonDocument<512> doc;  // ESP32 มี RAM มาก
#else
  StaticJsonDocument<256> doc;  // ESP8266 มี RAM น้อย
#endif
```

### **5. Device List Storage (Center only)**
```cpp
#ifdef ESP32
  std::vector<DeviceInfo> connectedDevices;  // ไม่จำกัด
#else
  DeviceInfo connectedDevices[10];           // สูงสุด 10 devices
  int deviceCount = 0;
#endif
```

---

## 🛠️ **การตั้งค่าบอร์ดใน Arduino IDE**

### **สำหรับ ESP32:**
```
Board: ESP32 Dev Module
Upload Speed: 921600
CPU Frequency: 240 MHz (WiFi/BT)
Flash Frequency: 80 MHz
Flash Mode: QIO
Flash Size: 4MB (32Mb)
Partition Scheme: Default 4MB with spiffs (1.2MB APP/1.5MB SPIFFS)
Core Debug Level: None
PSRAM: Disabled
```

### **สำหรับ ESP8266:**
```
Board: NodeMCU 1.0 (ESP-12E Module)
Upload Speed: 115200
CPU Frequency: 80 MHz
Flash Size: 4M (1M SPIFFS)
Debug port: Disabled
Debug Level: None
IwIP Variant: v2 Lower Memory
VTables: Flash
Erase Flash: Only Sketch
SSL Support: All SSL ciphers (most compatible)
```

---

## ⚠️ **ข้อควรระวัง**

### **ESP8266 Limitations:**

1. **Memory จำกัด**
   - Center รองรับสูงสุด **10 devices**
   - JSON message ต้องเล็กกว่า ESP32

2. **WiFi Mode**
   - ESP8266 **ไม่รองรับ AP + STA พร้อมกัน** อย่างสมบูรณ์
   - Center บน ESP8266 จะเปิดเฉพาะ **AP mode**

3. **Performance**
   - CPU ช้ากว่า ESP32
   - การประมวลผลข้อมูลใช้เวลานานกว่า

4. **Power Consumption**
   - ESP8266 กินไฟมากกว่า ESP32 (ในบางโหมด)

---

## 🧪 **ตัวอย่างการใช้งาน**

### **สถานการณ์ 1: ระบบเล็ก (3-5 devices)**
```
Center: ESP8266 (ประหยัด ~฿60)
Device 1-5: ESP8266 ทั้งหมด
รวม: ~฿360-500
```

### **สถานการณ์ 2: ระบบขนาดกลาง (10-20 devices)** ⭐
```
Center: ESP32 (performance + memory)
Device 1-20: ESP8266 (ประหยัดต้นทุน)
รวม: ~฿150 + (20 × ฿70) = ~฿1,550
```

### **สถานการณ์ 3: ระบบใหญ่ (20+ devices)**
```
Center: ESP32
Devices: ESP32 ทั้งหมด (stability + performance)
รวม: ~฿150 × 21 = ~฿3,150
```

---

## 📝 **Serial Monitor Output**

### **ESP32 Center:**
```
=============================
=== ESP32 Center Starting ===
=============================
Soft AP started successfully
AP IP address: 192.168.4.1
Center MAC Address (AP): AA:BB:CC:DD:EE:FF
*** Devices will auto-discover this MAC via WiFi scan ***
ESP-NOW initialized

=== Center Configuration ===
Board: ESP32
SSID: MEDICAL_CENTER_01
MAC: AA:BB:CC:DD:EE:FF
Channel: 1
============================

Center ready! Devices can now connect automatically.
```

### **ESP8266 Center:**
```
=============================
=== ESP8266 Center Starting ===
=============================
Soft AP started successfully
AP IP address: 192.168.4.1
Center MAC Address (AP): AA:BB:CC:DD:EE:FF
*** Devices will auto-discover this MAC via WiFi scan ***
ESP-NOW initialized

=== Center Configuration ===
Board: ESP8266
SSID: MEDICAL_CENTER_01
MAC: AA:BB:CC:DD:EE:FF
Channel: 1
============================

Center ready! Devices can now connect automatically.
```

---

## 🔍 **การแก้ปัญหา (Troubleshooting)**

### **ปัญหา: ESP8266 Center พบข้อผิดพลาด "Out of Memory"**
**วิธีแก้:**
```cpp
// ลดจำนวน device ที่รองรับ
#else
  DeviceInfo connectedDevices[5];  // ลดจาก 10 → 5
  int deviceCount = 0;
#endif
```

### **ปัญหา: ESP8266 Device ส่งข้อมูลไม่สำเร็จ**
**วิธีแก้:**
- ตรวจสอบว่า JSON message size ไม่เกิน 256 bytes
- ลด Status Interval:
```cpp
const unsigned long STATUS_INTERVAL = 15000;  // เพิ่มเป็น 15 วินาที
```

### **ปัญหา: ESP8266 Device หา Center ไม่เจอ**
**วิธีแก้:**
- เพิ่มเวลา delay หลัง WiFi.begin():
```cpp
void setup() {
  Serial.begin(115200);
  delay(500);  // เพิ่ม delay สำหรับ ESP8266
  // ...
}
```

### **ปัญหา: ESP8266 Watchdog Timer Reset**
**วิธีแก้:**
```cpp
void loop() {
  // เพิ่มบรรทัดนี้ใน loop (ESP8266 only)
  #ifdef ESP8266
    ESP.wdtFeed();  // Feed watchdog
  #endif
  
  // ... rest of code
}
```

---

## 📚 **Library Requirements**

### **ESP32:**
```
- ESP32 Board Package by Espressif (v2.0.0+)
- ArduinoJson by Benoit Blanchon (v6.21.0+)
```

### **ESP8266:**
```
- ESP8266 Board Package by ESP8266 Community (v3.0.0+)
- ArduinoJson by Benoit Blanchon (v6.21.0+)
```

---

## ✨ **สรุป**

| 🎯 | **ข้อมูล** |
|---|-----------|
| ✅ | รองรับทั้ง ESP32 และ ESP8266 |
| 🔧 | ไม่ต้องแก้โค้ด - compile อัตโนมัติ |
| 💰 | เลือกใช้ ESP8266 เพื่อประหยัดต้นทุน |
| ⚡ | เลือกใช้ ESP32 เพื่อ performance สูง |
| 🎨 | ผสมกันได้ - Center ใช้ ESP32, Device ใช้ ESP8266 |

---

**Happy Making! 🚀**
