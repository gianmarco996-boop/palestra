export type LoadMode = 'barbell' | 'unilateral' | 'total' | 'bodyweight' | 'other';

export interface Exercise {
  id: string;
  name: string;
  muscleGroup: string;
  equipment: string;
  loadMode: LoadMode;
  notes?: string;
  isSystem: boolean;
}

export interface WorkoutTemplate {
  id: string;
  name: string;
  description: string;
  exercises: TemplateExercise[];
}

export interface TemplateExercise {
  id: string;
  exerciseId: string;
  position: number;
  targetSets: number;
  targetReps: string;
  restSeconds: number;
  notes?: string;
}

export interface WorkoutSet {
  id: string;
  exerciseId: string;
  exerciseName: string;
  templateExerciseId?: string;
  prescription?: string;
  setNumber: number;
  weightKg?: number;
  reps?: number;
  rir?: number;
  rpe?: number;
  restSeconds: number;
  isCompleted: boolean;
  setType: 'warmup' | 'working';
}

export interface WorkoutSession {
  id: string;
  name: string;
  templateId?: string;
  startedAt: string;
  finishedAt?: string;
  status: 'in_progress' | 'completed' | 'interrupted';
  notes?: string;
  sets: WorkoutSet[];
}

export interface MeasurementEntry {
  id: string;
  measuredAt: string;
  weightKg?: number;
  bodyFatPct?: number;
  chestCm?: number;
  waistCm?: number;
  armCm?: number;
  thighCm?: number;
}

export interface UserProfile {
  id: string;
  email: string;
  fullName?: string;
}
