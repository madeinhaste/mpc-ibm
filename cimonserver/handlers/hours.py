import json
import time
from handlers import BaseHandler, geoip_city, find_marker, load_feed
from tornado.httpclient import AsyncHTTPClient


async def get_next_sighting_hours_from_open_notify_api(lat, lon):
    url = f'http://api.open-notify.org/iss-pass.json?lat={lat}&lon={lon}&n=1'
    try:
        response = await AsyncHTTPClient().fetch(url)
    except Exception as e:
        return 0.0

    ob = json.loads(response.body)
    next_pass = ob['response'][0]
    risetime = float(next_pass['risetime'])
    now = time.time()
    hours_to_risetime = (risetime - now) / 3600
    return hours_to_risetime


class HoursHandler(BaseHandler):

    async def get(self):
        lat = self.get_argument('lat', None)
        lon = self.get_argument('lon', None)

        if lat is None or lon is None:
            ob = geoip_city(self.request)
            lat = ob['lat']
            lon = ob['lon']
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
            hours = await get_next_sighting_hours_from_open_notify_api(lat, lon)
            return self.write({'h': hours, 'error': 'no sightings found in nasa feeds'})

