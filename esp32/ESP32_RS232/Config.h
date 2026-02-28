/**
 * Config.h
 * ไฟล์กำหนดค่าการทำงานของระบบ RS232 to HTTP POST
 * 
 * =============================================================================
 * ===== QUICK START: วิธีเปลี่ยนอุปกรณ์ RS232 =====
 * =============================================================================
 * 
 * 1. ดูค่า Baud Rate จาก Manual ของอุปกรณ์
 * 2. แก้ไข RS232_BAUD_RATE (ปกติคือ 9600)
 * 3. ตรวจสอบ Serial Format (ปกติคือ 8N1)
 * 4. ตรวจสอบ Pin ที่ต่อ:
 *    - ESP32:   RX=GPIO16, TX=GPIO17
 *    - ESP8266: RX=D7,     TX=D8
 * 5. Upload โปรแกรม
 * 6. ดู Serial Monitor เพื่อตรวจสอบการทำงาน
 * 
 * =============================================================================
 * ===== ตัวอย่างอุปกรณ์ที่รองรับ =====
 * =============================================================================
 * 
 * ✅ เครื่องชั่งน้ำหนัก (Weight Scale)
 *    - รับข้อมูล: W:070.3 H:173.5
 *    - Baud Rate: 9600 (8N1)
 * 
 * ✅ เครื่องวัดความดัน (Blood Pressure Monitor)
 *    - รับข้อมูล: BP:120/80 P:75
 *    - Baud Rate: 9600 (8N1)
 * 
 * ✅ เครื่องวัดอุณหภูมิ (Thermometer)
 *    - รับข้อมูล: T365$ (36.5°C)
 *    - Baud Rate: 9600 (8N1)
 * 
 * ✅ JSON Format (รองรับอุปกรณ์ที่ส่ง JSON)
 *    - รับข้อมูล: {"weight": 70.3, "height": 173.5}
 * 
 * =============================================================================
 * 
 * รองรับทั้ง ESP32 และ ESP8266
 */

#ifndef CONFIG_H
#define CONFIG_H

#include <ArduinoJson.h>

#ifdef ESP32
  #include <WiFi.h>
  #include <Preferences.h>
  extern Preferences preferences;
#elif defined(ESP8266)
  #include <ESP8266WiFi.h>
  #include <EEPROM.h>
  #define EEPROM_SIZE 512
#endif

// =============================================================================
// ===== WIFI CONFIGURATION (ตั้งค่า WiFi Center) =====
// =============================================================================
const char* CENTER_SSID = "MEDICAL_CENTER_01";  // SSID ของ Center AP
const char* CENTER_PASSWORD = "Abc123**";       // รหัสผ่าน WiFi
const char* CENTER_IP = "10.1.10.1";            // IP Address ของ Center

// =============================================================================
// ===== RS232 CONFIGURATION (ตั้งค่าการอ่านข้อมูล RS232) =====
// =============================================================================

// --- Baud Rate Settings ---
// เปลี่ยนตามอุปกรณ์ที่เชื่อมต่อ:
//
// อุปกรณ์วัดสุขภาพทั่วไป:
//   - เครื่องชั่งน้ำหนัก (Weight Scale):     9600 baud
//   - เครื่องวัดความดัน (BP Monitor):      9600 baud
//   - เครื่องวัดอุณหภูมิ (Thermometer):     9600 baud
//   - เครื่องวัดออกซิเจน (Pulse Oximeter): 9600 baud ถึง 115200 baud
//
// อื่นๆ:
//   - อุปกรณ์ทั่วไป: ดูจาก Manual / Specification
//   - ค่าที่ใช้บ่อย: 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200
const long RS232_BAUD_RATE = 9600;

// --- Serial Format Settings ---
// รูปแบบ: Data bits, Parity, Stop bits
//
// SERIAL_8N1 = 8 Data bits, No Parity, 1 Stop bit (ใช้บ่อยที่สุด ⭐)
// SERIAL_8N2 = 8 Data bits, No Parity, 2 Stop bits
// SERIAL_7E1 = 7 Data bits, Even Parity, 1 Stop bit
// SERIAL_7O1 = 7 Data bits, Odd Parity, 1 Stop bit
// SERIAL_8E1 = 8 Data bits, Even Parity, 1 Stop bit
// SERIAL_8O1 = 8 Data bits, Odd Parity, 1 Stop bit
#ifdef ESP32
  #define RS232_SERIAL_FORMAT SERIAL_8N1  // 8N1 เป็นมาตรฐาน
#endif

// --- Pin Configuration ---
// ESP32: ใช้ Hardware Serial2 (UART2)
// ESP8266: ใช้ Software Serial
#ifdef ESP32
  #define RS232_RX_PIN 16  // GPIO16 (RX) - ต่อกับ TX ของอุปกรณ์
  #define RS232_TX_PIN 17  // GPIO17 (TX) - ต่อกับ RX ของอุปกรณ์
#elif defined(ESP8266)
  #define RS232_RX_PIN D7  // GPIO13 (RX) - ต่อกับ TX ของอุปกรณ์
  #define RS232_TX_PIN D8  // GPIO15 (TX) - ต่อกับ RX ของอุปกรณ์
#endif

// --- Data Parsing Settings ---
// รอข้อมูลครบครบ (ms) ก่อนส่งออกไป
// - ถ้าอุปกรณ์ส่งข้อมูลช้า ให้เพิ่มค่านี้
// - ถ้าต้องการตอบสนองเร็ว ให้ลดค่านี้
#define RS232_WAIT_COMPLETE_TIMEOUT 5000  // 5 วินาที

// =============================================================================
// ===== DEVICE CONFIGURATION (ตั้งค่าอุปกรณ์) =====
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
  #ifdef ESP32
    // ESP32 ใช้ Preferences
    preferences.begin("rs232-config", false);
    
    // โหลด Config จาก Flash
    preferences.getString("deviceName", config.deviceName, 32);
    
  #elif defined(ESP8266)
    // ESP8266 ใช้ EEPROM
    EEPROM.begin(EEPROM_SIZE);
    
    // โหลด Config จาก EEPROM
    int addr = 0;
    EEPROM.get(addr, config.deviceName);
  #endif
  
  // ถ้าไม่มี Config ให้ใช้ค่า Default
  if (strlen(config.deviceName) == 0 || config.deviceName[0] == 0xFF) {
    #ifdef ESP32
      strcpy(config.deviceName, "ESP32-RS232");
    #elif defined(ESP8266)
      strcpy(config.deviceName, "ESP8266-RS232");
    #endif
  }
  
  Serial.println("📋 Config ปัจจุบัน:");
  Serial.println("================================================================================");
  Serial.println("WIFI SETTINGS:");
  Serial.printf("   Center SSID: %s\n", CENTER_SSID);
  Serial.printf("   Center IP:   %s\n", CENTER_IP);
  Serial.println();
  Serial.println("RS232 SETTINGS:");
  Serial.printf("   Baud Rate:   %ld\n", RS232_BAUD_RATE);
  #ifdef ESP32
    Serial.printf("   Format:      8N1\n");
    Serial.printf("   RX Pin:      GPIO%d\n", RS232_RX_PIN);
    Serial.printf("   TX Pin:      GPIO%d\n", RS232_TX_PIN);
  #elif defined(ESP8266)
    Serial.printf("   RX Pin:      D7 (GPIO%d)\n", RS232_RX_PIN);
    Serial.printf("   TX Pin:      D8 (GPIO%d)\n", RS232_TX_PIN);
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
  
  #ifdef ESP32
    // ESP32 บันทึกลง Preferences
    preferences.putString("deviceName", config.deviceName);
    
  #elif defined(ESP8266)
    // ESP8266 บันทึกลง EEPROM
    int addr = 0;
    EEPROM.put(addr, config.deviceName);
    EEPROM.commit();
  #endif
  
  Serial.println("✅ บันทึก Config สำเร็จ!");
}

// ===== ฟังก์ชันเชื่อมต่อ WiFi (Fixed) =====
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
  #ifdef ESP32
    preferences.clear();
  #elif defined(ESP8266)
    // ลบ EEPROM ทั้งหมด
    for (int i = 0; i < EEPROM_SIZE; i++) {
      EEPROM.write(i, 0xFF);
    }
    EEPROM.commit();
  #endif
  
  Serial.println("✅ ลบ Config ทั้งหมดสำเร็จ!");
}

// ===== ฟังก์ชันดึง Config =====
ConfigData* Config_get() {
  return &config;
}

#endif
