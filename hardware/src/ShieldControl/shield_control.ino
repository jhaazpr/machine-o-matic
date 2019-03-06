#include "AccelStepper.h"
#include "MultiStepper.h"
#include "jsmn.h"

// Assumes all steppers are configured identically with the following settings:
// 0.9 Degree Steppers
//   8x Microstepping Factor
//   Max travel of +/- 90 degrees
// Total steps count is +/- 800 steps with the above settings.

#define XSTEP 2
#define XDIR 5
#define YSTEP 3
#define YDIR 6
#define ZSTEP 4
#define ZDIR 7

AccelStepper xMotor(AccelStepper::DRIVER, XSTEP, XDIR);
AccelStepper yMotor(AccelStepper::DRIVER, YSTEP, YDIR);

MultiStepper steppers;

char receive_buffer[255];
byte receive_buffer_idx = 0;
size_t bytes_to_read = 0;
size_t num_bytes_read = 0;

jsmn_parser parser;
byte num_tok = 10;
byte num_tok_used = 0;
jsmntok_t tokens[10];

byte pgm_read_byte = 0;

void setup()
{
    Serial.begin(9600);
    pinMode(8, OUTPUT); // Disable pin.
    digitalWrite(8, LOW);

    jsmn_init(&parser);

    xMotor.setMaxSpeed(400.0);
    xMotor.setAcceleration(200.0);

    yMotor.setMaxSpeed(400.0);
    yMotor.setAcceleration(200.0);

    steppers.addStepper(xMotor);
    steppers.addStepper(yMotor);

//    yMotor.moveTo(1200);
//    yMotor.run();

    long coords[2];

    // coords[0] = -400;
    // coords[1] = 400;
    // steppers.moveTo(coords);
    // steppers.runSpeedToPosition(); // Blocks until all are in position
    // delay(1000);

}

void loop()
{
    while (Serial.available()) {
        pgm_read_byte = Serial.read();
        receive_buffer[receive_buffer_idx++] = pgm_read_byte;
        Serial.println(receive_buffer);
        if (pgm_read_byte == '}') {
            num_tok_used = jsmn_parse(&parser, receive_buffer, receive_buffer_idx + 1,
                        tokens, num_tok);
            Serial.println("Parsed!");
            // Serial.println(num_tok_used);
            for (int i = 0; i < num_tok_used - 1; i++) {
                jsmntok_t curr_tok = tokens[i];
                Serial.println(curr_tok.type);
                for (int j = curr_tok.start; j < curr_tok.end; j++) {
                    Serial.print(receive_buffer[j]);
                }
                Serial.println();
            }
            memset(receive_buffer, 0, sizeof receive_buffer);
            receive_buffer_idx = 0;
        }
    }
}
