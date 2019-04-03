import json
import apsw
import xml.etree.ElementTree as ET

con = apsw.Connection('sightings.db')
cur = con.cursor()

cur.execute('''
    CREATE TABLE IF NOT EXISTS markers (
        id INTEGER PRIMARY KEY,
        name TEXT,
        label TEXT,
        lat REAL,
        lon REAL,
        timezone TEXT);

    CREATE TABLE IF NOT EXISTS feeds (
        marker_id INTEGER PRIMARY KEY,
        published TEXT,
        xml TEXT);

    CREATE TABLE IF NOT EXISTS sightings (
        id INTEGER PRIMARY KEY,
        marker_id INTEGER,
        datetime TEXT,
        info TEXT);
''')

def load_markers():
    with con:
        data = json.load(open('markers.json'))
        for d in data:
            name = '_'.join([d['country'], d['state'], d['town']])
            cur.execute('''
                INSERT INTO markers (name, label, lat, lon, timezone)
                VALUES (?, ?, ?, ?, ?)''', (name, d['label'], d['lat'], d['lon'], d['timezone']))

con.close()
