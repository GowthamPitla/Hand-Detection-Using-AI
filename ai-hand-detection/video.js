document.getElementById("ai").addEventListener("change", toggleAi)
document.getElementById("fps").addEventListener("input", changeFps)
document.getElementById("signToggle").addEventListener("change", toggleSign)
document.getElementById("mouseCtrlToggle").addEventListener("change", toggleMouseControl)
document.getElementById("startBtn").addEventListener("click", startStream)
document.getElementById("stopBtn").addEventListener("click", stopStream)

const video = document.getElementById("video");
const c1 = document.getElementById('c1');
const ctx1 = c1.getContext('2d');
const labelsCanvas = document.getElementById('labels');
const ctxLabels = labelsCanvas ? labelsCanvas.getContext('2d') : null;
const viewerWrap = document.querySelector('.viewer-wrap');
var cameraAvailable = false;
var aiEnabled = false;
var signEnabled = false;
var mouseControlEnabled = false;
var running = false;
var fps = 1000 / 30;
var border = 140;
var mpHands = null;
var mpReady = false;
var mpBusy = false;
var latestMappedResults = [];
var waveHistory = [];
var lastWaveEmit = 0;
var mouseBridge = {
    ws: null,
    queue: [],
    reconnectTimer: null
};
var mouseState = {
    active: false,
    target: null,
    lastX: 0,
    lastY: 0,
    lastDistance: null,
    zoomLevel: 1
};

/* Setting up the constraint */
var facingMode = "user"; // Can be 'user' or 'environment' to access back or front camera (NEAT!)
var constraints = {
    audio: false,
    video: {
        facingMode: facingMode
    }
};

function camera() {
    if (!cameraAvailable) {
        navigator.mediaDevices.getUserMedia(constraints).then(function (stream) {
            cameraAvailable = true;
            video.srcObject = stream;
            video.onloadedmetadata = function(){ video.play(); }
        }).catch(function (err) {
            cameraAvailable = false;
            if (modelIsLoaded) {
                if (err.name === "NotAllowedError") {
                    document.getElementById("loadingText").innerText = "Waiting for camera permission";
                }
            }
            setTimeout(camera, 1000);
        });
    }
}

function startStream(){
    if(running) return;
    running = true;
    initDetector();
    camera();
    timerCallback();
}

function stopStream(){
    running = false;
    if(video.srcObject){
        video.srcObject.getTracks().forEach(t => t.stop());
        video.srcObject = null;
    }
    cameraAvailable = false;
    ctx1.clearRect(0, 0, c1.width, c1.height);
    const cMouse = document.getElementById("mouse");
    cMouse.width = window.innerWidth;
    cMouse.height = window.innerHeight;
    if(labelsCanvas){ labelsCanvas.width = c1.width; labelsCanvas.height = c1.height; ctxLabels && ctxLabels.clearRect(0,0,labelsCanvas.width, labelsCanvas.height); }
    releaseMousePointer();
    closeMouseBridge();
}

function initDetector(){
    if(mpReady || handpose) return;

    if(typeof Hands !== "undefined"){
        mpHands = new Hands({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });
        mpHands.setOptions({
            maxNumHands: 2,
            modelComplexity: 1,
            minDetectionConfidence: 0.65,
            minTrackingConfidence: 0.6
        });
        mpHands.onResults((res) => {
            latestMappedResults = mapMediapipeResults(res);
        });
        mpReady = true;
        modelIsLoaded = true;
        document.getElementById("loadingText").innerText = "Advanced multi-hand detector ready. Click Start and enable AI.";
        return;
    }

    if(typeof ml5 !== "undefined"){
        handpose = ml5.handpose({ maxHands: 2, flipHorizontal: true }, {}, () => {
            modelIsLoaded = true;
            document.getElementById("loadingText").innerText = "Model loaded. Click Start and enable AI.";
        });
    }
}

function timerCallback() {
    if(!running){ return; }
    if (isReady()) {
        setResolution();
        ctx1.clearRect(0, 0, c1.width, c1.height);
        ctx1.drawImage(video, 0, 0, c1.width, c1.height);
        if (aiEnabled) {
            ai();
        } else {
            document.getElementById("handCount").innerText = "0";
            document.getElementById("signLabel").innerText = "Disabled";
        }
    }
    setTimeout(timerCallback, fps);
}

function isReady() {
    if (modelIsLoaded && cameraAvailable) {
        document.getElementById("loadingText").style.display = "block";
        document.getElementById("ai").disabled = false;
        return true;
    } else {
        return false;
    }
}

function setResolution() {
    const container = viewerWrap || document.body;
    const containerW = Math.max(1, container.clientWidth);
    const containerH = Math.max(1, container.clientHeight);
    if (video.videoWidth && video.videoHeight) {
        // prefer scaling to video aspect, but never exceed container
        const videoAspect = video.videoWidth / video.videoHeight;
        const containerAspect = containerW / containerH;
        if (containerAspect > videoAspect) {
            // container wider -> match height
            c1.height = containerH;
            c1.width = Math.round(containerH * videoAspect);
        } else {
            // container taller/narrower -> match width
            c1.width = containerW;
            c1.height = Math.round(containerW / videoAspect);
        }
    } else {
        // fallback to container size when video metadata not ready
        c1.width = containerW;
        c1.height = containerH;
    }
    if(labelsCanvas){ labelsCanvas.width = c1.width; labelsCanvas.height = c1.height; }
};

function toggleAi() {
    let enabled = document.getElementById("ai").checked;
    aiEnabled = enabled;
    if(enabled){
        document.getElementById("aiDesc").innerText = "AI enabled. All advanced hand features are active.";
    } else {
        document.getElementById("aiDesc").innerText = "Enable this to access all features. Until it is ON, no detection features are active.";
        document.getElementById("signLabel").innerText = "Disabled";
        document.getElementById("handCount").innerText = "0";
        releaseMousePointer();
    }
}

function toggleSign(){
    signEnabled = document.getElementById("signToggle").checked;
    if(!signEnabled){
        document.getElementById("signLabel").innerText = "Disabled";
    }
}

function toggleMouseControl(){
    mouseControlEnabled = document.getElementById("mouseCtrlToggle").checked;
    if(!mouseControlEnabled){
        releaseMousePointer();
        mouseState.lastDistance = null;
        sendMouseBridge({ type: "up" });
        closeMouseBridge();
        document.body.style.zoom = "1";
        mouseState.zoomLevel = 1;
    } else {
        connectMouseBridge();
    }
}

function changeFps() {
    fps = 1000 / document.getElementById("fps").value;
}

function setFakeMouse(x, y) {
    let cMouse = document.getElementById("mouse");
    let ctxMouse = cMouse.getContext("2d");
    cMouse.width = window.innerWidth;
    cMouse.height = window.innerHeight;
    x = cMouse.width * x;
    x = cMouse.width - x; // mirror
    y = cMouse.height * y;
    let img = new Image;
    img.src = "mouse/pointer.png";
    ctxMouse.drawImage(img, x, y, img.width * 0.5, img.height * 0.5);
}

function connectMouseBridge(){
    if(mouseBridge.ws && (mouseBridge.ws.readyState === 0 || mouseBridge.ws.readyState === 1)){
        return;
    }
    try {
        mouseBridge.ws = new WebSocket("ws://127.0.0.1:8765");
        mouseBridge.ws.onopen = function(){
            while(mouseBridge.queue.length){
                mouseBridge.ws.send(JSON.stringify(mouseBridge.queue.shift()));
            }
        };
        mouseBridge.ws.onclose = function(){
            mouseBridge.ws = null;
            if(mouseControlEnabled && !mouseBridge.reconnectTimer){
                mouseBridge.reconnectTimer = setTimeout(function(){
                    mouseBridge.reconnectTimer = null;
                    connectMouseBridge();
                }, 1000);
            }
        };
        mouseBridge.ws.onerror = function(){
            closeMouseBridge();
        };
    } catch (e) {
        closeMouseBridge();
    }
}

function closeMouseBridge(){
    if(mouseBridge.reconnectTimer){
        clearTimeout(mouseBridge.reconnectTimer);
        mouseBridge.reconnectTimer = null;
    }
    if(mouseBridge.ws){
        try { mouseBridge.ws.close(); } catch(e) {}
        mouseBridge.ws = null;
    }
    mouseBridge.queue = [];
}

function sendMouseBridge(payload){
    if(!mouseControlEnabled){
        return;
    }
    if(mouseBridge.ws && mouseBridge.ws.readyState === 1){
        mouseBridge.ws.send(JSON.stringify(payload));
        return;
    }
    mouseBridge.queue.push(payload);
    connectMouseBridge();
}

function releaseMousePointer(){
    if(mouseState.active && mouseState.target){
        dispatchVirtualPointer(mouseState.target, "pointerup", mouseState.lastX, mouseState.lastY);
    }
    mouseState.active = false;
    mouseState.target = null;
}

function handToScreen(x, y){
    const rect = viewerWrap.getBoundingClientRect();
    const ratioX = x / Math.max(1, c1.width);
    const ratioY = y / Math.max(1, c1.height);
    const mirroredX = 1 - ratioX;
    const pageX = rect.left + (rect.width * mirroredX);
    const pageY = rect.top + (rect.height * ratioY);
    return {
        pageX: pageX,
        pageY: pageY,
        screenX: window.screenX + pageX,
        screenY: window.screenY + pageY
    };
}

function dispatchVirtualPointer(target, type, x, y){
    if(!target) return;
    const event = new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        pointerId: 1,
        pointerType: "mouse",
        buttons: type === "pointerup" ? 0 : 1
    });
    target.dispatchEvent(event);
}

function driveMouseControl(hand, totalHands){
    if(!mouseControlEnabled || !aiEnabled || !hand || !hand.annotations){
        return;
    }

    const indexTip = hand.annotations.indexFinger && hand.annotations.indexFinger[3];
    const thumbTip = hand.annotations.thumb && hand.annotations.thumb[3];
    const palmCenter = hand.landmarks && hand.landmarks[9] ? hand.landmarks[9] : hand.landmarks && hand.landmarks[0];

    if(!indexTip || !thumbTip){
        return;
    }

    const screen = handToScreen(indexTip[0], indexTip[1]);
    const hoverTarget = document.elementFromPoint(screen.pageX, screen.pageY) || document.body;
    const pinchDistance = Math.hypot(indexTip[0] - thumbTip[0], indexTip[1] - thumbTip[1]);
    const pinchThreshold = Math.max(28, c1.width * 0.045);
    const isPinching = pinchDistance < pinchThreshold;

    dispatchVirtualPointer(hoverTarget, "pointermove", screen.pageX, screen.pageY);
    sendMouseBridge({ type: "move", x: Math.round(screen.screenX), y: Math.round(screen.screenY) });

    if(isPinching && !mouseState.active){
        mouseState.active = true;
        mouseState.target = hoverTarget;
        mouseState.lastX = screen.pageX;
        mouseState.lastY = screen.pageY;
        dispatchVirtualPointer(hoverTarget, "pointerdown", screen.pageX, screen.pageY);
        sendMouseBridge({ type: "down", x: Math.round(screen.screenX), y: Math.round(screen.screenY) });
    } else if(isPinching && mouseState.active){
        mouseState.lastX = screen.pageX;
        mouseState.lastY = screen.pageY;
        dispatchVirtualPointer(mouseState.target || hoverTarget, "pointermove", screen.pageX, screen.pageY);
        sendMouseBridge({ type: "move", x: Math.round(screen.screenX), y: Math.round(screen.screenY) });
    } else if(mouseState.active){
        dispatchVirtualPointer(mouseState.target || hoverTarget, "pointerup", screen.pageX, screen.pageY);
        sendMouseBridge({ type: "up", x: Math.round(screen.screenX), y: Math.round(screen.screenY) });
        mouseState.active = false;
        mouseState.target = null;
    }

    // scroll by vertical movement when not pinching
    if(!isPinching && palmCenter){
        const currentY = palmCenter[1];
        if(typeof mouseState.lastY === "number" && mouseState.lastY !== 0){
            const deltaY = currentY - mouseState.lastY;
            if(Math.abs(deltaY) > 8){
                if(mouseBridge.ws && mouseBridge.ws.readyState === 1){
                    sendMouseBridge({ type: "scroll", dy: Math.round(deltaY * 0.9) });
                } else {
                    window.scrollBy({ top: deltaY * 0.9, behavior: "auto" });
                }
            }
        }
        mouseState.lastY = currentY;
    }

    // two-hand zoom demo using distance between centers
    if(totalHands >= 2 && latestMappedResults.length >= 2){
        const a = latestMappedResults[0].boundingBox;
        const b = latestMappedResults[1].boundingBox;
        const ax = (a.topLeft[0] + a.bottomRight[0]) / 2;
        const ay = (a.topLeft[1] + a.bottomRight[1]) / 2;
        const bx = (b.topLeft[0] + b.bottomRight[0]) / 2;
        const by = (b.topLeft[1] + b.bottomRight[1]) / 2;
        const distance = Math.hypot(ax - bx, ay - by);
        if(mouseState.lastDistance){
            const delta = distance / mouseState.lastDistance;
            if(Number.isFinite(delta) && delta > 0.75 && delta < 1.35){
                mouseState.zoomLevel = Math.min(1.4, Math.max(0.8, mouseState.zoomLevel * delta));
                if(mouseBridge.ws && mouseBridge.ws.readyState === 1){
                    sendMouseBridge({ type: "zoom", scale: mouseState.zoomLevel });
                } else {
                    document.body.style.zoom = String(mouseState.zoomLevel);
                }
            }
        }
        mouseState.lastDistance = distance;
    } else {
        mouseState.lastDistance = null;
    }
}

function setBorder(color) {
    ctx1.beginPath();
    ctx1.strokeStyle = color;
    ctx1.lineWidth = 2;
    ctx1.rect(border / 2, border / 2, c1.width - border, c1.height - border);
    ctx1.stroke();
    ctx1.beginPath();
}

function classifySign(hand){
    const L = hand.landmarks;
    if(!L || L.length < 21) return "Unknown";
    const dist = (a, b) => Math.hypot(L[a][0] - L[b][0], L[a][1] - L[b][1]);
    const indexUp = L[8][1] < L[6][1];
    const middleUp = L[12][1] < L[10][1];
    const ringUp = L[16][1] < L[14][1];
    const pinkyUp = L[20][1] < L[18][1];
    const thumbUp = L[4][1] < L[3][1] && L[4][1] < L[2][1];
    const thumbDown = L[4][1] > L[3][1] && L[4][1] > L[2][1];

    const thumbIndexDist = dist(4, 8);
    const palmScale = Math.max(1, dist(0, 9));

    // specific signs first
    if(thumbIndexDist < palmScale * 0.45 && middleUp && ringUp && pinkyUp) return "OK";
    if(indexUp && !middleUp && !ringUp && !pinkyUp && !thumbUp && !thumbDown) return "Point Up";
    if(indexUp && !middleUp && !ringUp && pinkyUp) return "Rock";
    if(thumbUp && !indexUp && !middleUp && !ringUp && pinkyUp) return "Call Me";
    if(indexUp && middleUp && ringUp && !pinkyUp) return "Three";

    const openCount = [indexUp, middleUp, ringUp, pinkyUp, thumbUp].filter(Boolean).length;
    if(openCount >= 4) return "Open Palm";
    if(!indexUp && !middleUp && !ringUp && !pinkyUp && !thumbUp) return "Fist";
    if(indexUp && middleUp && !ringUp && !pinkyUp) return "Peace";
    if(thumbUp && !indexUp && !middleUp && !ringUp && !pinkyUp) return "Thumbs Up";
    if(thumbDown && !indexUp && !middleUp && !ringUp && !pinkyUp) return "Bad (Thumbs Down)";
    return "Unknown";
}

// Small heuristics for alphabet-like static signs
function classifyAlphabet(hand){
    const L = hand.landmarks;
    if(!L || L.length < 21) return null;
    const dist = (a, b) => Math.hypot(L[a][0] - L[b][0], L[a][1] - L[b][1]);
    const indexUp = L[8][1] < L[6][1];
    const middleUp = L[12][1] < L[10][1];
    const ringUp = L[16][1] < L[14][1];
    const pinkyUp = L[20][1] < L[18][1];
    const thumbUp = L[4][1] < L[3][1] && L[4][1] < L[2][1];
    const openCount = [indexUp, middleUp, ringUp, pinkyUp, thumbUp].filter(Boolean).length;

    // A -> fist
    if(!indexUp && !middleUp && !ringUp && !pinkyUp) return 'A';
    // B -> palm open and fingers together (approx by many fingers up)
    if(openCount >= 4 && !thumbUp) return 'B';
    // L -> index + thumb
    if(indexUp && thumbUp && !middleUp && !ringUp && !pinkyUp) return 'L';
    // Y -> thumb + pinky
    if(thumbUp && pinkyUp && !indexUp && !middleUp && !ringUp) return 'Y';
    return null;
}

function classifyTwoHands(results){
    if(!results || results.length < 2) return null;
    const a = results[0];
    const b = results[1];
    if(!a.boundingBox || !b.boundingBox) return null;
    const ax = (a.boundingBox.topLeft[0] + a.boundingBox.bottomRight[0]) / 2;
    const ay = (a.boundingBox.topLeft[1] + a.boundingBox.bottomRight[1]) / 2;
    const bx = (b.boundingBox.topLeft[0] + b.boundingBox.bottomRight[0]) / 2;
    const by = (b.boundingBox.topLeft[1] + b.boundingBox.bottomRight[1]) / 2;
    const d = Math.hypot(ax - bx, ay - by);
    const size = Math.max(a.boundingBox.bottomRight[0] - a.boundingBox.topLeft[0], b.boundingBox.bottomRight[0] - b.boundingBox.topLeft[0]);
    // Clap / Together when both palms open and close together
    const aplen = (a.landmarks && a.landmarks.length) ? Math.abs(a.boundingBox.bottomRight[0] - a.boundingBox.topLeft[0]) : 0;
    if(d < Math.max(60, size * 1.2)) return 'Clap / Together';
    // Hands above head-ish -> Hands Up
    if(a.boundingBox.topLeft[1] < c1.height * 0.3 && b.boundingBox.topLeft[1] < c1.height * 0.3) return 'Both Hands Up';
    return null;
}

function detectHiBye(hand){
    const L = hand.landmarks;
    if(!L || L.length < 1) return null;
    const now = Date.now();
    waveHistory.push({ x: L[0][0], t: now });
    if(waveHistory.length > 14) waveHistory.shift();
    if(waveHistory.length < 8) return null;

    const xs = waveHistory.map(p => p.x);
    const amp = Math.max(...xs) - Math.min(...xs);
    let dirChanges = 0;
    let lastDx = 0;
    for(let i = 1; i < waveHistory.length; i++){
        const dx = waveHistory[i].x - waveHistory[i - 1].x;
        if(Math.abs(dx) < 3) continue;
        if(lastDx !== 0 && (dx > 0) !== (lastDx > 0)) dirChanges++;
        lastDx = dx;
    }

    if(amp > Math.max(40, c1.width * 0.08) && dirChanges >= 3 && (now - lastWaveEmit) > 900){
        lastWaveEmit = now;
        return lastDx >= 0 ? "Hi" : "Bye";
    }
    return null;
}

function ai() {
    if(mpReady && mpHands){
        if(mpBusy) return;
        mpBusy = true;
        mpHands.send({ image: c1 }).then(() => {
            renderHands(latestMappedResults);
            mpBusy = false;
        }).catch(() => {
            mpBusy = false;
        });
        return;
    }

    if(handpose){
        handpose.predict(c1, results => {
            renderHands(results || []);
        });
    }
}

function renderHands(results){
    document.getElementById("handCount").innerText = String(results.length);
    setBorder("rgba(250, 204, 21, 0.95)");
    let shownSign = "Unknown";

    if(mouseControlEnabled && !results.length){
        releaseMousePointer();
    }

    if(ctxLabels){ ctxLabels.clearRect(0,0,labelsCanvas.width, labelsCanvas.height); ctxLabels.font = "600 14px Outfit, sans-serif"; ctxLabels.textBaseline = 'top'; }

    // sort results by visual X (consider canvas mirroring) so Hand 1 is left-most on screen
    const prepared = results.map((el, idx) => {
        const cx = (el.boundingBox.topLeft[0] + el.boundingBox.bottomRight[0]) / 2;
        const screenX = (c1.classList && c1.classList.contains('mirror')) ? (c1.width - cx) : cx;
        return { el, idx, screenX };
    }).sort((a,b) => a.screenX - b.screenX);

    for (let k = 0; k < prepared.length; k++) {
        const element = prepared[k].el;
        const index = prepared[k].idx; // original index
        if(!element || !element.boundingBox || !element.annotations) continue;

        ctx1.beginPath();
        ctx1.strokeStyle = k === 0 ? "#10b981" : "#38bdf8";
        ctx1.lineWidth = 3;
        ctx1.rect(
            element.boundingBox.topLeft[0],
            element.boundingBox.topLeft[1],
            element.boundingBox.bottomRight[0] - element.boundingBox.topLeft[0],
            element.boundingBox.bottomRight[1] - element.boundingBox.topLeft[1]
        );
        ctx1.stroke();

        // draw finger skeleton on main canvas (mirrored by CSS)
        ctx1.beginPath();
        ctx1.strokeStyle = k === 0 ? "#f43f5e" : "#f97316";
        ctx1.lineWidth = 3;
        drawFingerLines(element.annotations.thumb);
        drawFingerLines(element.annotations.indexFinger);
        drawFingerLines(element.annotations.middleFinger);
        drawFingerLines(element.annotations.ringFinger);
        drawFingerLines(element.annotations.pinky);
        ctx1.stroke();

        // draw centroid pointer / fake mouse from middle finger of the visually-first hand
        const indexTip = element.annotations.indexFinger && element.annotations.indexFinger[3];
        if(indexTip && aiEnabled && mouseControlEnabled && k === 0){
            let x = (indexTip[0] - border / 2) / (c1.width - border);
            let y = (indexTip[1] - border / 2) / (c1.height - border);
            setFakeMouse(x, y);
            driveMouseControl(element, results.length);
        } else if(indexTip && aiEnabled && mouseControlEnabled && k === 0){
            driveMouseControl(element, results.length);
        }

        // draw landmarks
        const landmarks = element.landmarks || [];
        for (let i = 0; i < landmarks.length; i++) {
            ctx1.beginPath();
            ctx1.strokeStyle = "#2563eb";
            const ele = landmarks[i];
            ctx1.arc(ele[0], ele[1], 2, 0, 2 * Math.PI);
            ctx1.fillStyle = "#2563eb";
            ctx1.fill();
            ctx1.stroke();
        }

        // draw readable label on labels canvas (not mirrored via CSS)
        if(ctxLabels){
            const labelText = `Hand ${k + 1}`;
            const labelX = prepared[k].screenX - (element.boundingBox.bottomRight[0] - element.boundingBox.topLeft[0]) / 2;
            const labelY = Math.max(4, element.boundingBox.topLeft[1] - 18);
            ctxLabels.fillStyle = k === 0 ? "#10b981" : "#38bdf8";
            ctxLabels.fillText(labelText, labelX + 6, labelY);
        }

        // classify single-hand signs for the visually-first hand
        if(signEnabled && k === 0){
            const alpha = classifyAlphabet(element);
            if(alpha) shownSign = alpha; else shownSign = classifySign(element);
        }
    }

    // two-hand gestures
    if(signEnabled && results.length >= 2){
        const two = classifyTwoHands(results);
        if(two) shownSign = two;
    }

    if(signEnabled){
        const motionGesture = results.length ? detectHiBye(results[0]) : null;
        document.getElementById("signLabel").innerText = motionGesture || shownSign;
    } else {
        waveHistory = [];
    }
}

function drawFingerLines(points){
    if(!points || !points.length) return;
    ctx1.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
        const ele = points[i];
        ctx1.lineTo(ele[0], ele[1]);
        ctx1.moveTo(ele[0], ele[1]);
    }
}

function mapMediapipeResults(mpResult){
    const landmarksList = (mpResult && mpResult.multiHandLandmarks) || [];
    const mapped = [];

    for(let h = 0; h < landmarksList.length; h++){
        const handLm = landmarksList[h];
        const landmarks = handLm.map(pt => [pt.x * c1.width, pt.y * c1.height, pt.z || 0]);
        const xs = landmarks.map(p => p[0]);
        const ys = landmarks.map(p => p[1]);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minY = Math.min(...ys), maxY = Math.max(...ys);
        mapped.push({
            boundingBox: {
                topLeft: [minX, minY],
                bottomRight: [maxX, maxY]
            },
            landmarks: landmarks,
            annotations: {
                thumb: [landmarks[1], landmarks[2], landmarks[3], landmarks[4]],
                indexFinger: [landmarks[5], landmarks[6], landmarks[7], landmarks[8]],
                middleFinger: [landmarks[9], landmarks[10], landmarks[11], landmarks[12]],
                ringFinger: [landmarks[13], landmarks[14], landmarks[15], landmarks[16]],
                pinky: [landmarks[17], landmarks[18], landmarks[19], landmarks[20]],
                palmBase: [landmarks[0]]
            }
        });
    }

    return mapped;
}