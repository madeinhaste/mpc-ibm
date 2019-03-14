import re
import sys
import math
import itertools
import xml.etree.ElementTree as ET

# https://blog.frame.io/2017/07/17/timecode-and-frame-rates/

def parse_timecode(timecode, fps):
    bits = [float(x) for x in re.split('[:,]', timecode)]
    secs = bits[3]/fps + bits[2] + 60*bits[1] + 3600*bits[0]
    return secs


def format_timecode(secs, fps):
    ff = round(fps * (secs - math.floor(secs)))
    ss = math.floor(secs) % 60
    mm = (math.floor(secs)//60) % 60
    hh = (math.floor(secs)//3600) % fps
    return f'{hh:02}:{mm:02}:{ss:02}.{ff:02}'


if __name__ == '__main__':
    FPS = 24

    filepath = sys.argv[1]
    tree = ET.parse(filepath)
    root = tree.getroot()
    markers = []
    for el in root.iter('property'):
        propname = el.get('name')
        if propname.startswith('kdenlive:guide.'):
            timecode = el.text
            markers.append(parse_timecode(timecode, FPS))

    for i in range(0, len(markers), 2):
        tin, tout = markers[i:i+2]
        #print(tin, tout)
        print(format_timecode(tin, FPS), format_timecode(tout, 24))
