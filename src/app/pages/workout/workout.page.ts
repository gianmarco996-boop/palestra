import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonBadge,
  AlertController,
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { WorkoutDataService } from '../../services/workout-data.service';
import { RestTimerService } from '../../services/rest-timer.service';
import {
  TemplateExercise,
  WorkoutSetSegment,
  WorkoutSession,
  WorkoutTemplate,
  workoutSetVolume,
} from '../../models/workout.model';

interface SetPrescription {
  label: string;
  reps: number | null;
  segments: number[];
  setType: 'warmup' | 'working';
}

interface SetSegmentDraft {
  weightKg: number | null;
  reps: number | null;
}

interface PlannedSetProgress {
  exercise: TemplateExercise;
  setNumber: number;
  prescription: SetPrescription;
}

@Component({
  selector: 'app-workout-page',
  templateUrl: './workout.page.html',
  styleUrls: ['./workout.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonHeader, IonToolbar, IonTitle, IonContent, IonCard, IonCardHeader, IonCardContent, IonButton, IonInput, IonItem, IonLabel, IonList, IonSelect, IonSelectOption, IonBadge],
})
export class WorkoutPage implements OnInit {
  private readonly workoutData = inject(WorkoutDataService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly alertController = inject(AlertController);
  readonly timer = inject(RestTimerService);

  weight = 0;
  reps: number | null = 8;
  setSegments: SetSegmentDraft[] = [];
  rir: number | null = null;
  isFinishing = false;
  currentSession = this.getInitialSession();
  activeTemplate: WorkoutTemplate | undefined = this.workoutData.getTemplates()
    .find((template) => template.id === this.currentSession?.templateId);
  selectedExerciseId = this.activeTemplate?.exercises[0]?.exerciseId ?? this.exercises[0]?.id ?? '';
  restSeconds = this.timer.durationSeconds();

  constructor() {
    this.syncPlannedSet();
  }

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      const templateId = params.get('templateId');
      if (templateId) {
        this.currentSession = this.workoutData.getOrStartWorkout(templateId ?? undefined);
        this.activeTemplate = this.workoutData.getTemplates()
          .find((template) => template.id === this.currentSession?.templateId);
        this.selectedExerciseId = this.activeTemplate?.exercises[0]?.exerciseId ?? '';
        this.syncPlannedSet();
      }
    });
  }

  ionViewWillEnter(): void {
    const templateId = this.route.snapshot.queryParamMap.get('templateId') ?? undefined;
    this.currentSession = this.workoutData.getActiveWorkout(templateId);
    this.activeTemplate = this.workoutData.getTemplates()
      .find((template) => template.id === this.currentSession?.templateId);
    this.selectedExerciseId = this.activeTemplate?.exercises[0]?.exerciseId ?? '';
    this.syncPlannedSet();
  }

  goToTemplates(): void {
    void this.router.navigate(['/templates']);
  }

  get currentSessionSets() {
    return this.currentSession?.sets ?? [];
  }

  get exercises() {
    return this.workoutData.getExercises();
  }

  get plannedExercises(): TemplateExercise[] {
    return [...(this.activeTemplate?.exercises ?? [])].sort(
      (first, second) => first.position - second.position,
    );
  }

  get plannedSetProgress(): PlannedSetProgress | undefined {
    if (!this.activeTemplate || !this.currentSession) {
      return undefined;
    }

    const completedCounts = this.plannedSetCounts();
    for (const exercise of this.plannedExercises) {
      const completed = completedCounts.get(exercise.id) ?? 0;
      if (exercise.targetSets > completed) {
        return {
          exercise,
          setNumber: completed + 1,
          prescription: this.setPrescriptions(exercise)[completed],
        };
      }
    }
    return undefined;
  }

  get isPlanComplete(): boolean {
    return !!this.activeTemplate && !this.plannedSetProgress;
  }

  get isFinished(): boolean {
    return this.currentSession?.status === 'completed';
  }

  get canCompleteSet(): boolean {
    if (!this.currentSession) {
      return false;
    }
    const exerciseId = this.plannedSetProgress?.exercise.exerciseId ?? this.selectedExerciseId;
    if (this.setSegments.length) {
      return !!exerciseId && this.setSegments.every((segment) =>
        segment.weightKg !== null &&
        Number.isFinite(segment.weightKg) &&
        segment.weightKg >= 0 &&
        segment.reps !== null &&
        Number.isFinite(segment.reps) &&
        segment.reps > 0);
    }
    return !!exerciseId && this.reps !== null && Number.isFinite(this.reps) && this.reps > 0;
  }

  addSetSegment(): void {
    if (!this.setSegments.length) {
      this.setSegments = [{ weightKg: this.weight, reps: this.reps }];
    }
    this.setSegments = [
      ...this.setSegments,
      { weightKg: this.setSegments.at(-1)?.weightKg ?? this.weight, reps: null },
    ];
  }

  removeSetSegments(): void {
    const firstSegment = this.setSegments[0];
    if (firstSegment) {
      this.weight = firstSegment.weightKg ?? 0;
      this.reps = firstSegment.reps;
    }
    this.setSegments = [];
  }

  addSet(): void {
    if (!this.currentSession) {
      return;
    }
    const progress = this.plannedSetProgress;
    const exerciseId = progress?.exercise.exerciseId ?? this.selectedExerciseId;
    const exercise = this.exercises.find((item) => item.id === exerciseId);
    if (!exercise) {
      return;
    }

    const segments: WorkoutSetSegment[] = this.setSegments.map((segment) => ({
      weightKg: segment.weightKg!,
      reps: segment.reps!,
    }));
    const firstSegment = segments[0];
    const restForCompletedSet = progress?.exercise.restSeconds ?? this.restSeconds;
    this.workoutData.addSetToWorkout(this.currentSession.id, {
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      templateExerciseId: progress?.exercise.id,
      prescription: progress?.prescription.label,
      weightKg: firstSegment?.weightKg ?? this.weight,
      reps: segments.length
        ? segments.reduce((total, segment) => total + segment.reps, 0)
        : this.reps ?? 0,
      segments: segments.length ? segments : undefined,
      rir: this.rir ?? undefined,
      restSeconds: restForCompletedSet,
      isCompleted: true,
      setType: progress?.prescription.setType ?? 'working',
    });

    if (progress) {
      this.syncPlannedSet();
    }
    this.restSeconds = restForCompletedSet;
    this.timer.setDuration(restForCompletedSet);
  }

  async finishWorkout(): Promise<void> {
    if (!this.currentSession || this.isFinishing || this.isFinished) {
      return;
    }

    this.isFinishing = true;
    try {
      this.currentSession = this.workoutData.finishWorkout(this.currentSession.id);
      this.timer.stop();
    } catch (error) {
      await this.showError(error);
    } finally {
      this.isFinishing = false;
    }
  }

  openProgress(): void {
    void this.router.navigate(['/progress']);
  }

  startRestTimer(): void {
    this.timer.setDuration(this.restSeconds);
    this.timer.start();
  }

  stopRestTimer(): void {
    this.timer.stop();
  }

  addRestSeconds(seconds: number): void {
    this.timer.addSeconds(seconds);
    this.restSeconds = this.timer.durationSeconds();
  }

  getExerciseName(exerciseId: string): string {
    return this.exercises.find((exercise) => exercise.id === exerciseId)?.name ?? 'Esercizio non disponibile';
  }

  get totalVolume(): number {
    return this.currentSession?.sets.reduce((sum, set) => sum + workoutSetVolume(set), 0) ?? 0;
  }

  private getInitialSession(): WorkoutSession | undefined {
    const templateId = this.route.snapshot.queryParamMap.get('templateId');
    return templateId
      ? this.workoutData.getOrStartWorkout(templateId)
      : this.workoutData.getActiveWorkout();
  }

  private syncPlannedSet(): void {
    if (!this.currentSession) {
      this.setSegments = [];
      return;
    }
    const progress = this.plannedSetProgress;
    if (!progress) {
      this.setSegments = [];
      return;
    }

    this.selectedExerciseId = progress.exercise.exerciseId;
    this.setSegments = progress.prescription.segments.map((segmentReps) => ({
      weightKg: this.weight,
      reps: segmentReps,
    }));
    this.reps = progress.prescription.reps ??
      (progress.prescription.segments.length
        ? progress.prescription.segments.reduce((total, segment) => total + segment, 0)
        : null);
    this.restSeconds = progress.exercise.restSeconds;
    this.rir = null;
  }

  private plannedSetCounts(): Map<string, number> {
    const counts = new Map(this.plannedExercises.map((exercise) => [exercise.id, 0]));
    const unassignedSets = (this.currentSession?.sets ?? []).filter((set) => {
      if (!set.templateExerciseId) {
        return true;
      }
      if (counts.has(set.templateExerciseId) && set.isCompleted) {
        counts.set(
          set.templateExerciseId,
          (counts.get(set.templateExerciseId) ?? 0) + 1,
        );
      }
      return false;
    });

    for (const set of unassignedSets) {
      if (!set.isCompleted) {
        continue;
      }
      const matchingExercise = this.plannedExercises.find((exercise) =>
        exercise.exerciseId === set.exerciseId &&
        (counts.get(exercise.id) ?? 0) < exercise.targetSets);
      if (matchingExercise) {
        counts.set(matchingExercise.id, (counts.get(matchingExercise.id) ?? 0) + 1);
      }
    }
    return counts;
  }

  private setPrescriptions(exercise: TemplateExercise): SetPrescription[] {
    const source = exercise.targetReps.trim();
    const groups = source.includes(';') ? source.split(';') : [source];
    const expanded: SetPrescription[] = [];

    for (const group of groups) {
      const value = group.trim();
      const match = /^(\d+)\s+(.+)$/.exec(value);
      const count = source.includes(';') && match ? Number(match[1]) : exercise.targetSets;
      const label = source.includes(';') && match ? match[2].trim() : value;
      const segments = /^\d+(?:\s*\+\s*\d+)+$/.test(label)
        ? label.split('+').map((segment) => Number(segment.trim()))
        : [];
      const numericReps = /^\d+$/.test(label) ? Number(label) : null;
      const setType = /\bWU\b/i.test(label) ? 'warmup' : 'working';

      for (let index = 0; index < count && expanded.length < exercise.targetSets; index++) {
        expanded.push({
          label: label || 'Non specificata',
          reps: numericReps,
          segments,
          setType,
        });
      }
    }

    while (expanded.length < exercise.targetSets) {
      expanded.push({
        label: 'Non specificata',
        reps: null,
        segments: [],
        setType: 'working',
      });
    }
    return expanded;
  }

  private async showError(error: unknown): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Impossibile concludere',
      message: error instanceof Error ? error.message : 'Si è verificato un errore.',
      buttons: ['OK'],
    });
    await alert.present();
  }
}
