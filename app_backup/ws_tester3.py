import asyncio
import websockets
import sys
import json

async def test_ws(port):
    uri = f"ws://localhost:{port}/_stcore/stream"
    try:
        async with websockets.connect(uri) as websocket:
            print("Connected!")
            
            # Send Rerun message
            req = {
                "type": "rerun",
                "rerun": {
                    "queryString": "",
                    "clientState": {
                        "queryStrings": {},
                        "pageName": "",
                        "widgetStates": []
                    }
                }
            }
            await websocket.send(json.dumps(req))
            
            while True:
                msg = await websocket.recv()
                print("Received:", msg[:100])
                
    except Exception as e:
        print(f"Error: {e}")
        return False

if __name__ == "__main__":
    port = sys.argv[1]
    asyncio.run(test_ws(port))
