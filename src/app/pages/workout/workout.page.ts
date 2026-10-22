import { CommonModule, DatePipe } from '@angular/common';
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
import { TemplateExercise, WorkoutTemplate } from '../../models/workout.model';

interface SetPrescription {
  label: string;
  reps: number | null;
  setType: 'warmup' | 'working';
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
  providers: [DatePipe],
})
export class WorkoutPage implements OnInit {
  private readonly workoutData = inject(WorkoutDataService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly alertController = inject(AlertController);
  readonly timer = inject(RestTimerService);

  weight = 0;
  reps: number | null = 8;
  rir: number | null = null;
  currentSession = this.workoutData.getOrStartWorkout(this.route.snapshot.queryParamMap.get('templateId') ?? undefined);
  activeTemplate: WorkoutTemplate | undefined = this.workoutData.getTemplates()
    .find((template) => template.id === this.currentSession.templateId);
  selectedExerciseId = this.activeTemplate?.exercises[0]?.exerciseId ?? this.exercises[0]?.id ?? '';
  restSeconds = this.timer.durationSeconds();

  constructor() {
    this.syncPlannedSet();
  }

  ngOnInit(): void {
    this.route.queryParamMap.subscribe((params) => {
      const templateId = params.get('templateId');
      if (templateId && (templateId !== this.currentSession.templateId || this.currentSession.status !== 'in_progress')) {
        this.currentSession = this.workoutData.getOrStartWorkout(templateId);
        this.activeTemplate = this.workoutData.getTemplates().find((template) => template.id === templateId);
        this.selectedExerciseId = this.activeTemplate?.exercises[0]?.exerciseId ?? this.exercises[0]?.id ?? '';
        this.syncPlannedSet();
      }
    });
  }

  get currentSessionSets() {
    return this.currentSession.sets;
  }

  get exercises() {
    return this.workoutData.getExercises();
  }

  get plannedExercises(): TemplateExercise[] {
    return this.activeTemplate?.exercises ?? [];
  }

  get plannedSetProgress(): PlannedSetProgress | undefined {
    if (!this.activeTemplate) {
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
    return this.currentSession.status === 'completed';
  }

  get canCompleteSet(): boolean {
    const exerciseId = this.plannedSetProgress?.exercise.exerciseId ?? this.selectedExerciseId;
    return !!exerciseId && this.reps !== null && Number.isFinite(this.reps) && this.reps > 0;
  }

  addSet(): void {
    const progress = this.plannedSetProgress;
    const exerciseId = progress?.exercise.exerciseId ?? this.selectedExerciseId;
    const exercise = this.exercises.find((item) => item.id === exerciseId);
    if (!exercise) {
      return;
    }

    const restForCompletedSet = progress?.exercise.restSeconds ?? this.restSeconds;
    this.workoutData.addSetToWorkout(this.currentSession.id, {
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      templateExerciseId: progress?.exercise.id,
      prescription: progress?.prescription.label,
      weightKg: this.weight,
      reps: this.reps ?? 0,
      rir: this.rir ?? undefined,
      restSeconds: restForCompletedSet,
      isCompleted: true,
      setType: progress?.prescription.setType ?? 'working',
    });

    if (progress) {
      this.syncPlannedSet();
    }
    this.startRestTimer(restForCompletedSet);
  }

  async finishWorkout(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Concludere l’allenamento?',
      message: 'L’allenamento verrà salvato nello storico e nei progressi.',
      buttons: [
        { text: 'Continua', role: 'cancel' },
        {
          text: 'Concludi e salva',
          role: 'confirm',
          handler: () => {
            try {
              this.currentSession = this.workoutData.finishWorkout(this.currentSession.id);
              this.timer.stop();
            } catch (error) {
              void this.showError(error);
              return false;
            }
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  startNewWorkout(): void {
    this.currentSession = this.workoutData.startWorkout();
    this.activeTemplate = undefined;
    this.selectedExerciseId = this.exercises[0]?.id ?? '';
    this.reps = 8;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { templateId: null },
      queryParamsHandling: 'merge',
    });
    this.timer.stop();
  }

  openProgress(): void {
    void this.router.navigate(['/progress']);
  }

  startRestTimer(duration = this.restSeconds): void {
    this.timer.setDuration(duration);
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
    return this.currentSession.sets.reduce((sum, set) => sum + ((set.weightKg ?? 0) * (set.reps ?? 0)), 0);
  }

  private syncPlannedSet(): void {
    const progress = this.plannedSetProgress;
    if (!progress) {
      return;
    }

    this.selectedExerciseId = progress.exercise.exerciseId;
    this.reps = progress.prescription.reps;
    this.restSeconds = progress.exercise.restSeconds;
    this.rir = null;
  }

  private plannedSetCounts(): Map<string, number> {
    const counts = new Map(this.plannedExercises.map((exercise) => [exercise.id, 0]));
    const unassignedSets = this.currentSession.sets.filter((set) => {
      if (!set.templateExerciseId || !counts.has(set.templateExerciseId)) {
        return true;
      }
      counts.set(set.templateExerciseId, (counts.get(set.templateExerciseId) ?? 0) + 1);
      return false;
    });

    for (const set of unassignedSets) {
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
      const numericReps = /^\d+$/.test(label) ? Number(label) : null;
      const setType = /\bWU\b/i.test(label) ? 'warmup' : 'working';

      for (let index = 0; index < count && expanded.length < exercise.targetSets; index++) {
        expanded.push({ label: label || 'Non specificata', reps: numericReps, setType });
      }
    }

    while (expanded.length < exercise.targetSets) {
      expanded.push({ label: 'Non specificata', reps: null, setType: 'working' });
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
