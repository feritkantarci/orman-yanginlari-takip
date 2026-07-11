#!/bin/bash
TOTAL_LINES=$(wc -l < main.py)
START=88
END=$TOTAL_LINES

while [ $START -le $END ]; do
    MID=$(( (START + END) / 2 ))
    head -n $MID main.py > test_mid.py
    
    # Run streamlit in background
    source venv/bin/activate
    streamlit run test_mid.py --server.port 8515 > /dev/null 2>&1 &
    PID=$!
    
    # Wait for server to start
    sleep 2
    
    # Trigger connection
    curl -s http://localhost:8515 > /dev/null
    sleep 1
    
    # Check if process is still alive
    if kill -0 $PID 2>/dev/null; then
        # Still alive, no segfault!
        echo "Line $MID: OK"
        START=$((MID + 1))
        kill -9 $PID
    else
        # Process died (segfault)
        echo "Line $MID: CRASH"
        END=$((MID - 1))
    fi
done
