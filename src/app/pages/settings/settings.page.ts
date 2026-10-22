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
  IonList,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { AuthService } from '../../services/auth.service';
import { WorkoutDataService } from '../../services/workout-data.service';

@Component({
  selector: 'app-settings-page',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonHeader, IonToolbar, IonTitle, IonContent, IonCard, IonCardHeader, IonCardContent, IonButton, IonInput, IonItem, IonLabel],
})
export class SettingsPage {
  readonly auth = inject(AuthService);
  readonly data = inject(WorkoutDataService);
  private readonly router = inject(Router);

  email = '';
  password = '';
  loginMessage = '';
  isSubmitting = false;

  async signIn(): Promise<void> {
    if (this.isSubmitting) {
      return;
    }

    this.isSubmitting = true;
    this.loginMessage = '';

    try {
      const response = await this.auth.signIn(this.email.trim(), this.password);
      this.loginMessage = response.message;

      if (response.success) {
        await this.router.navigateByUrl('/home');
      }
    } catch (error) {
      this.loginMessage = error instanceof Error
        ? `Errore durante l'accesso: ${error.message}`
        : 'Errore imprevisto durante l\'accesso.';
    } finally {
      this.isSubmitting = false;
    }
  }

  async signOut(): Promise<void> {
    if (this.isSubmitting) {
      return;
    }

    this.isSubmitting = true;
    try {
      await this.auth.signOut();
      this.loginMessage = 'Utente disconnesso';
    } catch (error) {
      this.loginMessage = error instanceof Error
        ? `Errore durante la disconnessione: ${error.message}`
        : 'Errore imprevisto durante la disconnessione.';
    } finally {
      this.isSubmitting = false;
    }
  }

}
