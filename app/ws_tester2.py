import asyncio
import websockets
import sys

async def test_ws(port):
    uri = f"ws://localhost:{port}/_stcore/stream"
    try:
        async with websockets.connect(uri) as websocket:
            print("Connected!")
            # Streamlit doesn't need a message, just connecting makes it run
            msg = await websocket.recv()
            print("Received:", msg[:100])
            return True
    except Exception as e:
        print(f"Error: {e}")
        return False

if __name__ == "__main__":
    port = sys.argv[1]
    success = asyncio.run(test_ws(port))
    sys.exit(0 if success else 1)
