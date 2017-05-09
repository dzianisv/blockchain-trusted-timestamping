#!/usr/bin/python3

import plotly
import sys
import time
import logging
import argparse
logging.basicConfig(level=logging.DEBUG)

import plotly.plotly as py
import plotly.graph_objs as go
from plotly.offline import plot

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--pattern', type=str, required=False)
    args = parser.parse_args()
    patterns = args.pattern.split(',')
    processes = dict()
    for line in sys.stdin.readlines():
        pstat = line.split()

        if len(pstat) < 3:
            continue

        pid = int(pstat[0])
        rss = int(pstat[1]) / 1024
        cpu = float(pstat[2])
        cmd = ' '.join(pstat[3:])

        if not any([cmd.startswith(p) for p in patterns]):
            continue

        if pid not in processes:
            processes[pid] = {
                'cmd': cmd,
                'rss': [],
                'cpu': []
            }

        processes[pid]['rss'].append(rss)
        processes[pid]['cpu'].append(cpu)

    logging.debug(processes)
    for metric in ['rss', 'cpu']:
        data = []

        for pid, pstat in processes.items():
            trace = go.Scatter(
                x = [i for i in range(len(pstat[metric]))],
                y = pstat[metric],
                mode = 'lines',
                name = pstat['cmd'][:min(16, len(pstat['cmd']))] + ' ' + metric
            )

            data.append(trace)

        plot(data, filename='%s.%d.html' % (metric, time.time()))