/**
 * ========================================
 *  ESP8266 Weight Scale Simulator
 * ========================================
 * 
 * จำลองเครื่องชั่งน้ำหนัก-ส่วนสูง แบบ RS232
 * ส่งข้อมูลในรูปแบบเดียวกับเครื่องจริง
 * 
 * Hardware:
 *   - ESP8266 NodeMCU / WeMos D1 Mini (Simulator)
 *   - เชื่อมต่อกับ ESP8266 RS232 Reader อีกตัว
 * 
 * Connections:
 *   ESP8266 Simulator TX (D4/GPIO2) → ESP8266 Reader RX (D7/GPIO13)
 *   ESP8266 Simulator GND → ESP8266 Reader GND
 * 
 * Data Format (เหมือนเครื่องจริง):
 *   - W:070.3 H:173.5   (น้ำหนัก + ส่วนสูง)
 *   - T365$             (อุณหภูมิ 36.5°C - Optional)
 * 
 * โหมดการทำงาน:
 *   1. Auto Mode: ส่งข้อมูลอัตโนมัติทุก 5 วินาที
 *   2. Button Mode: กดปุ่ม D3 (GPIO0/FLASH) เพื่อส่งข้อมูล
 *   3. Serial Command: พิมพ์ "send" ใน Serial Monitor
 */

#include <SoftwareSerial.h>

// ===== Pin Configuration =====
#define TX_PIN D8          // D4 (GPIO2) - ต่อกับ ESP8266 Reader RX (D7)
#define RX_PIN D7
          // D5 (GPIO14) - ไม่ได้ใช้ แต่ต้องกำหนด
#define LED_PIN D0         // D0 (GPIO16) - Built-in LED บน D1 Mini / NodeMCU LED
#define BUTTON_PIN D3      // D3 (GPIO0) - FLASH button

// ===== Serial Configuration =====
#define RS232_BAUD 9600    // Baud rate เดียวกับเครื่องจริง

// ===== Mode Configuration =====
#define AUTO_SEND_ENABLED true   // true = ส่งอัตโนมัติ, false = กดปุ่มเท่านั้น
#define AUTO_SEND_INTERVAL 5000  // ส่งทุก 5 วินาที (ในโหมด Auto)
#define SEND_TEMP false          // true = ส่งอุณหภูมิด้วย, false = ส่งแค่ W+H

// ===== Data Ranges (สำหรับสุ่มค่า) =====
#define WEIGHT_MIN 40.0f
#define WEIGHT_MAX 120.0f
#define HEIGHT_MIN 140.0f
#define HEIGHT_MAX 190.0f
#define TEMP_MIN 35.5f
#define TEMP_MAX 37.5f

// ===== SoftwareSerial for RS232 Output =====
SoftwareSerial rs232Serial(RX_PIN, TX_PIN); // RX, TX

// ===== Variables =====
unsigned long lastSendTime = 0;
unsigned long lastButtonPress = 0;
bool lastButtonState = HIGH;
int sendCount = 0;

// ===== Functions =====
float randomFloat(float min, float max) {
  return min + (random(0, 10000) / 10000.0f) * (max - min);
}

void sendWeightData() {
  // สุ่มค่า
  float weight = randomFloat(WEIGHT_MIN, WEIGHT_MAX);
  float height = randomFloat(HEIGHT_MIN, HEIGHT_MAX);
  float temp = randomFloat(TEMP_MIN, TEMP_MAX);
  
  sendCount++;
  
  Serial.println("\n========================================");
  Serial.printf("📤 Sending Data #%d\n", sendCount);
  Serial.println("========================================");
  
  // ส่งน้ำหนัก + ส่วนสูง (รูปแบบเดียวกับเครื่องจริง)
  String dataLine = String("W:") + String(weight, 1) + " H:" + String(height, 1);
  
  Serial.printf("⚖️  Weight: %.1f kg\n", weight);
  Serial.printf("📏 Height: %.1f cm\n", height);
  
  if (SEND_TEMP) {
    String tempLine = String("T") + String((int)(temp * 10)) + "$";
    Serial.printf("🌡️  Temp: %.1f °C\n", temp);
    
    // ส่งทั้ง 2 บรรทัด
    rs232Serial.println(dataLine);
    delay(50);  // รอให้ส่งเสร็จ
    rs232Serial.println(tempLine);
    
    Serial.println("\n📡 RS232 Sent:");
    Serial.println("   " + dataLine);
    Serial.println("   " + tempLine);
  } else {
    // ส่งแค่ W + H
    rs232Serial.println(dataLine);
    
    Serial.println("\n📡 RS232 Sent:");
    Serial.println("   " + dataLine);
  }
  
  Serial.println("========================================\n");
  
  // กระพริบ LED
  digitalWrite(LED_PIN, LOW);   // LOW = ON สำหรับ ESP8266
  delay(100);
  digitalWrite(LED_PIN, HIGH);  // HIGH = OFF
}

void setup() {
  Serial.begin(115200);
  delay(100);
  
  Serial.println("\n\n");
  Serial.println("================================");
  Serial.println(" ESP8266 Weight Scale Simulator ");
  Serial.println("================================");
  
  // Setup RS232 Serial (SoftwareSerial)
  rs232Serial.begin(RS232_BAUD);
  Serial.printf("✅ SoftwareSerial TX: D4 (GPIO2) @ %d baud\n", RS232_BAUD);
  
  // Setup LED
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, HIGH);  // OFF
  Serial.printf("✅ LED: D0 (GPIO16)\n");
  
  // Setup Button
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  Serial.printf("✅ Button: D3 (GPIO0 - FLASH Button)\n");
  
  Serial.println("\n📋 Configuration:");
  Serial.printf("   • Board: ESP8266\n");
  Serial.printf("   • Auto Send: %s\n", AUTO_SEND_ENABLED ? "ENABLED" : "DISABLED");
  if (AUTO_SEND_ENABLED) {
    Serial.printf("   • Interval: %d ms (%.1f sec)\n", AUTO_SEND_INTERVAL, AUTO_SEND_INTERVAL/1000.0);
  }
  Serial.printf("   • Send Temp: %s\n", SEND_TEMP ? "YES" : "NO");
  Serial.printf("   • Weight: %.1f - %.1f kg\n", WEIGHT_MIN, WEIGHT_MAX);
  Serial.printf("   • Height: %.1f - %.1f cm\n", HEIGHT_MIN, HEIGHT_MAX);
  
  Serial.println("\n📡 Data Format (เหมือนเครื่องจริง):");
  Serial.println("   W:070.3 H:173.5");
  if (SEND_TEMP) {
    Serial.println("   T365$");
  }
  
  Serial.println("\n🎮 Controls:");
  Serial.println("   • Press FLASH button (D3) to send data");
  Serial.println("   • Type 'send' in Serial Monitor");
  if (AUTO_SEND_ENABLED) {
    Serial.printf("   • Auto send every %.1f seconds\n", AUTO_SEND_INTERVAL/1000.0);
  }
  
  Serial.println("\n🔌 Wiring:");
  Serial.println("   Simulator TX (D4/GPIO2) → Reader RX (D7/GPIO13)");
  Serial.println("   Simulator GND → Reader GND");
  
  Serial.println("\n⚠️  Note:");
  Serial.println("   • ใช้ ESP8266 2 ตัว (Simulator + Reader)");
  Serial.println("   • ต่อ TX→RX ข้ามกัน");
  Serial.println("   • ใช้ USB แยกกันคนละตัว");
  
  Serial.println("\n================================");
  Serial.println("✅ Simulator Ready!");
  Serial.println("================================\n");
  
  // กระพริบ LED 3 ครั้ง
  for (int i = 0; i < 3; i++) {
    digitalWrite(LED_PIN, LOW);   // ON
    delay(100);
    digitalWrite(LED_PIN, HIGH);  // OFF
    delay(100);
  }
  
  randomSeed(analogRead(A0));
  lastSendTime = millis();
}

void loop() {
  unsigned long currentTime = millis();
  
  // ===== Auto Send Mode =====
  if (AUTO_SEND_ENABLED && (currentTime - lastSendTime >= AUTO_SEND_INTERVAL)) {
    sendWeightData();
    lastSendTime = currentTime;
  }
  
  // ===== Button Mode =====
  bool buttonState = digitalRead(BUTTON_PIN);
  if (buttonState == LOW && lastButtonState == HIGH) {
    // Debounce
    if (currentTime - lastButtonPress > 300) {
      Serial.println("\n🔘 Button Pressed!");
      sendWeightData();
      lastButtonPress = currentTime;
      lastSendTime = currentTime;  // Reset auto send timer
    }
  }
  lastButtonState = buttonState;
  
  // ===== Serial Command Mode =====
  if (Serial.available() > 0) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    cmd.toLowerCase();
    
    if (cmd == "send" || cmd == "s") {
      Serial.println("\n💬 Command: SEND");
      sendWeightData();
      lastSendTime = currentTime;
    }
    else if (cmd == "help" || cmd == "h" || cmd == "?") {
      Serial.println("\n📖 Commands:");
      Serial.println("   send / s  - Send weight data");
      Serial.println("   help / h  - Show this help");
      Serial.println("   info / i  - Show configuration");
    }
    else if (cmd == "info" || cmd == "i") {
      Serial.println("\n📊 Current Configuration:");
      Serial.printf("   • Board: ESP8266\n");
      Serial.printf("   • Auto Send: %s\n", AUTO_SEND_ENABLED ? "ENABLED" : "DISABLED");
      Serial.printf("   • Interval: %.1f sec\n", AUTO_SEND_INTERVAL/1000.0);
      Serial.printf("   • Send Count: %d\n", sendCount);
      Serial.printf("   • TX Pin: D4 (GPIO2)\n");
      Serial.printf("   • Baud Rate: %d\n", RS232_BAUD);
    }
    else if (cmd.length() > 0) {
      Serial.println("❌ Unknown command. Type 'help' for commands.");
    }
  }
  
  // Yield to prevent WDT reset
  yield();
  delay(10);
}
