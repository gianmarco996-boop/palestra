import { inject, Injectable, signal } from '@angular/core';
import { BERSERKER_PROGRAM } from '../data/workout-program';
import {
  Exercise,
  LoadMode,
  MeasurementEntry,
  WorkoutSession,
  WorkoutSet,
  WorkoutTemplate,
} from '../models/workout.model';
import { SupabaseService } from './supabase.service';

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
const MIGRATED_USER_KEY = 'gym-tracker.migrated-user.v1';

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

@Injectable({
  providedIn: 'root',
})
export class WorkoutDataService {
  readonly syncStatus = signal<
    'local' | 'waiting-for-login' | 'syncing' | 'synced' | 'error'
  >('local');
  readonly syncError = signal('');
  private exerciseCatalog: Exercise[];
  private templateCatalog: WorkoutTemplate[];
  private sessionCatalog: WorkoutSession[];
  private measurementCatalog: MeasurementEntry[];
  private activeUserId: string | null = null;
  private syncTimeout: ReturnType<typeof setTimeout> | undefined;
  private syncQueue: Promise<void> = Promise.resolve();
  private revision = 0;
  private readonly supabaseService = inject(SupabaseService);

  constructor() {
    const stored = localStorage.getItem(STORAGE_KEY);
    const data = stored
      ? (JSON.parse(stored) as StoredWorkoutData)
      : createInitialData();
    this.exerciseCatalog = data.exercises;
    this.templateCatalog = data.templates;
    this.sessionCatalog = data.workouts;
    this.measurementCatalog = data.measurements;

    if (!stored) {
      this.persist();
    }
  }

  async connectUser(userId: string): Promise<void> {
    if (this.activeUserId === userId && this.syncStatus() !== 'error') {
      return;
    }

    if (this.activeUserId) {
      localStorage.setItem(
        this.userStorageKey(this.activeUserId),
        this.serialize(),
      );
    }

    const userKey = this.userStorageKey(userId);
    const userCache = localStorage.getItem(userKey);
    const migratedUser = localStorage.getItem(MIGRATED_USER_KEY);
    let localUpdatedAt: string | null = null;
    if (userCache) {
      try {
        const cached = JSON.parse(userCache) as CachedWorkoutData;
        if (cached.data && cached.updatedAt) {
          this.loadData(JSON.stringify(cached.data));
          localUpdatedAt = cached.updatedAt;
        } else {
          this.loadData(userCache);
        }
      } catch (error) {
        this.syncStatus.set('error');
        this.syncError.set(
          error instanceof Error
            ? error.message
            : 'La cache locale non è valida.',
        );
        return;
      }
    } else if (migratedUser && migratedUser !== userId) {
      this.loadData(JSON.stringify(createInitialData()));
    } else {
      localStorage.setItem(MIGRATED_USER_KEY, userId);
    }

    this.activeUserId = userId;
    this.syncStatus.set('syncing');
    this.syncError.set('');
    this.writeUserCache(userId, localUpdatedAt!);

    const client = this.supabaseService.getClient();
    if (!client) {
      this.syncStatus.set('error');
      this.syncError.set('La sincronizzazione remota non è configurata.');
      return;
    }

    const { data, error } = await client
      .from('user_app_data')
      .select('data, updated_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      this.syncStatus.set('error');
      this.syncError.set(error.message);
      return;
    }

    if (
      data?.data &&
      localUpdatedAt &&
      new Date(localUpdatedAt).getTime() > new Date(data.updated_at).getTime()
    ) {
      await this.uploadSnapshot(userId, this.serialize(), this.revision);
      return;
    }

    if (data?.data) {
      try {
        this.loadData(JSON.stringify(data.data));
        this.writeUserCache(userId, data.updated_at);
        this.syncStatus.set('synced');
      } catch (loadError) {
        this.syncStatus.set('error');
        this.syncError.set(
          loadError instanceof Error
            ? loadError.message
            : 'I dati cloud non sono validi.',
        );
      }
      return;
    }

    await this.uploadSnapshot(userId, this.serialize(), this.revision);
  }

  disconnectUser(): void {
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
      this.syncTimeout = undefined;
    }
    this.activeUserId = null;
    this.syncStatus.set('local');
    this.syncError.set('');
    this.loadData(
      localStorage.getItem(STORAGE_KEY) ?? JSON.stringify(createInitialData()),
    );
  }

  getExercises(): Exercise[] {
    return this.exerciseCatalog.map((exercise) => ({ ...exercise }));
  }

  getTemplates(): WorkoutTemplate[] {
    return this.templateCatalog.map(cloneTemplate);
  }

  getSessions(): WorkoutSession[] {
    return this.sessionCatalog.map((session) => ({
      ...session,
      sets: session.sets.map((set) => ({ ...set })),
    }));
  }

  getMeasurements(): MeasurementEntry[] {
    return [...this.measurementCatalog].sort(
      (a, b) =>
        new Date(b.measuredAt).getTime() - new Date(a.measuredAt).getTime(),
    );
  }

  createExercise(
    name: string,
    muscleGroup: string,
    equipment: string,
    loadMode: LoadMode,
  ): Exercise {
    const normalizedName = name.trim();
    if (!normalizedName) {
      throw new Error('Inserisci il nome dell’esercizio.');
    }

    const exercise: Exercise = {
      id: createId(),
      name: normalizedName,
      muscleGroup: muscleGroup.trim() || 'Personalizzato',
      equipment: equipment.trim() || 'Da specificare',
      loadMode,
      isSystem: false,
    };

    this.exerciseCatalog.push(exercise);
    this.persist();
    return { ...exercise };
  }

  createTemplate(name: string, description: string): WorkoutTemplate {
    const normalizedName = name.trim();
    if (!normalizedName) {
      throw new Error('Inserisci il nome della scheda.');
    }

    const template: WorkoutTemplate = {
      id: createId(),
      name: normalizedName,
      description: description.trim(),
      exercises: [],
    };

    this.templateCatalog.push(template);
    this.persist();
    return cloneTemplate(template);
  }

  addExerciseToTemplate(templateId: string, exerciseIdToAdd: string): void {
    const template = this.templateCatalog.find(
      (item) => item.id === templateId,
    );
    const exercise = this.exerciseCatalog.find(
      (item) => item.id === exerciseIdToAdd,
    );
    if (!template || !exercise) {
      throw new Error('Scheda o esercizio non trovato.');
    }

    template.exercises.push({
      id: createId(),
      exerciseId: exercise.id,
      position: template.exercises.length + 1,
      targetSets: 3,
      targetReps: '8',
      restSeconds: 90,
    });
    this.persist();
  }

  updateTemplateExercise(
    templateId: string,
    templateExerciseId: string,
    changes: Partial<
      Pick<
        WorkoutTemplate['exercises'][number],
        'targetSets' | 'targetReps' | 'restSeconds'
      >
    >,
  ): void {
    const template = this.templateCatalog.find(
      (item) => item.id === templateId,
    );
    const templateExercise = template?.exercises.find(
      (item) => item.id === templateExerciseId,
    );
    if (!templateExercise) {
      throw new Error('Esercizio della scheda non trovato.');
    }

    if (changes.targetSets !== undefined) {
      templateExercise.targetSets = Math.max(0, Math.floor(changes.targetSets));
    }
    if (changes.targetReps !== undefined) {
      templateExercise.targetReps = changes.targetReps.trim();
    }
    if (changes.restSeconds !== undefined) {
      templateExercise.restSeconds = Math.max(
        0,
        Math.floor(changes.restSeconds),
      );
    }
    this.persist();
  }

  removeExerciseFromTemplate(
    templateId: string,
    templateExerciseId: string,
  ): void {
    const template = this.templateCatalog.find(
      (item) => item.id === templateId,
    );
    if (!template) {
      throw new Error('Scheda non trovata.');
    }

    template.exercises = template.exercises
      .filter((item) => item.id !== templateExerciseId)
      .map((item, index) => ({ ...item, position: index + 1 }));
    this.persist();
  }

  startWorkout(templateId?: string): WorkoutSession {
    const template = templateId
      ? this.templateCatalog.find((item) => item.id === templateId)
      : undefined;
    if (templateId && !template) {
      throw new Error('La scheda selezionata non esiste.');
    }

    const session: WorkoutSession = {
      id: createId(),
      name: template?.name ?? 'Allenamento libero',
      templateId: template?.id,
      startedAt: new Date().toISOString(),
      status: 'in_progress',
      sets: [],
    };

    this.sessionCatalog.unshift(session);
    this.persist();
    return session;
  }

  getOrStartWorkout(templateId?: string): WorkoutSession {
    if (
      templateId &&
      !this.templateCatalog.some((template) => template.id === templateId)
    ) {
      throw new Error('La scheda selezionata non esiste.');
    }

    const activeSession = this.sessionCatalog.find(
      (session) =>
        session.status === 'in_progress' &&
        (!templateId || session.templateId === templateId),
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
      return { ...session, sets: session.sets.map((set) => ({ ...set })) };
    }
    if (session.sets.length === 0) {
      throw new Error(
        'Registra almeno una serie prima di concludere l’allenamento.',
      );
    }

    session.status = 'completed';
    session.finishedAt = new Date().toISOString();
    this.persist();
    return { ...session, sets: session.sets.map((set) => ({ ...set })) };
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

  addMeasurement(entry: MeasurementEntry): void {
    this.measurementCatalog.unshift(entry);
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
    const serialized = this.serialize();
    if (this.activeUserId) {
      this.writeUserCache(this.activeUserId);
    } else {
      localStorage.setItem(STORAGE_KEY, serialized);
    }
    this.revision++;
    if (this.activeUserId) {
      this.scheduleSync();
    }
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

  private loadData(serialized: string): void {
    const data = JSON.parse(serialized) as StoredWorkoutData;
    if (
      !Array.isArray(data.exercises) ||
      !Array.isArray(data.templates) ||
      !Array.isArray(data.workouts) ||
      !Array.isArray(data.measurements)
    ) {
      throw new Error(
        'Il salvataggio dell’allenamento non ha un formato valido.',
      );
    }
    this.exerciseCatalog = data.exercises;
    this.templateCatalog = data.templates;
    this.sessionCatalog = data.workouts;
    this.measurementCatalog = data.measurements;
  }

  private userStorageKey(userId: string): string {
    return `${STORAGE_KEY}.user.${userId}`;
  }

  private writeUserCache(
    userId: string,
    updatedAt = new Date().toISOString(),
  ): void {
    const cache: CachedWorkoutData = {
      data: JSON.parse(this.serialize()) as StoredWorkoutData,
      updatedAt,
    };
    localStorage.setItem(this.userStorageKey(userId), JSON.stringify(cache));
  }

  private scheduleSync(): void {
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
    }
    this.syncStatus.set('syncing');
    this.syncTimeout = setTimeout(() => {
      this.syncTimeout = undefined;
      const userId = this.activeUserId;
      if (!userId) {
        return;
      }
      const serialized = this.serialize();
      const revision = this.revision;
      this.syncQueue = this.syncQueue
        .then(() => this.uploadSnapshot(userId, serialized, revision))
        .catch((error: unknown) => {
          if (this.activeUserId === userId) {
            this.syncStatus.set('error');
            this.syncError.set(
              error instanceof Error
                ? error.message
                : 'Sincronizzazione non riuscita.',
            );
          }
        });
    }, 500);
  }

  private async uploadSnapshot(
    userId: string,
    serialized: string,
    revision: number,
  ): Promise<void> {
    const client = this.supabaseService.getClient();
    if (!client) {
      this.syncStatus.set('error');
      this.syncError.set('La sincronizzazione remota non è configurata.');
      return;
    }

    const updatedAt = new Date().toISOString();
    const { error } = await client.from('user_app_data').upsert(
      {
        user_id: userId,
        data: JSON.parse(serialized) as StoredWorkoutData,
        updated_at: updatedAt,
      },
      { onConflict: 'user_id' },
    );

    if (error) {
      this.syncStatus.set('error');
      this.syncError.set(error.message);
      return;
    }

    if (this.activeUserId === userId && this.revision === revision) {
      this.writeUserCache(userId, updatedAt);
      this.syncStatus.set('synced');
      this.syncError.set('');
    }
  }
}
