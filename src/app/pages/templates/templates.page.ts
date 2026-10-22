import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonLabel,
  IonSearchbar,
  IonSelect,
  IonSelectOption,
  IonTextarea,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { LoadMode, TemplateExercise, WorkoutTemplate } from '../../models/workout.model';
import { WorkoutDataService } from '../../services/workout-data.service';

@Component({
  selector: 'app-templates-page',
  templateUrl: './templates.page.html',
  styleUrls: ['./templates.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonHeader, IonToolbar, IonTitle, IonContent, IonCard, IonCardHeader, IonCardContent, IonButton, IonInput, IonItem, IonLabel, IonSearchbar, IonSelect, IonSelectOption, IonTextarea],
})
export class TemplatesPage {
  private readonly workoutData = inject(WorkoutDataService);
  private readonly router = inject(Router);

  templates = this.workoutData.getTemplates();
  exercises = this.workoutData.getExercises();
  templateName = 'Push day personalizzato';
  templateDescription = '';
  exerciseSearch = '';
  selectedTemplateId = this.templates[0]?.id ?? '';
  selectedArchiveExerciseId = '';
  exerciseName = '';
  exerciseMuscleGroup = '';
  exerciseEquipment = '';
  exerciseLoadMode: LoadMode = 'other';
  formMessage = '';
  expandedWeeks = new Set<number>();
  expandedTemplateIds = new Set<string>();

  readonly loadModes: { value: LoadMode; label: string }[] = [
    { value: 'barbell', label: 'Per manubrio / bilanciere' },
    { value: 'unilateral', label: 'Per lato' },
    { value: 'total', label: 'Carico totale' },
    { value: 'bodyweight', label: 'Corpo libero' },
    { value: 'other', label: 'Altro' },
  ];

  get filteredExercises() {
    const query = this.exerciseSearch.trim().toLowerCase();
    if (!query) {
      return this.exercises;
    }

    return this.exercises.filter((exercise) => exercise.name.toLowerCase().includes(query) || exercise.muscleGroup.toLowerCase().includes(query));
  }

  get programWeeks(): { week: number; templates: WorkoutTemplate[] }[] {
    const weeks = new Map<number, WorkoutTemplate[]>();
    for (const template of this.templates) {
      const week = this.weekNumber(template);
      if (week === null) {
        continue;
      }
      const templates = weeks.get(week) ?? [];
      templates.push(template);
      weeks.set(week, templates);
    }
    return [...weeks.entries()]
      .sort(([weekA], [weekB]) => weekA - weekB)
      .map(([week, templates]) => ({ week, templates }));
  }

  get personalTemplates(): WorkoutTemplate[] {
    return this.templates.filter((template) => this.weekNumber(template) === null);
  }

  toggleWeek(week: number): void {
    const expandedWeeks = new Set(this.expandedWeeks);
    if (expandedWeeks.has(week)) {
      expandedWeeks.delete(week);
      for (const template of this.programWeeks.find((item) => item.week === week)?.templates ?? []) {
        this.expandedTemplateIds.delete(template.id);
      }
    } else {
      expandedWeeks.add(week);
    }
    this.expandedWeeks = expandedWeeks;
    this.expandedTemplateIds = new Set(this.expandedTemplateIds);
  }

  toggleTemplate(templateId: string): void {
    const expandedTemplates = new Set(this.expandedTemplateIds);
    if (expandedTemplates.has(templateId)) {
      expandedTemplates.delete(templateId);
    } else {
      expandedTemplates.add(templateId);
    }
    this.expandedTemplateIds = expandedTemplates;
  }

  createTemplate(): void {
    try {
      const template = this.workoutData.createTemplate(this.templateName, this.templateDescription);
      this.selectedTemplateId = template.id;
      this.templateName = '';
      this.templateDescription = '';
      this.refreshData();
      this.formMessage = `Scheda "${template.name}" creata.`;
    } catch (error) {
      this.formMessage = error instanceof Error ? error.message : 'Impossibile creare la scheda.';
    }
  }

  createExercise(): void {
    try {
      const exercise = this.workoutData.createExercise(
        this.exerciseName,
        this.exerciseMuscleGroup,
        this.exerciseEquipment,
        this.exerciseLoadMode,
      );
      this.workoutData.addExerciseToTemplate(this.selectedTemplateId, exercise.id);
      this.selectedArchiveExerciseId = exercise.id;
      this.exerciseName = '';
      this.exerciseMuscleGroup = '';
      this.exerciseEquipment = '';
      this.refreshData();
      this.formMessage = `Esercizio "${exercise.name}" aggiunto alla scheda selezionata.`;
    } catch (error) {
      this.formMessage = error instanceof Error ? error.message : 'Impossibile creare l’esercizio.';
    }
  }

  addExistingExercise(): void {
    if (!this.selectedTemplateId || !this.selectedArchiveExerciseId) {
      return;
    }

    try {
      this.workoutData.addExerciseToTemplate(this.selectedTemplateId, this.selectedArchiveExerciseId);
      this.refreshData();
      this.formMessage = 'Esercizio aggiunto alla scheda.';
    } catch (error) {
      this.formMessage = error instanceof Error ? error.message : 'Impossibile aggiungere l’esercizio.';
    }
  }

  updateExercise(templateId: string, item: TemplateExercise, field: 'targetSets' | 'targetReps' | 'restSeconds', value: unknown): void {
    try {
      if (field === 'targetReps') {
        this.workoutData.updateTemplateExercise(templateId, item.id, { targetReps: String(value ?? '') });
      } else {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) {
          return;
        }
        this.workoutData.updateTemplateExercise(templateId, item.id, { [field]: parsed });
      }
    } catch (error) {
      this.formMessage = error instanceof Error ? error.message : 'Impossibile aggiornare la scheda.';
    }
  }

  removeExercise(templateId: string, itemId: string): void {
    try {
      this.workoutData.removeExerciseFromTemplate(templateId, itemId);
      this.refreshData();
      this.formMessage = 'Esercizio rimosso dalla scheda.';
    } catch (error) {
      this.formMessage = error instanceof Error ? error.message : 'Impossibile rimuovere l’esercizio.';
    }
  }

  exerciseNameFor(item: TemplateExercise): string {
    return this.exercises.find((exercise) => exercise.id === item.exerciseId)?.name ?? 'Esercizio non disponibile';
  }

  weekNumber(template: WorkoutTemplate): number | null {
    const match = /^week-(\d+)-day-\d+$/.exec(template.id);
    return match ? Number(match[1]) : null;
  }

  startWorkout(template: WorkoutTemplate): void {
    void this.router.navigate(['/workout'], { queryParams: { templateId: template.id } });
  }

  private refreshData(): void {
    this.templates = this.workoutData.getTemplates();
    this.exercises = this.workoutData.getExercises();
  }
}
