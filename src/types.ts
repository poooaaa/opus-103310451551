export interface VideoFormat {
  type: string;
  name: string;
  mediaId: number | string;
  mediaUrl: string;
  mediaPreviewUrl: string;
  mediaThumbnail: string;
  mediaRes: string;
  mediaQuality: string;
  mediaDuration: string;
  mediaExtension: string;
  mediaFileSize: string;
  mediaTask: string;
  height?: number;
  disabled?: boolean;
  limitReason?: string;
}

export interface AudioFormat {
  type: string;
  name: string;
  mediaId: number | string;
  mediaUrl: string;
  mediaPreviewUrl: string;
  mediaThumbnail: string;
  mediaRes: boolean;
  mediaQuality: string;
  mediaDuration: string;
  mediaExtension: string;
  mediaFileSize: string;
  mediaTask: string;
}

export interface InfoResponse {
  title: string;
  description: string;
  thumbnail: string;
  duration: string;
  formats: {
    videos: VideoFormat[];
    audios: AudioFormat[];
  };
  autoSelected: VideoFormat & {
    matchType: string;
  };
}

export interface DownloadTask {
  id: string;
  youtubeUrl: string;
  title: string;
  filename: string;
  mediaUrl: string;
  resolution: string;
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  status: "pending" | "downloading" | "completed" | "error";
  error?: string;
  localUrl?: string;
  createdAt: number;
}
