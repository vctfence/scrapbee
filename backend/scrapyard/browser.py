import logging
import queue
import sys
import struct
import json
import threading

message_mutex = threading.Lock()
message_queue = queue.Queue()


def get_message():
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length:
        sys.exit(0)
    message_length = struct.unpack('=I', raw_length)[0]
    message = sys.stdin.buffer.read(message_length).decode("utf-8")
    return json.loads(message)


def encode_message(message_content):
    encoded_content = json.dumps(message_content).encode("utf-8")
    encoded_length = struct.pack('=I', len(encoded_content))
    #  use struct.pack("10s", bytes), to pack a string of the length of 10 characters
    return {'length': encoded_length, 'content': struct.pack(str(len(encoded_content))+"s", encoded_content)}


def send_message(message):
    encoded_message = encode_message(message)
    sys.stdout.buffer.write(encoded_message['length'])
    sys.stdout.buffer.write(encoded_message['content'])
    sys.stdout.buffer.flush()


def send_with_response(msg):
    message_mutex.acquire()
    response = {}

    try:
        msg_json = json.dumps(msg)
        send_message(msg_json)
        response = message_queue.get()
    finally:
        message_mutex.release()

    return response
