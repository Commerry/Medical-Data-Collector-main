# ESP32 Code for Medical Data Collector

โฟลเดอร์นี้เก็บโค้ด Arduino สำหรับ ESP32 ที่ใช้ในระบบ Medical Data Collector

## โครงสร้าง

- **device/** - โค้ดสำหรับ ESP32 ฝั่ง Device (อุปกรณ์วัดสัญญาณชีพ)
- **center/** - โค้ดสำหรับ ESP32 ฝั่ง Center (ตัวกลางเชื่อมต่อกับคอมพิวเตอร์)

## การทำงาน

### Device (อุปกรณ์วัดสัญญาณชีพ)
- อ่านค่าจากเซ็นเซอร์ต่างๆ (BP, SpO2, Temp, ฯลฯ)
- ส่งข้อมูลผ่าน ESP-NOW ไปยัง Center
- ส่งสถานะอุปกรณ์เป็นระยะ (heartbeat)

### Center (ตัวกลาง)
- รับข้อมูลจาก Device ผ่าน ESP-NOW
- ส่งข้อมูลต่อไปยังคอมพิวเตอร์ผ่าน USB Serial
- ติดตามสถานะอุปกรณ์ทั้งหมด
- รักษารายการอุปกรณ์ที่เชื่อมต่อ

## การติดตั้ง

### ความต้องการ
1. Arduino IDE 2.x
2. ESP32 Board Package
3. ArduinoJson Library (v6.x)

### ขั้นตอนการติดตั้ง

#### 1. ติดตั้ง Arduino IDE
ดาวน์โหลดและติดตั้งจาก https://www.arduino.cc/en/software

#### 2. ติดตั้ง ESP32 Board
1. เปิด Arduino IDE
2. ไปที่ File > Preferences
3. ใน "Additional Board Manager URLs" ใส่:
   ```
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
4. ไปที่ Tools > Board > Board Manager
5. ค้นหา "esp32" และติดตั้ง "ESP32 by Espressif Systems"

#### 3. ติดตั้ง ArduinoJson Library
1. ไปที่ Sketch > Include Library > Manage Libraries
2. ค้นหา "ArduinoJson"
3. ติดตั้ง "ArduinoJson by Benoit Blanchon" (v6.x)

## การใช้งาน

### 1. อัพโหลด Center Code (ทำก่อน)

1. เปิดไฟล์ `center/center.ino`
2. เลือก Board: "ESP32 Dev Module" หรือบอร์ดที่ใช้
3. เลือก Port ที่ ESP32 Center เชื่อมต่ออยู่
4. กด Upload
5. **สำคัญ**: เปิด Serial Monitor (115200 baud) และจดบันทึก MAC Address ที่แสดงออกมา
   ```
   Center MAC Address: AA:BB:CC:DD:EE:FF
   *** IMPORTANT: Copy this MAC address to all Device sketches! ***
   ```

### 2. อัพโหลด Device Code

1. เปิดไฟล์ `device/device.ino`
2. แก้ไข MAC Address ของ Center ในบรรทัดที่ 6:
   ```cpp
   uint8_t centerAddress[] = {0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF}; // เปลี่ยนเป็น MAC ของ Center
   ```
3. แก้ไข DEVICE_ID และ DEVICE_NAME ให้แตกต่างกันในแต่ละอุปกรณ์:
   ```cpp
   const char* DEVICE_ID = "DEVICE_001";      // เปลี่ยนเป็น DEVICE_002, DEVICE_003, ...
   const char* DEVICE_NAME = "BP_Monitor_01"; // ชื่ออุปกรณ์
   ```
4. เลือก Board: "ESP32 Dev Module"
5. เลือก Port ที่ ESP32 Device เชื่อมต่ออยู่
6. กด Upload
7. ทำซ้ำสำหรับทุก Device

### 3. เชื่อมต่อกับคอมพิวเตอร์

1. เสียบ USB ของ ESP32 Center เข้ากับคอมพิวเตอร์
2. จดบันทึก COM Port (Windows) หรือ /dev/ttyUSB# (Linux)
3. ตั้งค่าใน Settings ของโปรแกรม:
   - Port Name: COM3 (หรือ port ที่ใช้)
   - Baud Rate: 115200

## รูปแบบข้อมูล

### Device Status Message
```json
{
  "type": "device_status",
  "deviceId": "DEVICE_001",
  "deviceName": "BP_Monitor_01",
  "macAddress": "AA:BB:CC:DD:EE:FF",
  "timestamp": 12345678
}
```

### Vitals Data Message
```json
{
  "type": "vitals",
  "deviceId": "DEVICE_001",
  "deviceName": "BP_Monitor_01",
  "macAddress": "AA:BB:CC:DD:EE:FF",
  "deviceType": "bp",
  "idcard": "1234567890123",
  "data": {
    "value": 120.0,
    "timestamp": 12345678
  }
}
```

## Device Types รองรับ

- `bp` - Blood Pressure (Systolic)
- `bp2` - Blood Pressure (Diastolic)
- `spo2` - Blood Oxygen Level
- `temp` - Temperature
- `pulse` - Pulse Rate
- `glucose` - Blood Glucose
- `weight` - Weight
- `height` - Height
- `waist` - Waist Circumference
- `bmi` - Body Mass Index

## การแก้ปัญหา

### Device ไม่เชื่อมต่อกับ Center
1. ตรวจสอบว่า MAC Address ของ Center ถูกต้องใน Device code
2. ตรวจสอบว่า ESP32 ทั้งสองอยู่ในระยะที่ใกล้กันพอ (< 100m)
3. ลอง Reset ทั้ง Center และ Device

### คอมพิวเตอร์ไม่รับข้อมูล
1. ตรวจสอบว่าเลือก COM Port ถูกต้อง
2. ตรวจสอบ Baud Rate ต้องเป็น 115200
3. ตรวจสอบว่า USB cable รองรับ Data (ไม่ใช่แค่ Power)
4. ลองปิดโปรแกรมอื่นที่อาจใช้ Serial Port

### ข้อมูลไม่ครบถ้วน
1. ตรวจสอบ Serial Monitor ของ Center ว่ารับข้อมูลจาก Device หรือไม่
2. ตรวจสอบว่าไม่มี Packet loss สูงเกินไป
3. ลดระยะห่างระหว่าง Device และ Center

## หมายเหตุ

- ESP-NOW รองรับการเชื่อมต่อหลายอุปกรณ์พร้อมกัน
- ระยะการส่งข้อมูล ESP-NOW ประมาณ 200-300 เมตร (พื้นที่โล่ง)
- ในอาคารอาจลดลงเหลือ 30-100 เมตร ขึ้นอยู่กับสิ่งกีดขวาง
- ควรติดตั้ง Center ในตำแหน่งกลางพื้นที่ใช้งาน
