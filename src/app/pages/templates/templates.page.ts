import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  IonButton,
  IonCard,
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { TemplateExercise, WorkoutTemplate } from '../../models/workout.model';
import { WorkoutDataService } from '../../services/workout-data.service';

@Component({
  selector: 'app-templates-page',
  templateUrl: './templates.page.html',
  styleUrls: ['./templates.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonCard,
    IonButton,
  ],
})
export class TemplatesPage {
  private readonly workoutData = inject(WorkoutDataService);
  private readonly router = inject(Router);
  readonly templates = this.workoutData.getTemplates();
  readonly exercises = this.workoutData.getExercises();
  expandedWeeks = new Set<number>();
  expandedTemplateIds = new Set<string>();

  get programWeeks(): { week: number; templates: WorkoutTemplate[] }[] {
    const weeks = new Map<number, WorkoutTemplate[]>();
    for (const template of this.templates) {
      const week = this.weekNumber(template);
      if (week === null) {
        continue;
      }
      const weekTemplates = weeks.get(week) ?? [];
      weekTemplates.push(template);
      weeks.set(week, weekTemplates);
    }
    return [...weeks.entries()]
      .sort(([first], [second]) => first - second)
      .map(([week, templates]) => ({ week, templates }));
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

  exerciseNameFor(item: TemplateExercise): string {
    return this.exercises.find((exercise) => exercise.id === item.exerciseId)?.name ??
      'Esercizio non disponibile';
  }

  weekNumber(template: WorkoutTemplate): number | null {
    const match = /^week-(\d+)-day-\d+$/.exec(template.id);
    return match ? Number(match[1]) : null;
  }

  startWorkout(template: WorkoutTemplate): void {
    void this.router.navigate(['/workout'], { queryParams: { templateId: template.id } });
  }
}
