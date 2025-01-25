#!/bin/sh
cd /work

error() {
  echo "STATUS|error"
  exit 1
}

trap 'error' ERR

echo "STATUS|progress"

set -x

sdasz80 -o sdcc-backend.rel sdcc-backend.asm
sdcc -mz80 -c main.c -o main.rel
sdcc -mz80 --no-std-crt0 main.rel sdcc-backend.rel -o build.ihx
objcopy -I ihex -O binary build.ihx build.bin

set +x

echo "STATUS|ok"