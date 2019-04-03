from handlers.iss import ISSHandler
from handlers.geoip import GeoIPHandler
from handlers.marker import MarkerHandler
from handlers.sightings import SightingsHandler
from handlers.hours import HoursHandler

routes = [
    (r'/iss', ISSHandler),
    (r'/geoip', GeoIPHandler),
    (r'/marker', MarkerHandler),
    (r'/sightings', SightingsHandler),
    (r'/hours', HoursHandler),
]
