/**
 * Config.h
 * ไฟล์กำหนดค่าการทำงานของระบบ RS232 to HTTP POST
 * 
 * =============================================================================
 * ===== รองรับอุปกรณ์ 2 ประเภท =====
 * =============================================================================
 * 
 * 1️⃣ เครื่องวัดความดัน (BP Monitor) - ESP32
 *    - Baud: 115200
 *    - รับข้อมูล JSON: {"end_time":"...", "idcard":"...", "blood_pressure_h":127, ...}
 *    - ดึงค่า: idcard, bp, bp2, pulse
 *    - กรองข้อมูล: ส่งเฉพาะ 4 fields
 * 
 * 2️⃣ เครื่องชั่ง (Weight Scale) - ESP8266
 *    - Baud: 9600
 *    - รับข้อมูล Text: W:070.3 H:173.5, T365$
 *    - ดึงค่า: weight, height, temp
 * 
 * =============================================================================
 * ===== QUICK START =====
 * =============================================================================
 * 
 * 1. ต่อสาย RS232 (MAX3232) เข้า ESP32/ESP8266
 *    - ESP32:   RX=GPIO16, TX=GPIO17
 *    - ESP8266: RX=D7,     TX=D8
 * 
 * 2. Upload โปรแกรม (เลือก Board ตาม Hardware)
 * 
 * 3. เปิด Serial Monitor (115200 baud)
 * 
 * 4. ข้อมูลจะถูกส่งไปยัง Center ผ่าน HTTP POST อัตโนมัติ
 * 
 * =============================================================================
 */

#ifndef CONFIG_H
#define CONFIG_H

#include <ArduinoJson.h>

// =============================================================================
// ===== WIFI CONFIGURATION (ตั้งค่า WiFi Center) =====
// =============================================================================
const char* CENTER_SSID = "MEDICAL_CENTER_01";  // SSID ของ Center AP
const char* CENTER_PASSWORD = "Abc123**";       // รหัสผ่าน WiFi
const char* CENTER_IP = "10.1.10.1";            // IP Address ของ Center

// =============================================================================
// ===== DEVICE CONFIGURATION (ตั้งค่าอุปกรณ์) =====
// =============================================================================
// ชื่ออุปกรณ์ที่จะแสดงใน Center (แก้ไขตามประเภทของอุปกรณ์)
// 
// ตัวอย่าง:
//   - "WeightScale_Room1"  - เครื่องชั่งห้อง 1
//   - "BPMonitor_Room2"    - เครื่องวัดความดันห้อง 2
//   - "Thermometer_Main"   - เครื่องวัดอุณหภูมิหลัก
const char* DEFAULT_DEVICE_NAME = "DEVICE W:02";

// =============================================================================
// ===== DATA STRUCTURE =====
// =============================================================================
struct ConfigData {
  char deviceName[32];  // ชื่ออุปกรณ์ (แสดงใน Center)
};

ConfigData config;

// =============================================================================
// ===== FUNCTIONS (ฟังก์ชันสำหรับจัดการ Config) =====
// =============================================================================

// ===== ฟังก์ชันโหลด Config =====
void Config_begin() {
  EEPROM.begin(EEPROM_SIZE);
  
  // โหลด Config จาก EEPROM
  int addr = 0;
  EEPROM.get(addr, config.deviceName);
  
  // ถ้าไม่มี Config ให้ใช้ค่า Default
  if (strlen(config.deviceName) == 0 || config.deviceName[0] == 0xFF) {
    strcpy(config.deviceName, DEFAULT_DEVICE_NAME);
  }
  
  Serial.println("📋 Config ปัจจุบัน:");
  Serial.println("================================================================================");
  Serial.println("WIFI SETTINGS:");
  Serial.printf("   Center SSID: %s\n", CENTER_SSID);
  Serial.printf("   Center IP:   %s\n", CENTER_IP);
  Serial.println();
  Serial.println("RS232 SETTINGS:");
  
  #ifdef ESP32
    Serial.println("   Board:       ESP32");
    Serial.println("   Device:      เครื่องวัดความดัน");
    Serial.println("   Baud Rate:   115200");
    Serial.println("   RX Pin:      GPIO16");
    Serial.println("   TX Pin:      GPIO17");
  #elif defined(ESP8266)
    Serial.println("   Board:       ESP8266");
    Serial.println("   Device:      เครื่องชั่ง/ส่วนสูง");
    Serial.println("   Baud Rate:   9600");
    Serial.println("   RX Pin:      D7 (GPIO13)");
    Serial.println("   TX Pin:      D8 (GPIO15)");
  #endif
  
  Serial.println();
  Serial.println("DEVICE SETTINGS:");
  Serial.printf("   Device Name: %s\n", config.deviceName);
  Serial.println("================================================================================");
  Serial.println();
}

// ===== ฟังก์ชันบันทึก Config =====
void Config_save() {
  Serial.println("\n💾 บันทึก Config...");
  
  int addr = 0;
  EEPROM.put(addr, config.deviceName);
  EEPROM.commit();
  
  Serial.println("✅ บันทึก Config สำเร็จ!");
}

// ===== ฟังก์ชันเชื่อมต่อ WiFi =====
bool Config_connectWiFi() {
  Serial.println("\n🔌 กำลังเชื่อมต่อ WiFi...");
  Serial.printf("   SSID: %s\n", CENTER_SSID);
  Serial.printf("   Center IP: %s\n", CENTER_IP);
  Serial.println();
  
  // ตัดการเชื่อมต่อเดิม (ถ้ามี)
  WiFi.disconnect(true);
  delay(1000);
  
  // เชื่อมต่อ WiFi
  WiFi.mode(WIFI_STA);
  WiFi.begin(CENTER_SSID, CENTER_PASSWORD);
  
  int attempts = 0;
  int maxAttempts = 20;  // 20 วินาที
  
  Serial.print("   รอการเชื่อมต่อ");
  while (WiFi.status() != WL_CONNECTED && attempts < maxAttempts) {
    delay(1000);
    Serial.print(".");
    attempts++;
  }
  Serial.println();
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ เชื่อมต่อ WiFi สำเร็จ!");
    Serial.print("   IP: ");
    Serial.println(WiFi.localIP());
    Serial.print("   MAC: ");
    Serial.println(WiFi.macAddress());
    Serial.print("   RSSI: ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm\n");
    return true;
  } else {
    Serial.println("\n❌ ไม่สามารถเชื่อมต่อ WiFi ได้");
    Serial.println("   กรุณาตรวจสอบ:");
    Serial.printf("   - Center AP (%s) เปิดอยู่หรือไม่\n", CENTER_SSID);
    Serial.printf("   - รหัสผ่าน (%s) ถูกต้องหรือไม่\n", CENTER_PASSWORD);
    Serial.println();
    return false;
  }
}

// ===== ฟังก์ชัน Reset Config =====
void Config_reset() {
  // ลบ EEPROM ทั้งหมด
  for (int i = 0; i < EEPROM_SIZE; i++) {
    EEPROM.write(i, 0xFF);
  }
  EEPROM.commit();
  
  Serial.println("✅ ลบ Config ทั้งหมดสำเร็จ!");
}

// ===== ฟังก์ชันดึง Config =====
ConfigData* Config_get() {
  return &config;
}

#endif
