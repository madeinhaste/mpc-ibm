# run a tornado web server behind nginx
# return the ip address
# return the lat/lon

import tornado.ioloop
import tornado.web
import math
import apsw
from routes import routes
from handlers.iss import start_iss_update


class Application(tornado.web.Application):
    def __init__(self, db):
        self.db = db
        settings = { 'debug': True }
        super(Application, self).__init__(routes, **settings)


def create_db():
    db = apsw.Connection('data/sightings.db')

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
