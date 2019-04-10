import json
import time
from datetime import datetime, timezone
from math import degrees
import ephem
from calendar import timegm
import tornado.ioloop
from tornado.httpclient import AsyncHTTPClient

NASA_URL = 'http://spaceflight.nasa.gov/realdata/sightings/SSapplications/Post/JavaSSOP/orbit/ISS/SVPOST.html'

class IssData(object):
    def __init__(self):
        self.tle = None
        self.time = 0.0
        self.last_update = 0.0
        self.updating = False

iss_data = IssData()


def get_tle():
    return iss_data.tle

def start_tle_update():
    tornado.ioloop.IOLoop.current().spawn_callback(update_tle)
    interval_ms = 12*60*60*1000
    pc = tornado.ioloop.PeriodicCallback(update_tle, interval_ms)
    pc.start()

async def update_tle():
    print("Updating ISS TLE from JSC...")
    try:
        response = await AsyncHTTPClient().fetch(NASA_URL)
    except Exception as e:
        # TODO
        print('Error:', e)
        raise e

    data = response.body.decode('utf-8')

    # parse the HTML
    data = data.split("<PRE>")[1]
    data = data.split("</PRE>")[0]
    data = data.split("Vector Time (GMT): ")[1:]

    for group in data:
        # Time the vector is valid for
        datestr = group[0:17]

        # parse date string
        tm = time.strptime(datestr, "%Y/%j/%H:%M:%S")

        # change into more useful datetime object
        dt = datetime(tm[0], tm[1], tm[2], tm[3], tm[4], tm[5])

        # Debug
        #print dt

        # More parsing
        tle = group.split("TWO LINE MEAN ELEMENT SET")[1]
        tle = tle[8:160]
        lines = tle.split('\n')[0:3]

        # Most recent TLE
        now = datetime.utcnow()

        if (dt - now).days >= 0:
            # Debug Printing
            """
            print dt
            for line in lines:
                print line.strip()
            print "\n~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\n"
            """

            tle = [lines[0].strip(), lines[1].strip(), lines[2].strip()]

            iss_data.tle = tle
            iss_data.time = dt
            iss_data.last_update = now

            print('tle:', iss_data.tle)
            print('time:', iss_data.time)
            print('last_update:', iss_data.last_update)

            #print('iss_tle:', tle)
            #print('iss_tle_time:', dt.timetuple())
            #print('iss_tle_last_update:', timegm(now.timetuple()))
            #r.set("iss_tle", tle)
            #r.set("iss_tle_time", timegm(dt.timetuple()))
            #r.set("iss_tle_last_update", timegm(now.timetuple()))
            break


def get_iss_location():
    print('get_iss_location')
    tle = get_tle()
    print('tle:', tle)
    iss = ephem.readtle(str(tle[0]), str(tle[1]), str(tle[2]))

    # Compute for now
    now = datetime.utcnow()
    iss.compute(now)
    lon = degrees(iss.sublong)
    lat = degrees(iss.sublat)

    # Return the relevant timestamp and data
    return {"timestamp": timegm(now.timetuple()), "iss_position": {"latitude": lat, "longitude": lon}}

def get_iss_passes(lat, lon, alt, n, now=None):
    """Compute n number of passes of the ISS for a location"""

    # Get latest TLE from redis
    tle = get_tle()
    iss = ephem.readtle(str(tle[0]), str(tle[1]), str(tle[2]))

    # Set location
    location = ephem.Observer()
    location.lat = str(lat)
    location.long = str(lon)
    location.elevation = alt

    # Override refration calculation
    location.pressure = 0
    location.horizon = '10:00'

    # Set time now
    if now is None:
        now = datetime.utcnow()
    location.date = now

    # Predict passes
    passes = []
    for p in range(n):
        tr, azr, tt, altt, ts, azs = location.next_pass(iss)
        duration = int((ts - tr) * 60 * 60 * 24)
        year, month, day, hour, minute, second = tr.tuple()
        dt = datetime(year, month, day, hour, minute, int(second))

        if duration > 60:
            passes.append({"risetime": timegm(dt.timetuple()), "duration": duration})

        # Increase the time by more than a pass and less than an orbit
        location.date = tr + 25*ephem.minute

    # Return object
    obj = {"request": {
        "datetime": timegm(now.timetuple()),
        "latitude": lat,
        "longitude": lon,
        "altitude": alt,
        "passes": n,
        },
        "response": passes,
    }

    return obj


if __name__ == '__main__':
    loop = tornado.ioloop.IOLoop.current()
    start_tle_update()

    def f():
        print('location:', get_iss_location())
        print('location:', get_iss_passes(51.552, -0.135, 100.0, 5))

    loop.call_later(5.0, f)
    loop.start()
