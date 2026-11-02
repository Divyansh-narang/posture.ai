import { FilesetResolver, PoseLandmarker, DrawingUtils } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const postureEl = document.getElementById('posture');
const scoreEl = document.getElementById('score');
const tipEl = document.getElementById('tip');
const fill = document.getElementById('fill');
const goodEl = document.getElementById('good');
const poorEl = document.getElementById('poor');
const corrEl = document.getElementById('corr');
const voice = document.getElementById('voice');
const msg = document.getElementById('msg');

let pose, stream, running = false, anim, stats;
let good = 0, poor = 0, corrections = 0, previousPosture = '';
let slouchStarted = null, warningPlayed = false, audioContext;
let recentLabels = [];

async function loadPose() {
  const vision = await FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm');
  pose = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task' },
    runningMode: 'VIDEO', numPoses: 1
  });
}

function beep() {
  try {
    audioContext ||= new AudioContext();
    if (audioContext.state === 'suspended') audioContext.resume();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.connect(gain); gain.connect(audioContext.destination);
    oscillator.frequency.value = 880;
    gain.gain.value = 0.18;
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.35);
  } catch (error) {
    msg.textContent = 'Warning sound could not play. Check browser sound settings.';
  }
}

function speak(text) {
  if (!voice.checked || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}

function analyze(lm) {
  const nose = lm[0], leftShoulder = lm[11], rightShoulder = lm[12];
  const leftHip = lm[23], rightHip = lm[24];
  const points = [nose, leftShoulder, rightShoulder, leftHip, rightHip];
  if (!points.every(p => p && (p.visibility ?? 1) > 0.5)) return;

  const shoulderX = (leftShoulder.x + rightShoulder.x) / 2;
  const shoulderY = (leftShoulder.y + rightShoulder.y) / 2;
  const hipX = (leftHip.x + rightHip.x) / 2;
  const hipY = (leftHip.y + rightHip.y) / 2;
  const bodyHeight = Math.max(0.12, Math.abs(hipY - shoulderY));

  // Front-camera-friendly cues: head dropping toward shoulders, body shifted sideways,
  // and uneven shoulders. A front camera cannot reliably measure forward-back curvature.
  const headLift = (shoulderY - nose.y) / bodyHeight;
  const torsoLean = Math.abs(shoulderX - hipX) / bodyHeight;
  const shoulderTilt = Math.abs(leftShoulder.y - rightShoulder.y) / bodyHeight;

  let rawLabel = 'GOOD POSTURE';
  if (headLift < 0.34) rawLabel = 'SLOUCHING';
  else if (torsoLean > 0.22 || shoulderTilt > 0.20) rawLabel = 'LEANING';

  recentLabels.push(rawLabel);
  if (recentLabels.length > 7) recentLabels.shift();
  const counts = recentLabels.reduce((a, label) => (a[label] = (a[label] || 0) + 1, a), {});
  const label = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];

  let tip = 'Nice! Sit comfortably and keep your head level.';
  if (label === 'SLOUCHING') tip = 'Lift your head and sit upright.';
  if (label === 'LEANING') tip = 'Center your body and keep both shoulders level.';

  const score = Math.max(0, Math.min(100, Math.round(
    100 - Math.max(0, 0.55 - headLift) * 95 - torsoLean * 75 - shoulderTilt * 45
  )));
  postureEl.textContent = label;
  scoreEl.textContent = score;
  tipEl.textContent = tip;
  fill.style.width = score + '%';

  if (previousPosture && previousPosture !== 'GOOD POSTURE' && label === 'GOOD POSTURE') {
    corrections++;
    corrEl.textContent = corrections;
  }
  previousPosture = label;

  if (label === 'SLOUCHING') {
    if (slouchStarted === null) slouchStarted = Date.now();
    if (!warningPlayed && Date.now() - slouchStarted >= 5000) {
      beep();
      speak('Please lift your head and sit upright.');
      msg.textContent = 'Warning: slouching detected for 5 seconds.';
      warningPlayed = true;
    }
  } else {
    slouchStarted = null;
    warningPlayed = false;
    if (label === 'GOOD POSTURE') msg.textContent = ' '; 
  }
}

function draw(result) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!result.landmarks.length) {
    postureEl.textContent = 'NO PERSON DETECTED';
    tipEl.textContent = 'Move back into view and show your head, shoulders and hips.';
    slouchStarted = null;
    warningPlayed = false;
    recentLabels = [];
    return;
  }
  const drawing = new DrawingUtils(ctx);
  for (const landmarks of result.landmarks) {
    drawing.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS);
    drawing.drawLandmarks(landmarks);
    analyze(landmarks);
  }
}

function predict() {
  if (!running) return;
  if (video.readyState >= 2 && pose) draw(pose.detectForVideo(video, performance.now()));
  anim = requestAnimationFrame(predict);
}

startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  msg.textContent = 'Loading camera and AI model…';
  try {
    if (!pose) await loadPose();
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    video.srcObject = stream;
    await video.play();
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    recentLabels = [];
    running = true;
    msg.textContent = 'Camera running. Keep your head, shoulders and hips visible. Beep after 5 seconds of slouching.';
    predict();
    clearInterval(stats);
    stats = setInterval(() => {
      if (postureEl.textContent === 'GOOD POSTURE') good++;
      else if (!['NO PERSON DETECTED', 'CAMERA STOPPED'].includes(postureEl.textContent)) poor++;
      goodEl.textContent = good;
      poorEl.textContent = poor;
    }, 1000);
  } catch (error) {
    console.error(error);
    msg.textContent = 'Could not start. Allow camera access and check your internet connection.';
    if (stream) stream.getTracks().forEach(track => track.stop());
    stream = null;
  } finally {
    startBtn.disabled = false;
  }
});

stopBtn.addEventListener('click', () => {
  running = false;
  cancelAnimationFrame(anim);
  clearInterval(stats);
  if (stream) stream.getTracks().forEach(track => track.stop());
  stream = null;
  video.srcObject = null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  good = poor = corrections = 0;
  goodEl.textContent = poorEl.textContent = corrEl.textContent = '0';
  scoreEl.textContent = '0';
  fill.style.width = '0%';
  postureEl.textContent = 'CAMERA STOPPED';
  tipEl.textContent = 'Click Start Camera to begin again.';
  msg.textContent = '';
  previousPosture = '';
  slouchStarted = null;
  warningPlayed = false;
  recentLabels = [];
  if ('speechSynthesis' in window) speechSynthesis.cancel();
});
