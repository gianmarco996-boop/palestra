import { Injectable, signal } from '@angular/core';
import { BERSERKER_PROGRAM } from '../data/workout-program';
import {
  Exercise,
  MeasurementEntry,
  WorkoutSession,
  WorkoutSet,
  WorkoutTemplate,
} from '../models/workout.model';

interface StoredWorkoutData {
  version: 1;
  exercises: Exercise[];
  templates: WorkoutTemplate[];
  workouts: WorkoutSession[];
  measurements: MeasurementEntry[];
}

interface CachedWorkoutData {
  data: StoredWorkoutData;
  updatedAt: string;
}

const STORAGE_KEY = 'gym-tracker.data.v2';
const USER_STORAGE_PREFIX = `${STORAGE_KEY}.user.`;
const LEGACY_USER_ID_KEY = 'gym-tracker.migrated-user.v1';

function createId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `id-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

function exerciseId(name: string): string {
  return name
    .toLocaleLowerCase('it-IT')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function createInitialData(): StoredWorkoutData {
  const exerciseNames = [
    ...new Set(
      BERSERKER_PROGRAM.flatMap((workout) =>
        workout.exercises.map((item) => item.name),
      ),
    ),
  ];
  const exercises: Exercise[] = exerciseNames.map((name) => ({
    id: exerciseId(name),
    name,
    muscleGroup: 'Personalizzato',
    equipment: 'Da specificare',
    loadMode: 'other',
    isSystem: true,
  }));

  const templates: WorkoutTemplate[] = BERSERKER_PROGRAM.map((workout) => ({
    id: `week-${workout.week}-day-${workout.day}`,
    name: `Settimana ${workout.week} · Giorno ${workout.day}`,
    description: workout.focus,
    exercises: workout.exercises.map((item, index) => ({
      id: `${exerciseId(item.name)}-${index + 1}`,
      exerciseId: exerciseId(item.name),
      position: index + 1,
      targetSets: item.sets,
      targetReps: item.reps,
      restSeconds: item.restSeconds,
      notes: item.notes,
    })),
  }));

  return {
    version: 1,
    exercises,
    templates,
    workouts: [],
    measurements: [],
  };
}

function cloneTemplate(template: WorkoutTemplate): WorkoutTemplate {
  return {
    ...template,
    exercises: template.exercises.map((item) => ({ ...item })),
  };
}

function mergeById<T extends { id: string }>(...collections: T[][]): T[] {
  const merged = new Map<string, T>();
  for (const collection of collections) {
    for (const item of collection) {
      merged.set(item.id, item);
    }
  }
  return [...merged.values()];
}

@Injectable({
  providedIn: 'root',
})
export class WorkoutDataService {
  readonly dataVersion = signal(0);
  private exerciseCatalog: Exercise[];
  private templateCatalog: WorkoutTemplate[];
  private sessionCatalog: WorkoutSession[];
  private measurementCatalog: MeasurementEntry[];

  constructor() {
    const stored = localStorage.getItem(STORAGE_KEY);
    const legacyCaches = this.readLegacyUserCaches();
    const baseData = stored
      ? (JSON.parse(stored) as StoredWorkoutData)
      : legacyCaches[0]?.data ?? createInitialData();
    const legacyData = legacyCaches.map((cache) => cache.data);
    const data: StoredWorkoutData = {
      version: 1,
      exercises: mergeById(baseData.exercises, ...legacyData.map((item) => item.exercises)),
      templates: mergeById(baseData.templates, ...legacyData.map((item) => item.templates)),
      workouts: mergeById(baseData.workouts, ...legacyData.map((item) => item.workouts))
        .sort((first, second) =>
          new Date(second.startedAt).getTime() - new Date(first.startedAt).getTime()),
      measurements: mergeById(baseData.measurements, ...legacyData.map((item) => item.measurements)),
    };
    this.exerciseCatalog = data.exercises;
    this.templateCatalog = data.templates;
    this.sessionCatalog = data.workouts;
    this.measurementCatalog = data.measurements;

    if (!stored || legacyCaches.length) {
      this.persist();
      for (const cache of legacyCaches) {
        localStorage.removeItem(cache.key);
      }
    }
    this.clearLegacyAccountStorage();
  }

  getExercises(): Exercise[] {
    return this.exerciseCatalog.map((exercise) => ({ ...exercise }));
  }

  getTemplates(): WorkoutTemplate[] {
    return this.templateCatalog
      .filter((template) => /^week-\d+-day-\d+$/.test(template.id))
      .map(cloneTemplate);
  }

  getSessions(): WorkoutSession[] {
    return this.sessionCatalog
      .map((session) => ({
        ...session,
        sets: session.sets.map((set) => ({
          ...set,
          segments: set.segments?.map((segment) => ({ ...segment })),
        })),
      }))
      .sort(
        (first, second) =>
          new Date(second.finishedAt ?? second.startedAt).getTime() -
          new Date(first.finishedAt ?? first.startedAt).getTime(),
      );
  }

  getActiveWorkout(templateId?: string): WorkoutSession | undefined {
    return this.getSessions()
      .filter(
        (session) =>
          session.status === 'in_progress' &&
          (!templateId || session.templateId === templateId) &&
          this.getTemplates().some(
            (template) => template.id === session.templateId,
          ),
      )
      [0];
  }

  startWorkout(templateId: string): WorkoutSession {
    const template = this.getTemplates().find((item) => item.id === templateId);
    if (!template) {
      throw new Error('La scheda selezionata non esiste.');
    }

    const session: WorkoutSession = {
      id: createId(),
      name: template.name,
      templateId: template.id,
      startedAt: new Date().toISOString(),
      status: 'in_progress',
      sets: [],
    };

    this.sessionCatalog.unshift(session);
    this.persist();
    return session;
  }

  getOrStartWorkout(templateId?: string): WorkoutSession {
    if (!templateId) {
      const activeSession = this.getActiveWorkout();
      if (activeSession) {
        return activeSession;
      }
      throw new Error('Scegli una scheda prima di iniziare un allenamento.');
    }

    if (!this.getTemplates().some((template) => template.id === templateId)) {
      throw new Error('La scheda selezionata non esiste.');
    }

    const activeSession = this.sessionCatalog.find(
      (session) =>
        session.status === 'in_progress' &&
        session.templateId === templateId,
    );
    return activeSession ?? this.startWorkout(templateId);
  }

  addSetToWorkout(sessionId: string, set: Partial<WorkoutSet>): void {
    const session = this.sessionCatalog.find((item) => item.id === sessionId);
    if (!session) {
      throw new Error('Allenamento non trovato.');
    }

    const exercise = this.exerciseCatalog.find(
      (item) => item.id === set.exerciseId,
    );
    if (!exercise) {
      throw new Error('Seleziona un esercizio valido.');
    }

    session.sets.push({
      id: createId(),
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      templateExerciseId: set.templateExerciseId,
      prescription: set.prescription,
      setNumber:
        session.sets.filter((item) =>
          set.templateExerciseId
            ? item.templateExerciseId === set.templateExerciseId
            : item.exerciseId === exercise.id,
        ).length + 1,
      weightKg: set.weightKg ?? 0,
      reps: set.reps ?? 0,
      segments: set.segments?.map((segment) => ({ ...segment })),
      rir: set.rir,
      rpe: set.rpe,
      restSeconds: set.restSeconds ?? 90,
      isCompleted: set.isCompleted ?? true,
      setType: set.setType ?? 'working',
    });
    this.persist();
  }

  finishWorkout(sessionId: string): WorkoutSession {
    const session = this.sessionCatalog.find((item) => item.id === sessionId);
    if (!session) {
      throw new Error('Allenamento non trovato.');
    }
    if (session.status === 'completed') {
      return {
        ...session,
        sets: session.sets.map((set) => ({
          ...set,
          segments: set.segments?.map((segment) => ({ ...segment })),
        })),
      };
    }
    if (session.sets.length === 0) {
      throw new Error(
        'Registra almeno una serie prima di concludere l’allenamento.',
      );
    }

    session.status = 'completed';
    session.finishedAt = new Date().toISOString();
    this.persist();
    return {
      ...session,
      sets: session.sets.map((set) => ({
        ...set,
        segments: set.segments?.map((segment) => ({ ...segment })),
      })),
    };
  }

  deleteWorkout(sessionId: string): void {
    const sessionIndex = this.sessionCatalog.findIndex(
      (item) => item.id === sessionId,
    );
    if (sessionIndex === -1) {
      throw new Error('Allenamento non trovato.');
    }
    this.sessionCatalog.splice(sessionIndex, 1);
    this.persist();
  }

  exportBackup(): string {
    return JSON.stringify(
      {
        version: 1,
        exercises: this.exerciseCatalog,
        templates: this.templateCatalog,
        workouts: this.sessionCatalog,
        measurements: this.measurementCatalog,
      },
      null,
      2,
    );
  }

  private persist(): void {
    localStorage.setItem(STORAGE_KEY, this.serialize());
    this.dataVersion.update((version) => version + 1);
  }

  private serialize(): string {
    const data: StoredWorkoutData = {
      version: 1,
      exercises: this.exerciseCatalog,
      templates: this.templateCatalog,
      workouts: this.sessionCatalog,
      measurements: this.measurementCatalog,
    };
    return JSON.stringify(data);
  }

  private readLegacyUserCaches(): { key: string; data: StoredWorkoutData }[] {
    const caches: { key: string; data: StoredWorkoutData; updatedAt: number }[] = [];
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (!key?.startsWith(USER_STORAGE_PREFIX)) {
        continue;
      }

      const serialized = localStorage.getItem(key);
      if (serialized === null) {
        continue;
      }
      const cached = JSON.parse(serialized) as CachedWorkoutData;
      const data = cached.data;
      const updatedAt = new Date(cached.updatedAt).getTime();
      if (
        !data ||
        !Array.isArray(data.exercises) ||
        !Array.isArray(data.templates) ||
        !Array.isArray(data.workouts) ||
        !Array.isArray(data.measurements) ||
        !Number.isFinite(updatedAt)
      ) {
        throw new Error('La cache locale dell’account non è valida.');
      }
      caches.push({
        key,
        data,
        updatedAt,
      });
    }
    return caches
      .sort((first, second) => first.updatedAt - second.updatedAt)
      .map(({ key, data }) => ({ key, data }));
  }

  private clearLegacyAccountStorage(): void {
    localStorage.removeItem(LEGACY_USER_ID_KEY);
    for (let index = localStorage.length - 1; index >= 0; index--) {
      const key = localStorage.key(index);
      if (key?.startsWith('sb-')) {
        localStorage.removeItem(key);
      }
    }
  }

}
