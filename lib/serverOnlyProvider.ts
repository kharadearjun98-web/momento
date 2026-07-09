import { supabase } from './supabase/client';

function decodeBase64(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function invokeProvider(functionName: string, body: unknown): Promise<any> {
  const { data, error } = await supabase.functions.invoke(functionName, { body });
  if (error) {
    throw new Error(error.message);
  }
  return data;
}

export function createServerOnlyProviderClient(capability: string): any {
  return {
    chat: {
      completions: {
        create: (params: unknown) => invokeProvider('chat', { capability, ...(params as Record<string, unknown>) }),
      },
    },
    audio: {
      speech: {
        create: async (params: unknown) => {
          const data = await invokeProvider('tts', { capability, ...(params as Record<string, unknown>) });
          return {
            ...data,
            arrayBuffer: async () => {
              if (data?.audioBase64) {
                return decodeBase64(data.audioBase64);
              }
              throw new Error('TTS response did not include audio data.');
            },
          };
        },
      },
    },
    images: {
      generate: (params: unknown) => invokeProvider('image', { capability, ...(params as Record<string, unknown>) }),
    },
    embeddings: {
      create: (params: unknown) => invokeProvider('embed', { capability, ...(params as Record<string, unknown>) }),
    },
  };
}
