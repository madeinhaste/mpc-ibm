import json
from handlers import BaseHandler, find_marker, load_feed


class SightingsHandler(BaseHandler):

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
