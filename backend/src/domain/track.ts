export interface Track {
  id: number;
  song_id: number;
  relative_path: string;
  created_at: string;
  updated_at: string;
}

export interface CreateTrackInput {
  song_id: number;
  relative_path: string;
}
