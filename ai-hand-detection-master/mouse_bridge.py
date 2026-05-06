import asyncio
import json
import sys

try:
    import pyautogui
    import websockets
except ImportError:
    print("Missing dependencies. Install with: pip install -r requirements.txt")
    raise

pyautogui.FAILSAFE = False
pyautogui.PAUSE = 0

state = {
    "mouse_down": False,
    "last_zoom": 1.0,
}

async def handle_message(message: str):
    try:
        data = json.loads(message)
    except json.JSONDecodeError:
        return

    action = data.get("type")

    if action == "move":
        x = int(data.get("x", 0))
        y = int(data.get("y", 0))
        pyautogui.moveTo(x, y, duration=0)
        return

    if action == "down":
        if not state["mouse_down"]:
            state["mouse_down"] = True
            pyautogui.mouseDown(button="left")
        return

    if action == "up":
        if state["mouse_down"]:
            state["mouse_down"] = False
            pyautogui.mouseUp(button="left")
        return

    if action == "scroll":
        dy = int(data.get("dy", 0))
        if dy != 0:
            pyautogui.scroll(-dy)
        return

    if action == "zoom":
        scale = float(data.get("scale", 1.0))
        previous = state["last_zoom"]
        if abs(scale - previous) < 0.04:
            return
        if scale > previous:
            pyautogui.hotkey("ctrl", "shift", "=")
        else:
            pyautogui.hotkey("ctrl", "-")
        state["last_zoom"] = scale
        return

async def handler(websocket):
    async for message in websocket:
        await handle_message(message)

async def main():
    print("Mouse bridge listening on ws://127.0.0.1:8765")
    print("Keep this terminal open while using the app.")
    async with websockets.serve(handler, "127.0.0.1", 8765):
        await asyncio.Future()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        sys.exit(0)
