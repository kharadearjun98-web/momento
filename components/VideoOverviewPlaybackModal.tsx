import React from 'react';
import { VideoOverviewPlayback } from './VideoOverviewPlayback';
import { Slide } from '../lib/slideGenerator';

interface VideoOverviewPlaybackModalProps {
  video: {
    id: string;
    title: string;
    slides: Slide[];
    audioUrl: string;
    audioDuration: number;
    slideTimings: { slideId: string; startMs: number; endMs: number }[];
    metadata: {
      format: string;
      style: string;
      slideCount: number;
    };
  };
  onClose: () => void;
}

export const VideoOverviewPlaybackModal: React.FC<VideoOverviewPlaybackModalProps> = ({ video, onClose }) => {
  if (!video) return null;
  return (
    <VideoOverviewPlayback isOpen={true} onClose={onClose} video={video} />
  );
};

export default VideoOverviewPlaybackModal;
