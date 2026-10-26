import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { WorkoutDataService } from './workout-data.service';
import { workoutSetVolume } from '../models/workout.model';

const STORAGE_KEY = 'gym-tracker.data.v2';
const USER_STORAGE_PREFIX = `${STORAGE_KEY}.user.`;

describe('WorkoutDataService workout lifecycle', () => {
  let service: WorkoutDataService;

  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    TestBed.configureTestingModule({
      providers: [WorkoutDataService],
    });
    service = TestBed.inject(WorkoutDataService);
  });

  afterEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    for (let index = localStorage.length - 1; index >= 0; index--) {
      const key = localStorage.key(index);
      if (key?.startsWith(USER_STORAGE_PREFIX)) {
        localStorage.removeItem(key);
      }
    }
    TestBed.resetTestingModule();
  });

  it('resumes an active workout instead of creating another session', () => {
    const first = service.getOrStartWorkout('week-1-day-1');
    const resumed = service.getOrStartWorkout('week-1-day-1');

    expect(resumed.id).toBe(first.id);
    expect(service.getSessions()).toHaveLength(1);
  });

  it('reopens an active workout from the workout tab without starting a new one', () => {
    const started = service.getOrStartWorkout('week-1-day-1');

    expect(service.getOrStartWorkout().id).toBe(started.id);
    expect(service.getSessions()).toHaveLength(1);
  });

  it('orders completed sessions by completion time', () => {
    const first = service.startWorkout('week-1-day-1');
    const second = service.startWorkout('week-1-day-2');
    const exercise = service.getExercises()[0];
    for (const session of [first, second]) {
      service.addSetToWorkout(session.id, {
        exerciseId: exercise.id,
        reps: 8,
      });
      service.finishWorkout(session.id);
    }
    first.finishedAt = '2026-10-26T16:00:00.000Z';
    second.finishedAt = '2026-10-26T17:00:00.000Z';

    expect(service.getSessions()[0].id).toBe(second.id);
  });

  it('requires a template to start a workout when no workout is active', () => {
    expect(() => service.getOrStartWorkout()).toThrowError(
      'Scegli una scheda prima di iniziare un allenamento.',
    );
  });

  it('only allows workouts from the built-in training program', () => {
    expect(() => service.startWorkout('personal-template')).toThrowError(
      'La scheda selezionata non esiste.',
    );
  });

  it('finishes and persists a workout, then removes it from history on delete', () => {
    const session = service.startWorkout('week-1-day-1');
    const exercise = service.getExercises()[0];
    const updatedSession = service.addSetToWorkout(session.id, {
      exerciseId: exercise.id,
      weightKg: 0,
      reps: 8,
    });
    expect(updatedSession.sets).toHaveLength(1);

    const versionBeforeFinish = service.dataVersion();
    const finished = service.finishWorkout(session.id);
    expect(finished.status).toBe('completed');
    expect(finished.finishedAt).toBeTruthy();
    expect(service.dataVersion()).toBe(versionBeforeFinish + 1);
    expect(TestBed.inject(WorkoutDataService).getSessions()[0].status).toBe('completed');

    const versionBeforeDelete = service.dataVersion();
    service.deleteWorkout(session.id);
    expect(service.dataVersion()).toBe(versionBeforeDelete + 1);
    expect(service.getSessions()).toHaveLength(0);
  });

  it('does not finish an empty workout', () => {
    const session = service.startWorkout('week-1-day-1');

    expect(() => service.finishWorkout(session.id)).toThrowError(
      'Registra almeno una serie prima di concludere l’allenamento.',
    );
    expect(session.status).toBe('in_progress');
  });

  it('persists phases of a drop set and sums their volume', () => {
    const session = service.startWorkout('week-1-day-1');
    const exercise = service.getExercises()[0];
    const segments = [
      { weightKg: 20, reps: 10 },
      { weightKg: 15, reps: 10 },
    ];
    service.addSetToWorkout(session.id, {
      exerciseId: exercise.id,
      weightKg: segments[0].weightKg,
      reps: 20,
      segments,
    });

    const savedSet = service.getSessions()[0].sets[0];
    expect(savedSet.segments).toEqual(segments);
    expect(workoutSetVolume(savedSet)).toBe(350);
  });

  it('migrates existing account data into the single local workout store', () => {
    const session = service.startWorkout('week-1-day-1');
    const data = {
      version: 1,
      exercises: service.getExercises(),
      templates: service.getTemplates(),
      workouts: [{ ...session, status: 'completed' as const }],
      measurements: [],
    };
    const userCacheKey = `${USER_STORAGE_PREFIX}owner`;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.setItem(userCacheKey, JSON.stringify({
      data,
      updatedAt: new Date().toISOString(),
    }));
    localStorage.setItem('gym-tracker.migrated-user.v1', 'owner');
    localStorage.setItem('sb-test-auth-token', 'legacy-session');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [WorkoutDataService] });

    const migratedService = TestBed.inject(WorkoutDataService);
    expect(migratedService.getSessions()[0].id).toBe(session.id);
    expect(localStorage.getItem(STORAGE_KEY)).toBeTruthy();
    expect(localStorage.getItem(userCacheKey)).toBeNull();
    expect(localStorage.getItem('gym-tracker.migrated-user.v1')).toBeNull();
    expect(localStorage.getItem('sb-test-auth-token')).toBeNull();
  });
});
