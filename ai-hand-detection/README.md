# Hand Detection using AI

This project demonstrates browser-based hand detection using ml5.js (handpose). It now includes a modern UI, live overlay, snapshot and logging utilities, and a settings panel for model/config selection.

## What's new (industry-style UI)
- Responsive card layout with a live canvas overlay for detections
- Start / Stop controls, Snapshot and Export Logs buttons
- Mirror toggle and FPS slider
- Model selection dropdown (re-initializes model)

## Quick start
1. Open the project folder in a static web server (recommended) or open `index.html` in a modern browser with camera access.

Simple Python HTTP server (run from project root):

```bash
python -m http.server 8000
# then open http://localhost:8000 in your browser
```

## Real mouse control on Windows
To move the actual computer mouse, run the local bridge in a second terminal while the browser app is open.

Install the Python dependencies:

```bash
pip install -r requirements.txt
```

Start the bridge:

```bash
python mouse_bridge.py
```

Then open the app, turn on `Mouse Control`, and keep the bridge terminal running.

## UI Guide
- Start: begins camera stream and detection loop
- Stop: stops camera and inference
- AI toggle: enable/disable inference while streaming
- Mouse Control: sends hand movement, pinch clicks, drag, scroll, and zoom to the Windows mouse bridge
- FPS: change inference/rendering rate
- Snapshot: download current canvas as PNG
- Export Logs: download CSV with timestamped detection counts and bounding boxes

## Developer notes
- Model initialization happens in `video.js` (`initModel()`), and `modelLoaded()` (defined in `index.html`) warms the model to avoid first-frame lag.
- Detections are drawn into `c1` canvas; video element remains hidden and used as the source for the canvas.

## Next recommended upgrades
- Gesture recognition demo (map landmarks -> gestures)
- On-device quantized model or WebNN for faster CPU inference
- Move inference to a WebWorker for smoother UI
- Add E2E tests and GitHub Actions CI
 - Gesture recognition demo (implemented: pinch / fist / open heuristics)
 - Move inference to a WebWorker for smoother UI (worker fallback implemented)
 - Improve mobile layout and touch targets
 - Gesture recognition demo (implemented: pinch, fist, open, wave, thumbs-up)
 - Pinch-to-click: pinch then release triggers a click at virtual cursor position
 - Worker: TensorFlow Handpose runs in `worker.js` when supported; main-thread fallback available

## Files of interest
- `index.html` — UI and layout
- `style.css` — modern, responsive styling
- `video.js` — camera, model init, detection loop, UI wiring

## License
MIT-style: feel free to use and adapt.
# 🤖 Hand Detection using AI
## 👋 About this project
This is a web-based hand detection app powered by AI. You can use it in your web browser. This web application uses the camera of your device to detect your hand.

## ⚙️ Features

- ✅ Toggle switch to turn AI on or off
- ✅ Range slider to control frame rate
- ✅ Mouse example to show a possible usage case
- ✅ Configurable border in mouse example
- ✅ Mouse Control mode with bridge-based real system mouse movement

## 🖼️ Images
<a href="https://ibb.co/T15LJDH"><img src="https://i.ibb.co/Vx8mb0v/Screenshot-2021-04-08-AI-hand-detection.png" alt="live AI-hand-detection"></a>

## 💪 Try it
If you are not convinced yet just try it out here: https://hand-detection.ai.woody.pizza/

There is also an example where you can control the mouse by using your hand: https://hand-detection.ai.woody.pizza/mouse

## 🌐 Multiple browser support
Probably this will work with the most browsers, but here is a list which browsers I have tested: 

|      Browser      | supported |
|:-----------------:|:---------:|
|      Firefox      |     ✅     |
|      Chrome       |     ✅     |
|        Edge       |     ✅     |
| Internet Explorer |     ❌     |

| Mobile Browser | supported |
|:--------------:|:---------:|
|     Firefox    |     ✅     |
|     Chrome     |     ✅     |

## ✌️ Credits
- [Materialize](https://materializecss.com/)
- [ml5js](https://ml5js.org/)
