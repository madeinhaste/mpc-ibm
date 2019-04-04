import os
from tornado.options import define, options

datadir = os.path.abspath('./data')

define('port', default=8888, help='http port', type=int)
define('debug', default=False, help='debug mode')
define('dbpath', default=os.path.join(datadir, 'sightings.db'), help='database path', type=str)
define('mmdbpath', default=os.path.join(datadir, 'geolite2/GeoLite2-City.mmdb'), help='maxmind db path', type=str)
options.parse_command_line()
