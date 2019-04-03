from handlers import BaseHandler, geoip_city, find_marker, load_feed


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
            return self.write({'h': 0.0})

