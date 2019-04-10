import json
from handlers import BaseHandler, find_marker, load_feed
from handlers.tle import get_iss_passes
from datetime import datetime, timezone


class SightingsHandler(BaseHandler):

    async def get(self):
        lat = float(self.get_argument('lat'))
        lon = float(self.get_argument('lon'))

        """
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

        """
        def format_dt(t):
            return time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(t))

        r = get_iss_passes(lat, lon, 100.0, 10)

        out = []
        for r in r['response']:
            risetime = r['risetime']
            risetime = datetime.fromtimestamp(risetime, timezone.utc)
            out.append({
                'datetime': risetime.isoformat(),
                'info': {},
                })

        out = { 'sightings': out }
        self.write(out)
