/**
 * RS232Reader_Weight.h
 * สำหรับเครื่องชั่ง/ส่วนสูง (Weight Scale & Height Meter)
 * 
 * ⚠️ ใช้เฉพาะ ESP8266 เท่านั้น!
 * เหตุผล: ข้อมูล Text < 64 bytes ใช้ SoftwareSerial ได้
 * 
 * Baud: 9600, Pin: D7(RX), D8(TX)
 * รูปแบบข้อมูล: Text
 *   - W:070.3 H:173.5
 *   - T365$ (อุณหภูมิ 36.5°C)
 */

#ifndef RS232_READER_WEIGHT_H
#define RS232_READER_WEIGHT_H

#include <Arduino.h>
#include <ArduinoJson.h>

// ===== ESP8266 เท่านั้น =====
#ifdef ESP8266
  #include <SoftwareSerial.h>
  #define RS232_RX_PIN D7  // GPIO13 (RX)
  #define RS232_TX_PIN D8  // GPIO15 (TX)
  SoftwareSerial rs232Serial(RS232_RX_PIN, RS232_TX_PIN);
#else
  #error "RS232Reader_Weight.h รองรับเฉพาะ ESP8266! สำหรับ ESP32 ให้ใช้ RS232Reader_BP.h"
#endif

// ===== Configuration =====
#define RS232_BAUD_RATE 9600  // เครื่องชั่ง
#define RS232_WAIT_COMPLETE_TIMEOUT 3000  // รอข้อมูลครบ 3 วินาที (ลดจาก 5 วินาที)

// ===== Variables =====
char rs232Buffer[2048];  // ใช้ char array แทน String (เร็วกว่า)
int rs232BufferLen = 0;
unsigned long lastDataTime = 0;
unsigned long firstDataTime = 0;
int rs232ByteCount = 0;
int rs232ValidLineCount = 0;

// ===== Parsed Data =====
float parsedWeight = 0;
float parsedHeight = 0;
float parsedTemp = 0;
bool hasWeight = false;
bool hasHeight = false;
bool hasTemp = false;

// ===== Callback =====
void (*onDataReceived)(String jsonData) = nullptr;

// ===== Forward Declarations =====
void RS232_sendParsedData();
void RS232_resetParsed();

// ===== ฟังก์ชันเริ่มต้น =====
void RS232_begin() {
  // ESP8266 ใช้ SoftwareSerial
  rs232Serial.begin(RS232_BAUD_RATE);
  
  // ตั้งค่า timeout สำหรับ readBytesUntil (5 วินาที)
  rs232Serial.setTimeout(5000);
  
  Serial.printf("\n📡 RS232 (Weight Scale): D7/D8 @ %ld baud\n", RS232_BAUD_RATE);
  Serial.println("   ✅ Serial Format: 8N1");
  Serial.println("   ✅ Timeout: 5000 ms");
  Serial.println("   ✅ RS232 พร้อมรับข้อมูล!");
  
  Serial.println("\n🔧 โหมด: readBytesUntil() - อ่านทีเดียวจนเจอ newline");
  Serial.println("   - เร็วและแม่นยำที่สุด");
  Serial.println("   - แสดงข้อมูลครบถ้วน");
  Serial.println("   - Parse อัตโนมัติ");
  Serial.println("===============================================================================\n");
  
  lastDataTime = millis();
}

// ===== ตั้งค่า Callback =====
void RS232_setCallback(void (*callback)(String)) {
  onDataReceived = callback;
}

// ===== Reset ค่า =====
void RS232_resetParsed() {
  parsedWeight = 0;
  parsedHeight = 0;
  parsedTemp = 0;
  hasWeight = false;
  hasHeight = false;
  hasTemp = false;
  firstDataTime = 0;
}

// ===== Parse Text =====
void RS232_parseLine(String line) {
  line.trim();
  if (line.length() == 0) return;
  
  Serial.println("📥 RS232 Line: " + line);
  
  // Parse W:xxx.x
  int wIdx = line.indexOf("W:");
  if (wIdx >= 0) {
    String wStr = "";
    for (int i = wIdx + 2; i < (int)line.length(); i++) {
      char c = line[i];
      if (c == ' ' || c == '\t') break;
      if ((c >= '0' && c <= '9') || c == '.') wStr += c;
    }
    if (wStr.length() > 0) {
      parsedWeight = wStr.toFloat();
      hasWeight = true;
      Serial.printf("   ⚖️  น้ำหนัก: %.1f kg\n", parsedWeight);
      if (firstDataTime == 0) firstDataTime = millis();
      
      // ✅ ถ้าได้ทั้ง Weight และ Height แล้ว → ส่งทันที
      if (hasHeight) {
        Serial.println("   ✅ ได้ข้อมูลครบ (Weight + Height) → ส่งทันที");
        RS232_sendParsedData();
        return;
      }
    }
  }
  
  // Parse H:xxx.x
  int hIdx = line.indexOf("H:");
  if (hIdx >= 0) {
    String hStr = "";
    for (int i = hIdx + 2; i < (int)line.length(); i++) {
      char c = line[i];
      if (c == ' ' || c == '\t') break;
      if ((c >= '0' && c <= '9') || c == '.') hStr += c;
    }
    if (hStr.length() > 0) {
      parsedHeight = hStr.toFloat();
      hasHeight = true;
      Serial.printf("   📏 ส่วนสูง: %.1f cm\n", parsedHeight);
      if (firstDataTime == 0) firstDataTime = millis();
      
      // ✅ ถ้าได้ทั้ง Weight และ Height แล้ว → ส่งทันที
      if (hasWeight) {
        Serial.println("   ✅ ได้ข้อมูลครบ (Weight + Height) → ส่งทันที");
        RS232_sendParsedData();
        return;
      }
    }
  }
  
  // Parse Txxx$ (อุณหภูมิ)
  int tIdx = line.indexOf("T");
  while (tIdx >= 0) {
    int dollarIdx = line.indexOf("$", tIdx + 1);
    if (dollarIdx > tIdx + 1) {
      String tStr = line.substring(tIdx + 1, dollarIdx);
      bool allDigits = true;
      for (int i = 0; i < (int)tStr.length(); i++) {
        if (tStr[i] < '0' || tStr[i] > '9') { allDigits = false; break; }
      }
      if (allDigits && tStr.length() >= 2) {
        parsedTemp = tStr.toFloat() / 10.0;
        hasTemp = true;
        Serial.printf("   🌡️  อุณหภูมิ: %.1f °C\n", parsedTemp);
        
        // ✅ ถ้ามี Weight/Height แล้ว → ส่งรวมกัน
        if (hasWeight || hasHeight) {
          Serial.println("   ✅ ได้ข้อมูลครบ (พร้อม Temp) → ส่งทันที");
          RS232_sendParsedData();
        } else {
          // ส่ง temp เดี่ยว (ถ้าไม่มี Weight/Height)
          StaticJsonDocument<256> doc;
          doc["temp"] = parsedTemp;
          String jsonStr;
          serializeJson(doc, jsonStr);
          if (onDataReceived != nullptr) {
            onDataReceived(jsonStr);
          }
          parsedTemp = 0;
          hasTemp = false;
        }
        break;
      }
    }
    tIdx = line.indexOf("T", tIdx + 1);
  }
}

// ===== สร้าง JSON =====
void RS232_sendParsedData() {
  if (!hasWeight && !hasHeight && !hasTemp) return;
  
  StaticJsonDocument<512> doc;
  
  if (hasWeight) doc["weight"] = parsedWeight;
  if (hasHeight) doc["height"] = parsedHeight;
  if (hasTemp) doc["temp"] = parsedTemp;
  
  String jsonStr;
  serializeJson(doc, jsonStr);
  
  Serial.println("\n📦 สร้าง JSON:");
  serializeJsonPretty(doc, Serial);
  Serial.println();
  
  if (onDataReceived != nullptr) {
    onDataReceived(jsonStr);
  }
  
  RS232_resetParsed();
}

// ===== อ่านข้อมูล (ใช้ readBytesUntil - เร็วและแม่นยำที่สุด) =====
void RS232_loop() {
  // ตรวจสอบว่ามีข้อมูลหรือไม่
  if (rs232Serial.available() > 0) {
    // แสด��ข้อความแรกเมื่อเริ่มรับ
    static bool firstData = true;
    if (firstData) {
      Serial.println("\n🎉 เริ่มรับข้อมูล RS232!");
      Serial.println("================================================================================");
      firstData = false;
    }
    
    // อ่านจนเจอ newline (\n) - วิธีนี้เร็วและไม่พลาด
    size_t bytesRead = rs232Serial.readBytesUntil('\n', rs232Buffer, sizeof(rs232Buffer) - 1);
    
    if (bytesRead > 0) {
      // เพิ่ม null terminator
      rs232Buffer[bytesRead] = '\0';
      
      // นับ bytes
      rs232ByteCount += bytesRead;
      lastDataTime = millis();
      
      // แสดงข้อมูลที่อ่านได้
      Serial.println(rs232Buffer);
      Serial.println("================================================================================");
      Serial.printf("📊 รับข้อมูล: %d bytes (Total: %d bytes)\n\n", bytesRead, rs232ByteCount);
      
      // Parse ข้อมูล
      String dataStr = String(rs232Buffer);
      rs232ValidLineCount++;
      RS232_parseLine(dataStr);
      
      Serial.println("================================================================================\n");
    }
  }
  
  // Timeout - ส่งข้อมูลที่มี (แม้มีแค่ Weight หรือ Height เดียว)
  if ((hasWeight || hasHeight) && firstDataTime > 0) {
    if (millis() - firstDataTime >= RS232_WAIT_COMPLETE_TIMEOUT) {
      Serial.println("   ⏱️  Timeout (3 วินาที) → ส่งข้อมูลที่มี");
      if (hasWeight && !hasHeight) {
        Serial.println("   ⚠️  มีแค่ Weight (ไม่มี Height)");
      } else if (!hasWeight && hasHeight) {
        Serial.println("   ⚠️  มีแค่ Height (ไม่มี Weight)");
      }
      RS232_sendParsedData();
    }
  }
}

// ===== สถิติ =====
int RS232_getByteCount() {
  return rs232ByteCount;
}

int RS232_getValidLineCount() {
  return rs232ValidLineCount;
}

unsigned long RS232_getLastDataTime() {
  return lastDataTime;
}

long RS232_getCurrentBaudRate() {
  return RS232_BAUD_RATE;
}

bool RS232_isBaudRateLocked() {
  return true;
}

int RS232_getValidDataCount() {
  return rs232ValidLineCount;
}

#endif
