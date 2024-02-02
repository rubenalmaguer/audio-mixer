<script>
  const VOICE_WAVE_HEIGHT = 50;

  const BACKGROUND_FILE =
    "https://upload.wikimedia.org/wikipedia/commons/0/07/360%C2%B0_video.wav";
  const VOICE_FILE =
    "https://upload.wikimedia.org/wikipedia/commons/f/f7/1AX_California_A_Express_Inbound_Route_Announcement.wav";

  import { onMount } from "svelte";
  import WaveSurfer from "wavesurfer.js"; // OR from  "https://unpkg.com/wavesurfer.js@7/dist/wavesurfer.esm.js";
  import EnvelopePlugin from "wavesurfer.js/dist/plugins/envelope.js"; // OR from "https://unpkg.com/wavesurfer.js@7/dist/plugins/envelope.js";
  import RegionsPlugin from "wavesurfer.js/dist/plugins/regions.js";
  import Timeline from "wavesurfer.js/dist/plugins/timeline.js";

  import {
    downloadAudio,
    gradualVolumeChange,
    applyEnevelopePoints,
    createSilence,
  } from "./audio-utilities.js";

  let bgWave;
  let silentWave;
  let regions;
  let singleRegions = [];
  let envelope;
  let currentVolume;
  let playButton;
  let audioElement;
  let audioElement2;
  let audios;
  $: {
    audios = [audioElement, audioElement2];
  }
  let miniWaves = [];

  onMount(async () => {
    audioElement.src = VOICE_FILE;
    audioElement2.src = VOICE_FILE;

    setupBackgroundWave();

    bgWave.once("decode", (duration) => {
      setupSilentWave(duration);
      silentWave.once("decode", () => {
        setupRegions();
      });
    });
  });

  async function setupBackgroundWave() {
    bgWave = WaveSurfer.create({
      container: "#bg-wave-container",
      waveColor: "#4F4A85",
      progressColor: "#383351",
      url: BACKGROUND_FILE,
      sampleRate: 44100, // Default is only 8000!, consider 48000Hz
    });

    const isMobile = top.matchMedia("(max-width: 900px)").matches;

    // Initialize the Envelope plugin
    envelope = bgWave.registerPlugin(
      EnvelopePlugin.create({
        volume: 0.8,
        lineColor: "rgba(255, 0, 0, 0.5)",
        lineWidth: "4",
        dragPointSize: isMobile ? 20 : 12,
        dragLine: !isMobile,
        dragPointFill: "rgba(0, 255, 255, 0.8)",
        dragPointStroke: "rgba(0, 0, 0, 0.5)",
      })
    );

    envelope.on("points-change", (points) => {
      //console.log("Envelope points changed", points);
    });

    envelope.addPoint({ time: 0.7, volume: 0.9 });

    // Show the current volume
    const showVolume = () => {
      currentVolume = envelope.getCurrentVolume().toFixed(2);
    };
    envelope.on("volume-change", showVolume);
    bgWave.on("ready", showVolume);

    // Play/pause button
    bgWave.once("ready", () => {
      playButton.onclick = () => {
        bgWave.playPause();
      };
    });
    bgWave.on("play", () => {
      playButton.textContent = "Pause";
      audios.forEach((a) => (a.style.pointerEvents = "none"));
    });
    bgWave.on("pause", () => {
      playButton.textContent = "Play";
      audios.forEach((a) => (a.style.pointerEvents = ""));
    });

    bgWave.on("timeupdate", (currentTime) => {
      // Sync background with silent (regions) wave.
      silentWave.setTime(currentTime);
    });
  }

  function setupSilentWave(duration) {
    const silenceUrl = createSilence(duration);

    silentWave = WaveSurfer.create({
      height: VOICE_WAVE_HEIGHT,
      container: "#reg-wave-container",
      waveColor: "#4F4A85",
      progressColor: "#383351",
      url: silenceUrl /*media: vid,*/,
      interact: false,
      plugins: [
        Timeline.create({
          height: 16,
          timeInterval: 2.5,
          primaryLabelInterval: 10,
          style: {
            fontSize: "8px",
            color: "#6A3274",
          },
        }),
      ],
    });

    silentWave.on("seeking", (currentTime) => {
      // Seeking triggers while playing

      if (bgWave.isPlaying() === false) {
        audios.forEach((a) => a.pause());
        return;
      }

      // It IS playing!
      const activeRegions = [];
      singleRegions.forEach((region) => {
        if (region.start > currentTime || region.end < currentTime) return;
        activeRegions.push(region);
      });

      if (!activeRegions.length) {
        // Seeked to inactive area
        audios.forEach((a) => a.pause());
        return;
      }

      activeRegions.forEach((activeRegion) => {
        const audio = audios.find(
          (a) => a.dataset.regionId === activeRegion.id
        );
        /* console.log(audio.paused); */
        audio.playbackRate = 1; // Force playback rate (TODO: allow it for WIP, but then get re-rendered audio before downloading mix). See: HTMLMediaElement.preservesPitch

        const targetTime = currentTime - activeRegion.start;
        const wiggleRoom = 0.1;

        if (Math.abs(targetTime - audio.currentTime) > wiggleRoom) {
          audio.currentTime = targetTime;
        }

        if (audio.paused) audio.play();
      });
    });
  }

  function setupRegions() {
    regions = silentWave.registerPlugin(RegionsPlugin.create());
    audios.forEach(addRegion);

    /*     regions.enableDragSelection({
      color: "rgba(255, 0, 0, 0.1)",
    }); */

    regions.on("region-in", (region) => {
      console.log("region-in", region.id);
      console.log("you are here", bgWave.getCurrentTime());
    });
    regions.on("region-out", (region) => {
      console.log("region-out", region.id);
    });
    regions.on("region-clicked", (region, e) => {
      e.stopPropagation(); // prevent triggering a click on the waveform
      //region.play();
      /* let color = randomColor();
      console.log("color: ", color); */
      let color =
        "rgba(40.044185605872244, 200.00341532174974, 152.20057365218236, 0.5)";
      region.setOptions({ color: color });
    });
    // Reset the active region when the user clicks anywhere in the waveform
    regions.on("interaction", () => {});

    regions.on("region-updated", (region) => {
      // Undo default "avoidOverlapping"
      // See: https://github.com/katspaugh/wavesurfer.js/blob/main/src/plugins/regions.ts
      region.content.style.marginTop = "0";
    });
  }

  function addRegion(audio, i) {
    const innerDiv = document.createElement("div");
    innerDiv.style.border = "black 2px solid";
    innerDiv.style.borderRadius = "6px";
    innerDiv.style.borderColor = "steelblue";

    const newRegion = regions.addRegion({
      start: (i + 1) * 1.5,
      end: (i + 1) * 1.5 + audio.duration,
      content: innerDiv,
      color: randomColor(),
      minLength: 0.5,
      drag: true,
      resize: false,
    });

    // Undo default "avoidOverlapping"
    // See: https://github.com/katspaugh/wavesurfer.js/blob/main/src/plugins/regions.ts
    newRegion.content.style.marginTop = "0";
    singleRegions.push(newRegion);

    audio.dataset.regionId = newRegion.id;

    // Inception Wave
    const miniWave = WaveSurfer.create({
      interact: false,
      height: VOICE_WAVE_HEIGHT,
      container: innerDiv,
      cursorColor: "tranparent",
      waveColor: "#4F4A85",
      progressColor: "#383351",
      url: VOICE_FILE,
      sampleRate: 44100, // Default is only 8000!, consider 48000Hz
    });

    miniWaves.push(miniWave);
  }

  function randomizePoints() {
    const points = [];
    const len = 5 * Math.random();
    for (let i = 0; i < len; i++) {
      points.push({
        time: Math.random() * bgWave.getDuration(),
        volume: Math.random(),
      });
    }
    envelope.setPoints(points);
  }

  function download() {
    const decoded = bgWave.getDecodedData();
    //downloadAudio(decoded); // Download original
    const ramped = gradualVolumeChange(decoded);
    //downloadAudio(ramped); // Download constant fade-in
    const enveloped = applyEnevelopePoints(decoded, envelope.getPoints());
    downloadAudio(enveloped); // Download result from envelope UI
  }

  function randomColor() {
    const random = (min, max) => Math.random() * (max - min) + min;
    return `rgba(${random(0, 255)}, ${random(0, 255)}, ${random(0, 255)}, 0.5)`;
  }
</script>

<button bind:this={playButton} style="min-width: 5em" id="play">Play</button>
<button on:click={randomizePoints} style="margin: 0 1em 2em" id="randomize"
  >Randomize points</button
>

Volume: <span>{currentVolume}</span>

<button on:click={download} style="margin: 0 1em 2em" id="randomize"
  >Download</button
>

<div style="border: 1px solid #ddd;">
  <div id="bg-wave-container"></div>
  <div id="reg-wave-container"></div>
</div>

<audio bind:this={audioElement} controls></audio>
<audio bind:this={audioElement2} controls></audio>

<style>
  :global(#bg-wave-container ::part(cursor)) {
    height: 100px;
    top: 28px;
    border-radius: 4px;
    border: 1px solid #fff;
  }

  :global(#bg-wave-container ::part(cursor):before) {
    content: "▼";
    font-size: 1.5em;
    position: absolute;
    left: 0;
    top: -28px;
    transform: translateX(-50%);
  }
</style>
