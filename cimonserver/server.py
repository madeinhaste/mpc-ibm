# run a tornado web server behind nginx
# return the ip address
# return the lat/lon

import tornado.ioloop
import tornado.web
from tornado.httpclient import AsyncHTTPClient
from datetime import datetime

import geoip2.database
import geoip2.errors

geoip_reader = geoip2.database.Reader('./data/geolite2/GeoLite2-City.mmdb')

import json
import math
import re

iss_current = {
    'timestamp': '',
    'lat': 0.0,
    'lon': 0.0,
    'trail': [],
    }

import apsw
import pytz
from datetime import datetime
import xml.etree.ElementTree as ET

def start_iss_update():
    async def f():
        c = AsyncHTTPClient()
        try:
            r = await c.fetch('http://api.open-notify.org/iss-now.json')
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


class CorsRequestHandler(tornado.web.RequestHandler):

    def set_default_headers(self):
        self.set_header('Access-Control-Allow-Origin', '*')
        self.set_header('Access-Control-Allow-Headers', 'x-requested-with, Access-Control-Allow-Origin')
        self.set_header('Access-Control-Allow-Methods', 'GET, OPTIONS')

    def options(self):
        self.set_status(204)
        self.finish()


class GeoIPHandler(CorsRequestHandler):

    def get(self):
        ip = self.request.remote_ip
        try:
            ob = geoip_reader.city(ip)
        except geoip2.errors.AddressNotFoundError:
            self.write({
                'ip': ip,
                'lat': 0.0,
                'lon': 0.0,
                'city': 'Not Found',
                'timezone': 'Etc/GMT',
                })
            return

        loc = ob.location
        name = f'{ob.city.names["en"]}, {ob.country.names["en"]}, {ob.continent.names["en"]}'

        self.write({
            'ip': ip,
            'city': name,
            'lat': loc.latitude,
            'lon': loc.longitude,
            'timezone': loc.time_zone,
        })



class ISSHandler(CorsRequestHandler):

    def get(self):
        self.write(iss_current)


def find_marker(cur, lat, lon):
    # see here for possible optimizations
    # https://www.plumislandmedia.net/mysql/haversine-mysql-nearest-loc/
    id, name, label, timezone, lat, lon, dist = cur.execute('''
            SELECT id, name, label, timezone, lat, lon, haversine(?,?,lat,lon) as dist
            FROM markers ORDER BY dist LIMIT 1''', (lat, lon)).fetchone()

    return {
        'id': id,
        'name': name,
        'label': label,
        'timezone': timezone,
        'lat': lat,
        'lon': lon,
        'dist': dist,
        }


class FindMarkerHandler(CorsRequestHandler):

    def get(self):
        lat = float(self.get_argument('lat'))
        lon = float(self.get_argument('lon'))

        cur = self.application.db.cursor()
        ob = find_marker(cur, lat, lon)

        self.write(ob)


re_desc_line = re.compile(r'^([\w ]+):\s*(.*)\s*$')

def parse_desc(desc):
    out = {}
    for line in desc.text.split('<br/>'):
        m = re_desc_line.match(line.strip())
        if m:
            key = m.group(1).lower().replace(' ', '_')
            value = m.group(2)
            out[key] = value
    return out

async def load_feed(cur, marker_id):
    marker_name, marker_timezone = cur.execute('SELECT name, timezone FROM markers WHERE id=?', (marker_id,)).fetchone()
    print(f'load_feed: {marker_id} {marker_name}')

    url = f'https://spotthestation.nasa.gov/sightings/xml_files/{marker_name}.xml'
    client = AsyncHTTPClient()
    try:
        response = await client.fetch(url)
    except Exception as e:
        # TODO
        print('Error:', e)
        raise e

    xml = response.body
    root = ET.fromstring(xml)
    feed = root.find('channel')
    pubdate = feed.find('pubDate').text
    pubdate = datetime.strptime(pubdate, '%d %b %Y %H:%M:%S GMT')
    pubdate = pytz.timezone('Etc/GMT').localize(pubdate)
    pubdate = pubdate.isoformat()

    with cur.getconnection():
        # add the feed
        cur.execute('''
            REPLACE INTO feeds (marker_id, published, xml)
            VALUES (?, ?, ?)''', (marker_id, pubdate, xml))

        # update sightings
        cur.execute('DELETE FROM sightings WHERE marker_id=?', (marker_id,))

        timezone = pytz.timezone(marker_timezone)
        now = pytz.utc.localize(datetime.utcnow())

        for desc in feed.findall('item/description'):
            ob = parse_desc(desc)
            dts = f'{ob["date"]} {ob["time"]}'
            dtn = datetime.strptime(dts, '%A %b %d, %Y %I:%M %p')
            dta = timezone.localize(dtn)
            dtu = dta.astimezone(pytz.utc)

            cur.execute('''
                INSERT INTO sightings (marker_id, datetime, info)
                VALUES (?, ?, ?)''',
                (marker_id, dtu.isoformat(), json.dumps(ob)))



class FindSightingsHandler(CorsRequestHandler):

    async def get(self):
        lat = float(self.get_argument('lat'))
        lon = float(self.get_argument('lon'))

        cur = self.application.db.cursor()

        marker = find_marker(cur, lat, lon)
        marker_id = marker['id']

        # get the published date for the feed
        row = cur.execute('SELECT published FROM feeds WHERE marker_id=?', (marker['id'],)).fetchone()
        if not row:
            # no feed exists, load one
            # XXX is it possible for >1 to be in flight here?
            await load_feed(cur, marker_id)

        out = []
        for dt, info in cur.execute('SELECT datetime, info FROM sightings WHERE marker_id=?', (marker_id,)):
            out.append({
                'datetime': dt,
                'info': json.loads(info),
                })

        out = { 'sightings': out }
        self.write(out)


class HoursHandler(CorsRequestHandler):

    async def get(self):
        lat = self.get_argument('lat', None)
        lon = self.get_argument('lon', None)

        if lat is None or lon is None:
            # get the geoip
            ip = self.request.remote_ip
            try:
                ob = geoip_reader.city(ip)
            except geoip2.errors.AddressNotFoundError:
                return self.write({'h': 0.0})

            loc = ob.location
            lat = loc.latitude
            lon = loc.longitude
        else:
            lat = float(lat)
            lon = float(lon)

        # find the nearest town
        cur = self.application.db.cursor()
        marker = find_marker(cur, lat, lon)
        marker_id = marker['id']

        # get the published date for the feed
        row = cur.execute('SELECT published FROM feeds WHERE marker_id=?', (marker['id'],)).fetchone()
        if not row:
            # no feed exists, load one
            # XXX is it possible for >1 to be in flight here?
            await load_feed(cur, marker_id)

        # find the first sighting after now
        row = cur.execute('''
                SELECT datetime, 24.0*(julianday(datetime) - julianday('now')) as hours
                FROM sightings
                WHERE marker_id=? AND hours > 0.0
                LIMIT 1
            ''', (marker_id,)).fetchone()
        if row:
            hours = row[1]
            return self.write({'h': hours})
        else:
            return self.write({'h': 0.0})

class Application(tornado.web.Application):
    def __init__(self, db):
        handlers = [
            (r'/iss', ISSHandler),
            (r'/geoip', GeoIPHandler),
            (r'/marker', FindMarkerHandler),
            (r'/sightings', FindSightingsHandler),
            (r'/hours', HoursHandler),
        ]
        settings = {
            'debug': True,
        }
        self.db = db
        super(Application, self).__init__(handlers, **settings)


def create_db():
    db = apsw.Connection('sightings.db')

    DEG2RAD = math.pi/180
    EARTH_RADIUS = 6371.0

    def haversine(lat1, lon1, lat2, lon2):
        s1 = math.sin(DEG2RAD * (lat2 - lat1)/2)
        s2 = math.sin(DEG2RAD * (lon2 - lon1)/2)
        c1 = math.cos(DEG2RAD * lat1)
        c2 = math.cos(DEG2RAD * lat2)
        a = s1*s1 + s2*s2*c1*c2
        return EARTH_RADIUS * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));

    db.createscalarfunction('haversine', haversine)

    return db


def make_app():
    db = create_db()
    return Application(db)


if __name__ == '__main__':
    app = make_app()
    app.listen(8888, xheaders=True)
    start_iss_update()
    tornado.ioloop.IOLoop.current().start()
