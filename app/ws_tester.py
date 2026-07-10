import asyncio
import websockets
import json
import sys

async def test_ws(port):
    uri = f"ws://localhost:{port}/_stcore/stream"
    try:
        async with websockets.connect(uri) as websocket:
            # Send initial message (Streamlit handshake)
            msg = {"type": "backMsg", "backMsg": {"auth": {}}}
            # Actually Streamlit expects nothing or a BackMsg.
            # Just connecting might be enough to trigger a run!
            await asyncio.sleep(2)
            return True
    except Exception as e:
        print(f"Error: {e}")
        return False

if __name__ == "__main__":
    port = sys.argv[1]
    success = asyncio.run(test_ws(port))
    sys.exit(0 if success else 1)
