import tornado.ioloop
import tornado.web
from tornado.httpclient import AsyncHTTPClient
from datetime import datetime
from handlers import BaseHandler, geoip_city


class GeoIPHandler(BaseHandler):

    def get(self):
        self.write(geoip_city(self.request))
