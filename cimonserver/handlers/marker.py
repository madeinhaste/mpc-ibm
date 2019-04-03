from handlers import find_marker, BaseHandler


class MarkerHandler(BaseHandler):

    def get(self):
        lat = float(self.get_argument('lat'))
        lon = float(self.get_argument('lon'))

        cur = self.application.db.cursor()
        ob = find_marker(cur, lat, lon)

        self.write(ob)

