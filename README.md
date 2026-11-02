# PostureAI

A small browser-based posture demonstration using MediaPipe Pose Landmarker.

## Run
1. Extract the ZIP.
2. Open the `posture_project` folder in VS Code.
3. Use the Live Server extension to open `index.html`.
4. Allow camera access and click **Start Camera**.

Keep your head, shoulders and hips visible in the camera frame and use a steady, front-facing camera view. This is a school-project demonstration, not a medical posture assessment. A front-facing 2D camera cannot reliably measure all forms of forward-back slouching; the simple rules estimate head drop, body shift and shoulder tilt. The beep plays after five continuous seconds labelled as slouching.

The AI model and MediaPipe runtime load from the internet, so an internet connection is required.
