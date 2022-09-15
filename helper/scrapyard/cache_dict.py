import logging
from collections import UserDict
from datetime import datetime, timedelta


class CacheDict(UserDict):
    def __init__(self, *args, **kwargs):
        UserDict.__init__(self, *args, **kwargs)
        self.__timestamps = dict()

    def __setitem__(self, key, value):
        self.__timestamps[key] = datetime.now()
        self.data[key] = value
        self.__remove_expired()

    def __remove_expired(self):
        threshold = datetime.now() - timedelta(hours=0, minutes=1)
        remove = set()

        for [key, key_time] in self.__timestamps.items():
            if key_time < threshold:
                remove.add(key)

        for key in remove:
            del self.__timestamps[key]
            del self.data[key]

