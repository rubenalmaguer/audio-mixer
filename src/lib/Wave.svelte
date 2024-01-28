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
  } from "./AudioDownloader.js";

  let bgWave;
  let silentWave;
  let regions;
  let activeRegion;
  let activeAudio;
  let envelope;
  let currentVolume;
  let playButton;
  let audioElement;
  let audios;
  $: {
    audios = [audioElement];
  }

  $: {
    if (activeRegion && audios) {
      activeAudio = audios.find(
        (audio) => audio?.dataset?.regionId === activeRegion.id
      );
    }
  }

  onMount(async () => {
    audioElement.src = VOICE_FILE;

    setupBackgroundWave();

    bgWave.on("decode", (duration) => {
      setupSilentWave(duration);
      silentWave.on("decode", () => {
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
        lineWidth: "4px",
        dragPointSize: isMobile ? 20 : 12,
        dragLine: !isMobile,
        dragPointFill: "rgba(0, 255, 255, 0.8)",
        dragPointStroke: "rgba(0, 0, 0, 0.5)",

        points: [
          { time: 0.2, volume: 0.7 },
          { time: 0.4, volume: 0.1 },
        ],
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
    });
    bgWave.on("pause", () => {
      playButton.textContent = "Play";
    });

    bgWave.on("timeupdate", (currentTime) => {
      silentWave.setTime(currentTime);
      if (activeAudio) {
        activeAudio.currentTime =
          activeAudio.currentTime + activeAudio.dataset.startTime;
        if (bgWave.isPlaying) {
          activeAudio.play();
        } else {
          activeAudio.pause();
        }
      }
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
  }

  function setupRegions() {
    regions = silentWave.registerPlugin(RegionsPlugin.create());
    audios.forEach(addRegion);

    /*     regions.enableDragSelection({
      color: "rgba(255, 0, 0, 0.1)",
    }); */

    regions.on("region-in", (region) => {
      console.log("region-in", region);
      activeRegion = region;
      /*         const audios = [...document.querySelectorAll("audio")];
      audios
        .find((audio) => audio.dataset.regionId === activeRegion.id)
        .play(); */
    });
    regions.on("region-out", (region) => {
      console.log("region-out", region);
      if (activeRegion === region) {
        activeRegion = null;
      }
    });
    regions.on("region-clicked", (region, e) => {
      e.stopPropagation(); // prevent triggering a click on the waveform
      activeRegion = region;
      //region.play();
      region.setOptions({ color: randomColor() });
    });
    // Reset the active region when the user clicks anywhere in the waveform
    regions.on("interaction", () => {
      activeRegion = null;
    });

    regions.on("region-updated", (region) => {
      console.log("Updated region", region);
    });
  }

  function addRegion(audio) {
    const innerDiv = document.createElement("div");
    innerDiv.style.border = "black 2px solid";
    innerDiv.style.borderRadius = "6px";
    innerDiv.style.borderColor = randomColor();

    const newRegion = regions.addRegion({
      start: 1,
      end: audio.duration,
      content: innerDiv,
      color: randomColor(),
      minLength: 0.5,
      drag: true,
      resize: false,
    });

    audio.dataset.regionId = newRegion.id;
    audio.dataset.startTime = newRegion.start;

    console.log(newRegion);

    // Inception Wave
    WaveSurfer.create({
      interact: false,
      height: VOICE_WAVE_HEIGHT,
      container: innerDiv,
      cursorColor: "tranparent",
      waveColor: "#4F4A85",
      progressColor: "#383351",
      url: VOICE_FILE,
      sampleRate: 44100, // Default is only 8000!, consider 48000Hz
    });
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
