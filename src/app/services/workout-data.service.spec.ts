import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WorkoutDataService } from './workout-data.service';
import { SupabaseService } from './supabase.service';

const STORAGE_KEY = 'gym-tracker.data.v2';

describe('WorkoutDataService workout lifecycle', () => {
  let service: WorkoutDataService;

  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    service = new WorkoutDataService(new SupabaseService());
  });

  afterEach(() => {
    localStorage.removeItem(STORAGE_KEY);
  });

  it('resumes an active workout instead of creating another session', () => {
    const first = service.getOrStartWorkout('week-1-day-1');
    const resumed = service.getOrStartWorkout('week-1-day-1');

    expect(resumed.id).toBe(first.id);
    expect(service.getSessions()).toHaveLength(1);
  });

  it('finishes and persists a workout, then removes it from history on delete', () => {
    const session = service.startWorkout('week-1-day-1');
    const exercise = service.getExercises()[0];
    service.addSetToWorkout(session.id, {
      exerciseId: exercise.id,
      weightKg: 0,
      reps: 8,
    });

    const finished = service.finishWorkout(session.id);
    expect(finished.status).toBe('completed');
    expect(finished.finishedAt).toBeTruthy();
    expect(new WorkoutDataService(new SupabaseService()).getSessions()[0].status).toBe('completed');

    service.deleteWorkout(session.id);
    expect(service.getSessions()).toHaveLength(0);
  });

  it('does not finish an empty workout', () => {
    const session = service.startWorkout();

    expect(() => service.finishWorkout(session.id)).toThrowError(
      'Registra almeno una serie prima di concludere l’allenamento.',
    );
    expect(session.status).toBe('in_progress');
  });
});
