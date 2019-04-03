import json
from datetime import datetime
import tornado.ioloop
from tornado.httpclient import AsyncHTTPClient
from handlers import BaseHandler


iss_current = {
    'timestamp': '',
    'lat': 0.0,
    'lon': 0.0,
    'trail': [],
    }


def start_iss_update():
    async def f():
        try:
            r = await AsyncHTTPClient().fetch('http://api.open-notify.org/iss-now.json')
        except Exception as e:
            print('Error:', e)
        else:
            ob = json.loads(r.body)
            timestamp = datetime.utcfromtimestamp(ob['timestamp'])
            loc = ob['iss_position']

            iss_current['timestamp'] = timestamp.isoformat()
            iss_current['lat'] = loc['latitude']
            iss_current['lon'] = loc['longitude']

            trail = iss_current['trail']
            trail.append({
                'lat': loc['latitude'],
                'lon': loc['longitude'],
                })
            max_trail_len = 200
            while len(trail) > max_trail_len:
                trail.pop(0)

            print('updated iss', timestamp)

    tornado.ioloop.IOLoop.current().spawn_callback(f)
    pc = tornado.ioloop.PeriodicCallback(f, 10000)
    pc.start()


class ISSHandler(BaseHandler):

    def get(self):
        self.write(iss_current)

