export function downloadAudio(audioBuffer) {
  // What about MONO??
  // Float32Array samples
  const [left, right] = [
    audioBuffer.getChannelData(0),
    audioBuffer.getChannelData(1),
  ];

  // interleaved
  const interleaved = new Float32Array(left.length + right.length);
  for (let src = 0, dst = 0; src < left.length; src++, dst += 2) {
    interleaved[dst] = left[src];
    interleaved[dst + 1] = right[src];
  }

  // get WAV file bytes and audio params of your audio source
  const wavBytes = getWavBytes(interleaved.buffer, {
    isFloat: true, // floating point or 16-bit integer
    numChannels: audioBuffer.numberOfChannels,
    sampleRate: audioBuffer.sampleRate,
  });
  const wav = new Blob([wavBytes], { type: "audio/wav" });

  // create download link and append to Dom
  const downloadLink = document.createElement("a");
  downloadLink.href = URL.createObjectURL(wav);
  downloadLink.setAttribute("download", "my-audio.wav"); // name file
  downloadLink.click();

  return downloadLink;

  //////////////////////////////////

  // Returns Uint8Array of WAV bytes
  function getWavBytes(buffer, options) {
    const type = options.isFloat ? Float32Array : Uint16Array;
    const numFrames = buffer.byteLength / type.BYTES_PER_ELEMENT;

    const headerBytes = getWavHeader(Object.assign({}, options, { numFrames }));
    const wavBytes = new Uint8Array(headerBytes.length + buffer.byteLength);

    // prepend header, then add pcmBytes
    wavBytes.set(headerBytes, 0);
    wavBytes.set(new Uint8Array(buffer), headerBytes.length);

    return wavBytes;
  }

  // adapted from https://gist.github.com/also/900023
  // returns Uint8Array of WAV header bytes
  function getWavHeader(options) {
    const numFrames = options.numFrames;
    const numChannels = options.numChannels || 2;
    const sampleRate = options.sampleRate || 44100;
    const bytesPerSample = options.isFloat ? 4 : 2;
    const format = options.isFloat ? 3 : 1;

    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = numFrames * blockAlign;

    const buffer = new ArrayBuffer(44);
    const dv = new DataView(buffer);

    let p = 0;

    function writeString(s) {
      for (let i = 0; i < s.length; i++) {
        dv.setUint8(p + i, s.charCodeAt(i));
      }
      p += s.length;
    }

    function writeUint32(d) {
      dv.setUint32(p, d, true);
      p += 4;
    }

    function writeUint16(d) {
      dv.setUint16(p, d, true);
      p += 2;
    }

    writeString("RIFF"); // ChunkID
    writeUint32(dataSize + 36); // ChunkSize
    writeString("WAVE"); // Format
    writeString("fmt "); // Subchunk1ID
    writeUint32(16); // Subchunk1Size
    writeUint16(format); // AudioFormat https://i.stack.imgur.com/BuSmb.png
    writeUint16(numChannels); // NumChannels
    writeUint32(sampleRate); // SampleRate
    writeUint32(byteRate); // ByteRate
    writeUint16(blockAlign); // BlockAlign
    writeUint16(bytesPerSample * 8); // BitsPerSample
    writeString("data"); // Subchunk2ID
    writeUint32(dataSize); // Subchunk2Size

    return new Uint8Array(buffer);
  }
}

export function gradualVolumeChange(audioBuffer) {
  const numberOfChannels = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;

  // Create a copy of the input audio buffer
  const audioContext = new AudioContext();
  const modifiedBuffer = audioContext.createBuffer(
    numberOfChannels,
    length,
    audioBuffer.sampleRate
  );

  for (let channel = 0; channel < numberOfChannels; channel++) {
    const inputChannelData = audioBuffer.getChannelData(channel);
    const outputChannelData = modifiedBuffer.getChannelData(channel);

    for (let i = 0; i < length; i++) {
      // Calculate the linear ramp from 0 to 1
      const volume = i / (length - 1);

      // Apply the volume ramp to each sample
      outputChannelData[i] = inputChannelData[i] * volume;
    }
  }

  return modifiedBuffer;
}

export function applyEnevelopePoints(audioBuffer, points) {
  const { numberOfChannels, length, sampleRate } = audioBuffer;
  const duration = length / sampleRate;

  // Copy the input audio buffer
  const audioContext = new AudioContext();
  const modifiedBuffer = audioContext.createBuffer(
    numberOfChannels,
    length,
    sampleRate
  );

  // Each channel
  for (let channel = 0; channel < numberOfChannels; channel++) {
    const inputChannelData = audioBuffer.getChannelData(channel);
    const outputChannelData = modifiedBuffer.getChannelData(channel);

    // Each sample
    for (let sampleIndex = 0; sampleIndex < length; sampleIndex++) {
      // Get relevant data
      const currentTimeInSeconds = sampleIndex / sampleRate;
      let nextPoint = points.find((p) => p.time > currentTimeInSeconds);
      if (!nextPoint) {
        nextPoint = { time: duration ?? 0, volume: 0 };
      }
      let prevPoint = points.findLast((p) => p.time <= currentTimeInSeconds);
      if (!prevPoint) {
        prevPoint = { time: 0, volume: 0 };
      }

      // Calculate applicable volume
      const timeDiff = nextPoint.time - prevPoint.time;
      const volumeDiff = nextPoint.volume - prevPoint.volume;
      const newVolume =
        prevPoint.volume +
        (currentTimeInSeconds - prevPoint.time) * (volumeDiff / timeDiff);
      const clampedVolume = Math.min(1, Math.max(0, newVolume));
      const roundedVolume = Math.round(clampedVolume * 100) / 100;

      // Apply the volume to each sample
      outputChannelData[sampleIndex] =
        inputChannelData[sampleIndex] * roundedVolume;
    }
  }

  return modifiedBuffer;
}

export function createSilence(seconds = 1) {
  const sampleRate = 8000;
  const numChannels = 1;
  const bitsPerSample = 8;

  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = Math.ceil(seconds * sampleRate) * blockAlign;
  const chunkSize = 36 + dataSize;
  const byteLength = 8 + chunkSize;

  const buffer = new ArrayBuffer(byteLength);
  const view = new DataView(buffer);

  view.setUint32(0, 0x52494646, false); // Chunk ID 'RIFF'
  view.setUint32(4, chunkSize, true); // File size
  view.setUint32(8, 0x57415645, false); // Format 'WAVE'
  view.setUint32(12, 0x666d7420, false); // Sub-chunk 1 ID 'fmt '
  view.setUint32(16, 16, true); // Sub-chunk 1 size
  view.setUint16(20, 1, true); // Audio format
  view.setUint16(22, numChannels, true); // Number of channels
  view.setUint32(24, sampleRate, true); // Sample rate
  view.setUint32(28, byteRate, true); // Byte rate
  view.setUint16(32, blockAlign, true); // Block align
  view.setUint16(34, bitsPerSample, true); // Bits per sample
  view.setUint32(36, 0x64617461, false); // Sub-chunk 2 ID 'data'
  view.setUint32(40, dataSize, true); // Sub-chunk 2 size

  for (let offset = 44; offset < byteLength; offset++) {
    view.setUint8(offset, 128);
  }

  const blob = new Blob([view], { type: "audio/wav" });
  const url = URL.createObjectURL(blob);

  return url;
}
