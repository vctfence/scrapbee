import logging
import threading
from queue import Queue


class RequestQueue:
    def __init__(self):
        self.request_queue = Queue()
        self.processor_thread = threading.Thread(target=self.processor, daemon=True)
        self.processor_thread.start()

    def processor(self):
        while True:
            try:
                request, params = self.request_queue.get()
                request(params)
            except Exception as e:
                logging.exception(e)

    def add(self, request, params):
        self.request_queue.put((request, params,))
