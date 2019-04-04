import re
import tornado.web
from tornado.concurrent import Future
from tornado.httpclient import AsyncHTTPClient
import xml.etree.ElementTree as ET
import pytz
import json
import re
from datetime import datetime
from tornado.options import options

import geoip2.database
import geoip2.errors

geoip_reader = geoip2.database.Reader(options.mmdbpath)

def geoip_city(request):
    ip = request.remote_ip
    try:
        ob = geoip_reader.city(ip)
    except geoip2.errors.AddressNotFoundError:
        return {
            'ip': ip,
            'lat': 0.0,
            'lon': 0.0,
            'city': 'Not Found',
            'timezone': 'Etc/GMT',
        }

    loc = ob.location
    name = f'{ob.city.names["en"]}, {ob.country.names["en"]}, {ob.continent.names["en"]}'

    return {
        'ip': ip,
        'city': name,
        'lat': loc.latitude,
        'lon': loc.longitude,
        'timezone': loc.time_zone,
    }




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


loading_feeds = {}

async def load_feed(cur, marker_id):
    fut = loading_feeds.get(marker_id)
    if fut:
        #print('awaiting future')
        await fut
        #print('got future')
    else:
        fut = Future()
        loading_feeds[marker_id] = fut
        print('loading feeds:', list(loading_feeds.keys()))
        try:
            #print('awaiting feed')
            await _load_feed(cur, marker_id)
            #print('got feed')
            #print('signalling future')
            fut.set_result(True)
        except Exception as e:
            fut.set_result(e)
        finally:
            del loading_feeds[marker_id]
            print('loading feeds:', list(loading_feeds.keys()))

async def _load_feed(cur, marker_id):
    marker_name, marker_timezone = cur.execute('SELECT name, timezone FROM markers WHERE id=?', (marker_id,)).fetchone()
    print(f'load_feed: {marker_id} {marker_name}')

    url = f'https://spotthestation.nasa.gov/sightings/xml_files/{marker_name}.xml'
    try:
        response = await AsyncHTTPClient().fetch(url)
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


class BaseHandler(tornado.web.RequestHandler):

    def set_default_headers(self):
        self.set_header('Access-Control-Allow-Origin', '*')
        self.set_header('Access-Control-Allow-Headers', 'x-requested-with, Access-Control-Allow-Origin')
        self.set_header('Access-Control-Allow-Methods', 'GET, OPTIONS')

    def options(self):
        self.set_status(204)
        self.finish()

