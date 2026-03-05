#define RX_PIN 16 // ขา RX ของ ESP32
#define TX_PIN 17 // ขา TX ของ ESP32

void setup() {
Serial.begin(115200); // สำหรับ debug ผ่าน USB
Serial2.begin(115200, SERIAL_8N1, RX_PIN, TX_PIN); // UART2 สำหรับ RS232
}

void loop() {
if (Serial2.available()) {
char c = Serial2.read();
Serial.print(c); // แสดงผลที่ Serial Monitor
}
}