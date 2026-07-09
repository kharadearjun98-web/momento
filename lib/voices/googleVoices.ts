// Voice profiles for podcast hosts
export interface VoiceConfig {
  name: string;
  personality: string;
  voice: {
    languageCode: string;
    name: string;
    ssmlGender: 'MALE' | 'FEMALE' | 'NEUTRAL';
  };
  audioConfig: {
    audioEncoding: 'MP3';
    speakingRate: number;
    pitch: number;
    volumeGainDb: number;
  };
}

export const PODCAST_VOICES: Record<'host1' | 'host2', VoiceConfig> = {
  host1: {
    name: 'Alex',
    personality: 'Enthusiastic, curious, asks lots of questions',
    voice: {
      languageCode: 'en-US',
      name: 'en-US-Neural2-J',
      ssmlGender: 'MALE',
    },
    audioConfig: {
      audioEncoding: 'MP3',
      speakingRate: 1.05,
      pitch: 1.0,
      volumeGainDb: 0.0,
    },
  },
  host2: {
    name: 'Jordan',
    personality: 'Analytical, thoughtful, provides deep explanations',
    voice: {
      languageCode: 'en-US',
      name: 'en-US-Neural2-A',
      ssmlGender: 'FEMALE',
    },
    audioConfig: {
      audioEncoding: 'MP3',
      speakingRate: 0.95,
      pitch: -0.5,
      volumeGainDb: 0.0,
    },
  },
};

export const AVAILABLE_VOICES = {
  male: [
    'en-US-Neural2-D',
    'en-US-Neural2-I',
    'en-US-Neural2-J',
    'en-GB-Neural2-B',
  ],
  female: [
    'en-US-Neural2-A',
    'en-US-Neural2-C',
    'en-US-Neural2-F',
    'en-US-Neural2-G',
    'en-GB-Neural2-A',
  ],
};
