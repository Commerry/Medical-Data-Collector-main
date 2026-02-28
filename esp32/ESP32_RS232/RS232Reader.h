/**
 * RS232Reader.h
 * อ่านข้อมูลจาก RS232 (Text format) แล้วแปลงเป็น JSON
 * รองรับทั้ง ESP32 และ ESP8266
 * 
 * =============================================================================
 * รูปแบบข้อมูลที่รองรับ (จากอุปกรณ์วัดสุขภาพ):
 * =============================================================================
 *   W:070.3 H:173.5      → น้ำหนัก 70.3 kg, ส่วนสูง 173.5 cm
 *   T365$                 → อุณหภูมิ 36.5°C (3 หลัก ÷ 10)
 *   {... JSON ...}        → JSON format (รองรับเดิม)
 * =============================================================================
 */

#ifndef RS232_READER_H
#define RS232_READER_H

#include <Arduino.h>
#include <ArduinoJson.h>

#ifdef ESP8266
  #include <SoftwareSerial.h>
#endif

#include "Config.h"

// ===== Pin Configuration =====
#ifdef ESP32
  // ใช้ค่าจาก Config.h
  #define RX2_PIN RS232_RX_PIN
  #define TX2_PIN RS232_TX_PIN
#elif defined(ESP8266)
  // ใช้ค่าจาก Config.h
  #define RX2_PIN RS232_RX_PIN
  #define TX2_PIN RS232_TX_PIN
  SoftwareSerial rs232Serial(RX2_PIN, TX2_PIN);
#endif

// ===== Variables =====
String rs232Buffer = "";
String rs232Line = "";
unsigned long lastDataTime = 0;
unsigned long lastParseTime = 0;
unsigned long firstWeightHeightTime = 0;  // เวลาที่ได้รับ weight/height ครั้งแรก
int rs232ByteCount = 0;

// ===== ข้อมูลที่ parse ได้ (สะสมจากหลายบรรทัด) =====
float parsedWeight = 0;
float parsedHeight = 0;
float parsedTemp = 0;
float parsedBpSystolic = 0;   // ความดันบน
float parsedBpDiastolic = 0;  // ความดันล่าง
int parsedPulse = 0;
bool hasWeight = false;
bool hasHeight = false;
bool hasTemp = false;
bool hasBpSystolic = false;
bool hasBpDiastolic = false;
bool hasPulse = false;

// ===== Timeout Configuration (อ่านจาก Config.h) =====
// รอให้ครบข้อมูล หรือ timeout ก่อนส่ง
// สามารถปรับค่าได้ที่ Config.h → RS232_WAIT_COMPLETE_TIMEOUT

// ===== Callback Function =====
void (*onDataReceived)(String jsonData) = nullptr;

// ===== Forward Declarations =====
void RS232_sendParsedData();
void RS232_resetParsed();

// ===== ฟังก์ชันเริ่มต้น =====
void RS232_begin() {
  // ใช้ค่าจาก Config.h
  long baudRate = RS232_BAUD_RATE;
  
  #ifdef ESP32
    Serial2.begin(baudRate, RS232_SERIAL_FORMAT, RX2_PIN, TX2_PIN);
    Serial.printf("📡 RS232 (ESP32): GPIO%d/%d @ %ld baud (8N1)\n", RX2_PIN, TX2_PIN, baudRate);
  #elif defined(ESP8266)
    rs232Serial.begin(baudRate);
    Serial.printf("📡 RS232 (ESP8266): D7/D8 (GPIO%d/%d) @ %ld baud\n", RX2_PIN, TX2_PIN, baudRate);
  #endif
  
  lastDataTime = millis();
}

// ===== ตั้งค่า Callback =====
void RS232_setCallback(void (*callback)(String)) {
  onDataReceived = callback;
}

// ===== Reset ค่าที่ parse ได้ =====
void RS232_resetParsed() {
  parsedWeight = 0;
  parsedHeight = 0;
  parsedTemp = 0;
  parsedBpSystolic = 0;
  parsedBpDiastolic = 0;
  parsedPulse = 0;
  hasWeight = false;
  hasHeight = false;
  hasTemp = false;
  hasBpSystolic = false;
  hasBpDiastolic = false;
  hasPulse = false;
  firstWeightHeightTime = 0;
}

// ===== Parse บรรทัด Text =====
void RS232_parseLine(String line) {
  line.trim();
  if (line.length() == 0) return;
  
  Serial.println("📥 RS232 Raw: " + line);
  
  // --- Parse W:xxx.x (น้ำหนัก) ---
  int wIdx = line.indexOf("W:");
  if (wIdx >= 0) {
    String wStr = "";
    for (int i = wIdx + 2; i < (int)line.length(); i++) {
      char c = line[i];
      if (c == ' ' || c == '\t') break;  // จบที่ space
      if ((c >= '0' && c <= '9') || c == '.') {
        wStr += c;
      }
    }
    if (wStr.length() > 0) {
      parsedWeight = wStr.toFloat();
      hasWeight = true;
      Serial.printf("   ⚖️  น้ำหนัก: %.1f kg\n", parsedWeight);
      
      // เริ่มนับเวลารอข้อมูลครบ (ถ้ายังไม่เริ่ม)
      if (firstWeightHeightTime == 0) {
        firstWeightHeightTime = millis();
        Serial.println("   ⏱️  รอข้อมูลครบ...");
      }
    }
  }
  
  // --- Parse H:xxx.x (ส่วนสูง) ---
  int hIdx = line.indexOf("H:");
  if (hIdx >= 0) {
    String hStr = "";
    for (int i = hIdx + 2; i < (int)line.length(); i++) {
      char c = line[i];
      if (c == ' ' || c == '\t') break;
      if ((c >= '0' && c <= '9') || c == '.') {
        hStr += c;
      }
    }
    if (hStr.length() > 0) {
      parsedHeight = hStr.toFloat();
      hasHeight = true;
      Serial.printf("   📏 ส่วนสูง: %.1f cm\n", parsedHeight);
      
      // เริ่มนับเวลารอข้อมูลครบ (ถ้ายังไม่เริ่ม)
      if (firstWeightHeightTime == 0) {
        firstWeightHeightTime = millis();
        Serial.println("   ⏱️  รอข้อมูลครบ...");
      }
    }
  }
  
  // --- Parse BP:xxx/yyy (ความดันโลหิต systolic/diastolic) ---
  int bpIdx = line.indexOf("BP:");
  if (bpIdx >= 0) {
    String bpStr = "";
    for (int i = bpIdx + 3; i < (int)line.length(); i++) {
      char c = line[i];
      if (c == ' ' || c == '\t') break;
      if ((c >= '0' && c <= '9') || c == '/' || c == '.') {
        bpStr += c;
      }
    }
    if (bpStr.length() > 0) {
      // ตรวจจับรูปแบบ "120/80"
      int slashIdx = bpStr.indexOf('/');
      if (slashIdx > 0) {
        parsedBpSystolic = bpStr.substring(0, slashIdx).toFloat();
        parsedBpDiastolic = bpStr.substring(slashIdx + 1).toFloat();
        hasBpSystolic = true;
        hasBpDiastolic = true;
        Serial.printf("   💉 ความดันโลหิต: %.0f/%.0f mmHg\n", parsedBpSystolic, parsedBpDiastolic);
      } else {
        // ถ้าไม่มี / ถือว่าเป็น systolic
        parsedBpSystolic = bpStr.toFloat();
        hasBpSystolic = true;
        Serial.printf("   💉 ความดันบน: %.0f mmHg\n", parsedBpSystolic);
      }
      
      if (firstWeightHeightTime == 0) {
        firstWeightHeightTime = millis();
        Serial.println("   ⏱️  รอข้อมูลครบ...");
      }
    }
  }
  
  // --- Parse BP2:xxx (ความดันล่าง ถ้าส่งแยก) ---
  int bp2Idx = line.indexOf("BP2:");
  if (bp2Idx >= 0) {
    String bp2Str = "";
    for (int i = bp2Idx + 4; i < (int)line.length(); i++) {
      char c = line[i];
      if (c == ' ' || c == '\t') break;
      if ((c >= '0' && c <= '9') || c == '.') {
        bp2Str += c;
      }
    }
    if (bp2Str.length() > 0) {
      parsedBpDiastolic = bp2Str.toFloat();
      hasBpDiastolic = true;
      Serial.printf("   💉 ความดันล่าง: %.0f mmHg\n", parsedBpDiastolic);
    }
  }
  
  // --- Parse PULSE:xxx หรือ P:xxx (ชีพจร) ---
  int pulseIdx = line.indexOf("PULSE:");
  if (pulseIdx < 0) {
    pulseIdx = line.indexOf("P:");
  }
  if (pulseIdx >= 0) {
    int startIdx = (line[pulseIdx + 1] == ':') ? pulseIdx + 2 : pulseIdx + 6;
    String pulseStr = "";
    for (int i = startIdx; i < (int)line.length(); i++) {
      char c = line[i];
      if (c == ' ' || c == '\t') break;
      if (c >= '0' && c <= '9') {
        pulseStr += c;
      }
    }
    if (pulseStr.length() > 0) {
      parsedPulse = pulseStr.toInt();
      hasPulse = true;
      Serial.printf("   💓 ชีพจร: %d bpm\n", parsedPulse);
      
      if (firstWeightHeightTime == 0) {
        firstWeightHeightTime = millis();
        Serial.println("   ⏱️  รอข้อมูลครบ...");
      }
    }
  }
  
  // --- Parse Txxx$ (อุณหภูมิ, เช่น T365$ = 36.5°C) ---
  int tIdx = line.indexOf("T");
  while (tIdx >= 0) {
    int dollarIdx = line.indexOf("$", tIdx + 1);
    if (dollarIdx > tIdx + 1) {
      String tStr = line.substring(tIdx + 1, dollarIdx);
      // ตรวจสอบว่าเป็นตัวเลขทั้งหมด
      bool allDigits = true;
      for (int i = 0; i < (int)tStr.length(); i++) {
        if (tStr[i] < '0' || tStr[i] > '9') { allDigits = false; break; }
      }
      if (allDigits && tStr.length() >= 2) {
        parsedTemp = tStr.toFloat() / 10.0;
        hasTemp = true;
        Serial.printf("   🌡️  อุณหภูมิ: %.1f °C\n", parsedTemp);
        
        // ถ้ามีข้อมูลอื่นแล้ว → ส่งรวมกัน
        if (hasWeight || hasHeight || hasBpSystolic || hasPulse) {
          Serial.println("   ✅ ได้อุณหภูมิแล้ว → ส่งข้อมูลครบทันที");
          RS232_sendParsedData();
        } else {
          // ถ้าไม่มีข้อมูลอื่น → ส่ง temp เดี่ยวออกไป (ไม่ให้ค้าง)
          Serial.println("   ⚠️  มีแค่อุณหภูมิ → ส่งแยกทันที");
          
          StaticJsonDocument<256> doc;
          doc["temp"] = parsedTemp;
          String jsonStr;
          serializeJson(doc, jsonStr);
          
          Serial.println("\n📦 สร้าง JSON (อุณหภูมิเท่านั้น):");
          serializeJsonPretty(doc, Serial);
          Serial.println();
          
          if (onDataReceived != nullptr) {
            onDataReceived(jsonStr);
          }
          
          // Reset temp (ไม่ให้ค้างไปยุ่งกับคนถัดไป)
          parsedTemp = 0;
          hasTemp = false;
        }
        break;  // ใช้ค่าแรกที่เจอ
      }
    }
    tIdx = line.indexOf("T", tIdx + 1);
  }
  
  lastParseTime = millis();
}

// ===== สร้าง JSON จากข้อมูลที่ parse ได้ =====
void RS232_sendParsedData() {
  if (!hasWeight && !hasHeight && !hasTemp && !hasBpSystolic && !hasBpDiastolic && !hasPulse) return;
  
  StaticJsonDocument<512> doc;
  
  // เพิ่ม field ทั้งหมดที่มี
  if (hasWeight) doc["weight"] = parsedWeight;
  if (hasHeight) doc["height"] = parsedHeight;
  if (hasTemp)   doc["temp"] = parsedTemp;
  if (hasBpSystolic) doc["bp"] = parsedBpSystolic;
  if (hasBpDiastolic) doc["bp2"] = parsedBpDiastolic;
  if (hasPulse)  doc["pulse"] = parsedPulse;
  
  String jsonStr;
  serializeJson(doc, jsonStr);
  
  Serial.println("\n📦 สร้าง JSON จาก RS232:");
  serializeJsonPretty(doc, Serial);
  Serial.println();
  
  if (onDataReceived != nullptr) {
    onDataReceived(jsonStr);
  }
  
  RS232_resetParsed();
}

// ===== อ่านข้อมูล =====
void RS232_loop() {
  bool hasNewData = false;
  
  #ifdef ESP32
    while (Serial2.available()) {
      char c = Serial2.read();
  #elif defined(ESP8266)
    while (rs232Serial.available()) {
      char c = rs232Serial.read();
  #endif
      rs232ByteCount++;
      lastDataTime = millis();
      hasNewData = true;
      
      // === ตรวจจับ JSON (รองรับ format เดิม) ===
      if (c == '{') {
        rs232Buffer = "{";  // เริ่ม JSON ใหม่
        continue;
      }
      
      if (rs232Buffer.length() > 0 && rs232Buffer[0] == '{') {
        rs232Buffer += c;
        if (c == '}') {
          // ลองดูว่าเป็น JSON ที่สมบูรณ์
          int braceCount = 0;
          for (int i = 0; i < (int)rs232Buffer.length(); i++) {
            if (rs232Buffer[i] == '{') braceCount++;
            else if (rs232Buffer[i] == '}') braceCount--;
          }
          if (braceCount == 0) {
            Serial.println("\n📦 รับ JSON:");
            Serial.println(rs232Buffer);
            if (onDataReceived != nullptr) {
              onDataReceived(rs232Buffer);
            }
            rs232Buffer = "";
          }
        }
        if (rs232Buffer.length() > 4096) rs232Buffer = "";
        continue;
      }
      
      // === ตรวจจับ Text format (อ่านทีละบรรทัด) ===
      if (c == '\n' || c == '\r') {
        if (rs232Line.length() > 0) {
          RS232_parseLine(rs232Line);
          rs232Line = "";
        }
      } else {
        rs232Line += c;
        // ป้องกัน buffer overflow
        if (rs232Line.length() > 512) {
          rs232Line = "";
        }
      }
    }  // ปิด while loop
  
  // ===== ตรวจสอบว่าได้ข้อมูลครบหรือยัง =====
  // ถ้ามีข้อมูลอะไรก็ตาม ให้รอ timeout ครบก่อนส่ง (ไม่รอ temp อีกต่อไปเพราะส่งทันทีแล้วใน parseLine)
  if ((hasWeight || hasHeight || hasBpSystolic || hasPulse) && firstWeightHeightTime > 0) {
    unsigned long elapsed = millis() - firstWeightHeightTime;
    
    // ครบ timeout แล้ว ยังไม่ครบข้อมูล → ส่งที่มีไปเลย
    if (elapsed >= RS232_WAIT_COMPLETE_TIMEOUT) {
      Serial.printf("   ⏱️  ครบ %d วินาทีแล้ว → ส่งข้อมูลที่มีไปเลย\n", RS232_WAIT_COMPLETE_TIMEOUT / 1000);
      RS232_sendParsedData();
    }
  }
}

// ===== ดึงสถิติ =====
int RS232_getByteCount() {
  return rs232ByteCount;
}

unsigned long RS232_getLastDataTime() {
  return lastDataTime;
}

#endif
