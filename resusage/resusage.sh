#!/bin/bash
STAT_FILE=$(mktemp)

echo 'waiting for process'
while ! pidof node > /dev/null; do sleep 1; done;

while pidof node > /dev/null; do
    ps -eo pid,rss,%cpu,cmd --sort=-%mem | tail -n +2  >> $STAT_FILE
    echo -n .
    sleep 1
done

cat $STAT_FILE | ./plot.py --pattern="peer,orderer,fabric,geth,bootnode"
# rm -rf $STAT_FILE